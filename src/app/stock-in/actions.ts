'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface StockInItemInput {
  productId: string;
  quantity: number;
}

export async function getStockInHistory() {
  try {
    const transactions = await prisma.stockTransaction.findMany({
      where: { type: 'STOCK_IN' },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return transactions;
  } catch (error) {
    console.error('Error fetching stock in history:', error);
    return [];
  }
}

export async function submitStockInBatch(items: StockInItemInput[], freightCost: number = 0, notes?: string) {
  try {
    if (!items || items.length === 0) {
      return { success: false, error: 'Silakan pilih setidaknya 1 produk untuk restok.' };
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      return { success: false, error: 'Kuantitas restok harus lebih dari 0.' };
    }

    let totalPcs = 0;
    const poFulfillmentNotes: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        totalPcs += item.quantity;

        // 1. Update Physical Stock
        const updatedProd = await tx.product.update({
          where: { id: item.productId },
          data: {
            physicalStock: { increment: item.quantity },
          },
        });

        // 2. Auto-Allocate to Waiting Pre-Orders (FIFO: oldest PO first)
        let remainingQty = item.quantity;

        const waitingPoItems = await tx.preOrderItem.findMany({
          where: {
            OR: [
              { productId: item.productId },
              { productSku: updatedProd.sku },
            ],
            preOrder: {
              status: { in: ['WAITING_STOCK', 'PARTIAL_READY'] },
            },
          },
          include: {
            preOrder: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        for (const poItem of waitingPoItems) {
          if (remainingQty <= 0) break;

          const neededQty = poItem.quantityOrdered - poItem.quantityFulfilled;
          if (neededQty <= 0) continue;

          const allocateQty = Math.min(remainingQty, neededQty);
          const newFulfilled = poItem.quantityFulfilled + allocateQty;
          remainingQty -= allocateQty;

          // Update PreOrderItem fulfilled quantity
          await tx.preOrderItem.update({
            where: { id: poItem.id },
            data: {
              quantityFulfilled: newFulfilled,
              productId: item.productId, // ensure linked
            },
          });

          // Reserve stock for this PO
          await tx.product.update({
            where: { id: item.productId },
            data: {
              reservedStock: { increment: allocateQty },
            },
          });

          poFulfillmentNotes.push(
            `+${allocateQty} pcs untuk PO #${poItem.preOrder.poNumber} (${poItem.preOrder.customerName})`
          );

          // Check if the entire PO is now ready or partially ready
          const siblingItems = await tx.preOrderItem.findMany({
            where: { preOrderId: poItem.preOrderId },
          });

          const isAllReady = siblingItems.every(
            (s) => (s.id === poItem.id ? newFulfilled : s.quantityFulfilled) >= s.quantityOrdered
          );

          await tx.preOrder.update({
            where: { id: poItem.preOrderId },
            data: {
              status: isAllReady ? 'READY' : 'PARTIAL_READY',
            },
          });
        }

        // 3. Log Stock Transaction
        const poNoteSnippet = poFulfillmentNotes.length > 0 ? ` [Alokasi PO: ${poFulfillmentNotes.join(', ')}]` : '';
        await tx.stockTransaction.create({
          data: {
            productId: item.productId,
            type: 'STOCK_IN',
            quantity: item.quantity,
            notes: (notes ? `${notes}` : `Restok kedatangan (${item.quantity} pcs ${updatedProd.sku})`) + poNoteSnippet,
          },
        });
      }

      // 4. Auto Log Freight-In Expense to Finance
      if (freightCost > 0) {
        await tx.financeTransaction.create({
          data: {
            type: 'EXPENSE',
            category: 'ONG_KIR_RESTOK',
            amount: Math.max(0, Math.floor(freightCost)),
            description: `Biaya Ongkir Restok Batch (${validItems.length} SKU / ${totalPcs} pcs)`,
          },
        });
      }
    });

    revalidatePath('/stock-in');
    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');

    return {
      success: true,
      totalPcs,
      poAllocations: poFulfillmentNotes,
    };
  } catch (error: any) {
    console.error('Error submitting stock in batch:', error);
    return { success: false, error: error.message || 'Gagal menyimpan restok barang.' };
  }
}
