'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getZiplockStock() {
  try {
    let ziplock = await prisma.ziplockStock.findFirst();
    if (!ziplock) {
      ziplock = await prisma.ziplockStock.create({
        data: {
          name: 'Ziplock Packaging Hijab',
          stock: 100,
          unitCost: 700,
        },
      });
    }
    return ziplock;
  } catch (error) {
    console.error('Error fetching ziplock stock:', error);
    return null;
  }
}

export async function addZiplockStock(quantity: number, totalPrice: number) {
  try {
    const qty = Math.max(1, Math.floor(quantity));
    const price = Math.max(0, Math.floor(totalPrice));
    const unitCost = Math.round(price / qty);

    let ziplock = await prisma.ziplockStock.findFirst();
    if (!ziplock) {
      ziplock = await prisma.ziplockStock.create({
        data: {
          name: 'Ziplock Packaging Hijab',
          stock: qty,
          unitCost,
        },
      });
    } else {
      await prisma.ziplockStock.update({
        where: { id: ziplock.id },
        data: {
          stock: { increment: qty },
          unitCost,
        },
      });
    }

    // Auto-record to Finance Expense
    if (price > 0) {
      await prisma.financeTransaction.create({
        data: {
          type: 'EXPENSE',
          category: 'ZIPLOCK',
          amount: price,
          description: `Pembelian Kemasan Ziplock (${qty} pcs @ Rp ${unitCost.toLocaleString('id-ID')}/pcs)`,
        },
      });
    }

    revalidatePath('/packaging');
    revalidatePath('/finance');
    revalidatePath('/orders');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error adding ziplock stock:', error);
    return { success: false, error: error.message || 'Gagal memperbarui stok ziplock.' };
  }
}
