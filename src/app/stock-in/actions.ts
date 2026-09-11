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

        // 2. Log Stock Transaction
        await tx.stockTransaction.create({
          data: {
            productId: item.productId,
            type: 'STOCK_IN',
            quantity: item.quantity,
            notes: notes || `Restok manual (${item.quantity} pcs ${updatedProd.sku})`,
          },
        });
      }

      // 3. Auto Log Freight-In Expense to Finance
      if (freightCost > 0) {
        await tx.financeTransaction.create({
          data: {
            type: 'EXPENSE',
            category: 'ONG_KIR_RESTOK',
            amount: Math.max(0, Math.floor(freightCost)),
            description: `Biaya Ongkir Restok Batch Manual (${validItems.length} SKU / ${totalPcs} pcs)`,
          },
        });
      }
    });

    revalidatePath('/stock-in');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true, totalPcs };
  } catch (error: any) {
    console.error('Error submitting stock in batch:', error);
    return { success: false, error: error.message || 'Gagal menyimpan restok barang.' };
  }
}
