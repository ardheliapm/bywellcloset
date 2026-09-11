import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

const EXPECTED_API_KEY = process.env.API_KEY || 'bywell_secret_key_2026';

export async function POST(request: Request) {
  try {
    const apiKeyHeader = request.headers.get('x-api-key');
    if (apiKeyHeader !== EXPECTED_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid x-api-key' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderNumber, orderId, status } = body;

    const targetStatus = String(status || '').toUpperCase();
    if (!['HOLD', 'PAID', 'SHIPPED', 'CANCELLED'].includes(targetStatus)) {
      return NextResponse.json(
        { success: false, error: 'Status tidak valid. Harus HOLD, PAID, SHIPPED, atau CANCELLED.' },
        { status: 400 }
      );
    }

    // Find Order
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          ...(orderId ? [{ id: String(orderId) }] : []),
          ...(orderNumber ? [{ orderNumber: String(orderNumber).trim() }] : []),
        ],
      },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order tidak ditemukan.' },
        { status: 404 }
      );
    }

    const oldStatus = order.status;
    if (oldStatus === targetStatus) {
      return NextResponse.json({
        success: true,
        message: `Status order sudah ${targetStatus}.`,
        data: order,
      });
    }

    await prisma.$transaction(async (tx) => {
      // If changing to PAID from HOLD
      if (targetStatus === 'PAID' && oldStatus === 'HOLD') {
        let totalItemsQty = 0;

        for (const item of order.items) {
          totalItemsQty += item.quantity;
          if (item.productId) {
            // Deduct physicalStock & reservedStock
            await tx.product.update({
              where: { id: item.productId },
              data: {
                physicalStock: { decrement: item.quantity },
                reservedStock: { decrement: item.quantity },
              },
            });

            // Log StockTransaction
            await tx.stockTransaction.create({
              data: {
                productId: item.productId,
                type: 'OUT',
                quantity: item.quantity,
                notes: `Penjualan Order #${order.orderNumber}`,
              },
            });
          }
        }

        // Deduct Ziplock stock
        const ziplock = await tx.ziplockStock.findFirst();
        if (ziplock && totalItemsQty > 0) {
          await tx.ziplockStock.update({
            where: { id: ziplock.id },
            data: { stock: { decrement: totalItemsQty } },
          });

          // Log Ziplock Expense
          const ziplockExpenseAmount = totalItemsQty * ziplock.unitCost;
          await tx.financeTransaction.create({
            data: {
              type: 'EXPENSE',
              category: 'ZIPLOCK',
              amount: ziplockExpenseAmount,
              description: `Penggunaan ${totalItemsQty} Pcs Ziplock untuk Order #${order.orderNumber}`,
              referenceId: order.id,
            },
          });
        }

        // Log Income Finance Transaction
        await tx.financeTransaction.create({
          data: {
            type: 'INCOME',
            category: 'SALES',
            amount: order.totalAmount,
            description: `Penjualan Lunas Order #${order.orderNumber} (${order.customerName})`,
            referenceId: order.id,
          },
        });
      }
      // If changing to CANCELLED from HOLD
      else if (targetStatus === 'CANCELLED' && oldStatus === 'HOLD') {
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                reservedStock: { decrement: item.quantity },
              },
            });
          }
        }
      }

      // Update Order Status
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: targetStatus,
          ...(targetStatus === 'PAID' ? { paidAt: new Date() } : {}),
          ...(targetStatus === 'SHIPPED' ? { shippedAt: new Date() } : {}),
        },
      });
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/packaging');
    revalidatePath('/');

    return NextResponse.json({
      success: true,
      message: `Status order #${order.orderNumber} berhasil diubah dari ${oldStatus} menjadi ${targetStatus}.`,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        oldStatus,
        newStatus: targetStatus,
      },
    });
  } catch (error: any) {
    console.error('Error updating order status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
