'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface FinanceTransactionRecord {
  id: string;
  type: string; // INCOME, EXPENSE
  category: string; // ONG_KIR_RESTOK, ZIPLOCK, MOTIF, SALARY, SALES, OPERATIONAL, OTHER
  amount: number;
  description: string;
  transactionDate: Date;
  referenceId: string | null;
  createdAt: Date;
}

export interface FinanceSummaryData {
  totalIncome: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  transactions: FinanceTransactionRecord[];
}

export async function getFinanceSummary(month?: number, year?: number): Promise<FinanceSummaryData> {
  try {
    const selectedYear = year || new Date().getFullYear();
    const selectedMonth = month !== undefined ? month : new Date().getMonth() + 1; // 1-12

    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

    // 1. Fetch Finance Transactions for this month
    const transactions = await prisma.financeTransaction.findMany({
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { transactionDate: 'desc' },
    });

    // 2. Calculate Total Income & Expenses from Finance Transactions
    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'INCOME') {
        totalIncome += tx.amount;
      } else if (tx.type === 'EXPENSE') {
        totalExpenses += tx.amount;
      }
    });

    // 3. Calculate Total COGS (HPP Terjual) from Orders paid/shipped in this month
    const paidOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'SHIPPED'] },
        paidAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { items: true },
    });

    let totalCOGS = 0;
    paidOrders.forEach((order) => {
      order.items.forEach((item) => {
        const itemHpp = item.costPrice > 0 ? item.costPrice : 20000;
        totalCOGS += itemHpp * item.quantity;
      });
    });

    const grossProfit = totalIncome - totalCOGS;
    const netProfit = grossProfit - totalExpenses;

    return {
      totalIncome,
      totalCOGS,
      grossProfit,
      totalExpenses,
      netProfit,
      transactions,
    };
  } catch (error) {
    console.error('Error fetching finance summary:', error);
    return {
      totalIncome: 0,
      totalCOGS: 0,
      grossProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      transactions: [],
    };
  }
}

export async function addFinanceTransaction(data: {
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  description: string;
  transactionDate?: Date;
}) {
  try {
    const amountClean = Math.max(0, Math.floor(data.amount || 0));
    const descClean = data.description.trim();

    if (amountClean <= 0) {
      return { success: false, error: 'Nominal transaksi harus lebih dari 0.' };
    }

    if (!descClean) {
      return { success: false, error: 'Keterangan transaksi wajib diisi.' };
    }

    await prisma.financeTransaction.create({
      data: {
        type: data.type,
        category: data.category || 'OTHER',
        amount: amountClean,
        description: descClean,
        transactionDate: data.transactionDate || new Date(),
      },
    });

    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error adding finance transaction:', error);
    return { success: false, error: error.message || 'Gagal menyimpan transaksi.' };
  }
}

export async function updateFinanceTransaction(id: string, data: {
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  description: string;
}) {
  try {
    const amountClean = Math.max(0, Math.floor(data.amount || 0));
    const descClean = data.description.trim();

    if (amountClean <= 0) {
      return { success: false, error: 'Nominal transaksi harus lebih dari 0.' };
    }

    if (!descClean) {
      return { success: false, error: 'Keterangan transaksi wajib diisi.' };
    }

    await prisma.financeTransaction.update({
      where: { id },
      data: {
        type: data.type,
        category: data.category || 'OTHER',
        amount: amountClean,
        description: descClean,
      },
    });

    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating finance transaction:', error);
    return { success: false, error: error.message || 'Gagal mengubah transaksi.' };
  }
}

export async function deleteFinanceTransaction(id: string) {
  try {
    await prisma.financeTransaction.delete({
      where: { id },
    });

    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting finance transaction:', error);
    return { success: false, error: error.message || 'Gagal menghapus transaksi.' };
  }
}
