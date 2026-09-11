'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  status: string; // HOLD, PAID, SHIPPED, CANCELLED
  totalAmount: number;
  notes: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRecord[];
}

export async function getOrders(): Promise<OrderRecord[]> {
  try {
    const orders = await prisma.order.findMany({
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

// 1. Mark Order as Paid (Potong stok fisik resmi & lepas hold stock)
export async function markOrderAsPaid(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status !== 'HOLD') {
      return { success: false, error: `Order tidak dalam status HOLD (status saat ini: ${order.status})` };
    }

    // Run transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update Order status to PAID
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      let totalHijabQty = 0;

      // 2. Reduce physicalStock and release reservedStock
      for (const item of order.items) {
        totalHijabQty += item.quantity;
        if (item.productId) {
          const prod = await tx.product.findUnique({
            where: { id: item.productId },
            select: { costPrice: true },
          });

          if (prod) {
            // Snapshot costPrice
            await tx.orderItem.update({
              where: { id: item.id },
              data: { costPrice: prod.costPrice || 0 },
            });
          }

          await tx.product.update({
            where: { id: item.productId },
            data: {
              physicalStock: { decrement: item.quantity },
              reservedStock: { decrement: item.quantity },
            },
          });

          // Log to stock_transactions
          await tx.stockTransaction.create({
            data: {
              productId: item.productId,
              type: 'ADJUSTMENT_OUT',
              quantity: item.quantity,
              notes: `Penjualan Order #${order.orderNumber} (${order.customerName})`,
            },
          });
        }
      }

      // 3. Deduct Ziplock stock (1 ziplock per hijab item)
      if (totalHijabQty > 0) {
        const ziplock = await tx.ziplockStock.findFirst();
        if (ziplock && ziplock.stock > 0) {
          await tx.ziplockStock.update({
            where: { id: ziplock.id },
            data: {
              stock: Math.max(0, ziplock.stock - totalHijabQty),
            },
          });
        }
      }

      // 4. Record Finance Income Transaction
      await tx.financeTransaction.create({
        data: {
          type: 'INCOME',
          category: 'SALES',
          amount: order.totalAmount,
          description: `Penjualan Lunas Order #${order.orderNumber} (${order.customerName})`,
          referenceId: order.orderNumber,
        },
      });
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/packaging');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error marking order as paid:', error);
    return { success: false, error: error.message || 'Gagal mengubah status pesanan ke PAID' };
  }
}

// 2. Mark Order as Shipped
export async function markOrderAsShipped(orderId: string) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        shippedAt: new Date(),
      },
    });

    revalidatePath('/orders');
    return { success: true };
  } catch (error: any) {
    console.error('Error marking order as shipped:', error);
    return { success: false, error: error.message || 'Gagal mengubah status pesanan ke SHIPPED' };
  }
}

// 3. Cancel Order (Lepas stok hold jika sebelumnya HOLD)
export async function cancelOrder(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status === 'CANCELLED') {
      return { success: false, error: 'Order sudah dibatalkan sebelumnya' };
    }

    await prisma.$transaction(async (tx) => {
      // If was HOLD, release reserved stock
      if (order.status === 'HOLD') {
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
      } else if (order.status === 'PAID' || order.status === 'SHIPPED') {
        // If was PAID or SHIPPED, restore physical stock
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                physicalStock: { increment: item.quantity },
              },
            });

            await tx.stockTransaction.create({
              data: {
                productId: item.productId,
                type: 'ADJUSTMENT_IN',
                quantity: item.quantity,
                notes: `Pembatalan Order #${order.orderNumber} (${order.customerName})`,
              },
            });
          }
        }
      }

      // Update status
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
        },
      });
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error cancelling order:', error);
    return { success: false, error: error.message || 'Gagal membatalkan pesanan' };
  }
}

// 4. Delete Order (Hapus order secara permanen, syarat: status harus CANCELLED)
export async function deleteOrder(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status !== 'CANCELLED') {
      return {
        success: false,
        error: 'Hanya pesanan yang berstatus Dibatalkan (CANCELLED) yang dapat dihapus dari sistem.',
      };
    }

    // Delete order (OrderItems cascade delete automatically)
    await prisma.order.delete({
      where: { id: orderId },
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting order:', error);
    return { success: false, error: error.message || 'Gagal menghapus pesanan' };
  }
}

