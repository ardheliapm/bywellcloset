'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface MotifPerformanceItem {
  id: string;
  motifName: string;
  purchaseCost: number;
  purchaseDate: Date;
  notes: string | null;
  totalSold: number;
  avgMargin: number;
  bepTargetUnits: number;
  bepProgressPercent: number;
  totalRevenue: number;
  netProfit: number;
  isBEPAchieved: boolean;
}

export async function getMotifPerformance(): Promise<MotifPerformanceItem[]> {
  try {
    const motifAssets = await prisma.motifAsset.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const products = await prisma.product.findMany({
      select: {
        id: true,
        motif: true,
        sellingPrice: true,
        costPrice: true,
      },
    });

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: ['HOLD', 'PAID', 'SHIPPED'] },
        },
      },
      select: {
        productId: true,
        quantity: true,
        price: true,
        costPrice: true,
        product: {
          select: { motif: true },
        },
      },
    });

    const result: MotifPerformanceItem[] = [];

    for (const asset of motifAssets) {
      // Find all items sold matching this motif name
      const matchingItems = orderItems.filter(
        (item) => item.product?.motif?.toLowerCase() === asset.motifName.toLowerCase()
      );

      const totalSold = matchingItems.reduce((acc, item) => acc + item.quantity, 0);

      // Estimate margin per pcs (default selling ~36k - cost ~20k = 16k margin)
      let totalRevenue = 0;
      let totalCost = 0;

      matchingItems.forEach((item) => {
        totalRevenue += item.price * item.quantity;
        totalCost += (item.costPrice || 20000) * item.quantity;
      });

      const avgSellingPrice = totalSold > 0 ? totalRevenue / totalSold : 36000;
      const avgCostPrice = totalSold > 0 ? totalCost / totalSold : 20000;
      const avgMargin = Math.max(5000, avgSellingPrice - avgCostPrice);

      const bepTargetUnits = Math.ceil(asset.purchaseCost / avgMargin);
      const bepProgressPercent = bepTargetUnits > 0 ? Math.min(100, Math.round((totalSold / bepTargetUnits) * 100)) : 100;
      const netProfit = totalRevenue - totalCost - asset.purchaseCost;
      const isBEPAchieved = totalSold >= bepTargetUnits;

      result.push({
        id: asset.id,
        motifName: asset.motifName,
        purchaseCost: asset.purchaseCost,
        purchaseDate: asset.purchaseDate,
        notes: asset.notes,
        totalSold,
        avgMargin,
        bepTargetUnits,
        bepProgressPercent,
        totalRevenue,
        netProfit,
        isBEPAchieved,
      });
    }

    return result;
  } catch (error) {
    console.error('Error fetching motif performance:', error);
    return [];
  }
}

export async function addMotifAsset(motifName: string, purchaseCost: number, notes?: string) {
  try {
    const nameClean = motifName.trim();
    const cost = Math.max(0, Math.floor(purchaseCost));

    if (!nameClean) {
      return { success: false, error: 'Nama Motif wajib diisi.' };
    }

    const existing = await prisma.motifAsset.findFirst({
      where: { motifName: { equals: nameClean } },
    });

    if (existing) {
      return { success: false, error: `Motif "${nameClean}" sudah terdaftar sebagai aset.` };
    }

    const newAsset = await prisma.motifAsset.create({
      data: {
        motifName: nameClean,
        purchaseCost: cost,
        notes: notes?.trim() || null,
      },
    });

    // Auto record to Finance Expense
    if (cost > 0) {
      await prisma.financeTransaction.create({
        data: {
          type: 'EXPENSE',
          category: 'MOTIF',
          amount: cost,
          description: `Pembelian Aset Desain Motif "${nameClean}"`,
        },
      });
    }

    revalidatePath('/motif-analysis');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error adding motif asset:', error);
    return { success: false, error: error.message || 'Gagal mendaftarkan aset motif.' };
  }
}

export async function updateMotifAsset(id: string, motifName: string, purchaseCost: number, notes?: string) {
  try {
    const nameClean = motifName.trim();
    const cost = Math.max(0, Math.floor(purchaseCost));

    if (!nameClean) {
      return { success: false, error: 'Nama Motif wajib diisi.' };
    }

    const current = await prisma.motifAsset.findUnique({ where: { id } });
    if (!current) {
      return { success: false, error: 'Aset Motif tidak ditemukan.' };
    }

    await prisma.motifAsset.update({
      where: { id },
      data: {
        motifName: nameClean,
        purchaseCost: cost,
        notes: notes?.trim() || null,
      },
    });

    // Also update corresponding finance transaction if any
    const financeTx = await prisma.financeTransaction.findFirst({
      where: {
        category: 'MOTIF',
        description: { contains: current.motifName },
      },
    });

    if (financeTx) {
      await prisma.financeTransaction.update({
        where: { id: financeTx.id },
        data: {
          amount: cost,
          description: `Pembelian Aset Desain Motif "${nameClean}"`,
        },
      });
    }

    revalidatePath('/motif-analysis');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating motif asset:', error);
    return { success: false, error: error.message || 'Gagal mengubah aset motif.' };
  }
}

export async function deleteMotifAsset(id: string) {
  try {
    const current = await prisma.motifAsset.findUnique({ where: { id } });
    if (!current) {
      return { success: false, error: 'Aset Motif tidak ditemukan.' };
    }

    await prisma.motifAsset.delete({
      where: { id },
    });

    // Delete corresponding finance transaction if any
    const financeTx = await prisma.financeTransaction.findFirst({
      where: {
        category: 'MOTIF',
        description: { contains: current.motifName },
      },
    });

    if (financeTx) {
      await prisma.financeTransaction.delete({
        where: { id: financeTx.id },
      });
    }

    revalidatePath('/motif-analysis');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting motif asset:', error);
    return { success: false, error: error.message || 'Gagal menghapus aset motif.' };
  }
}
