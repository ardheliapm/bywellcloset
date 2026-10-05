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

export interface PaidOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  paidAt: Date | null;
  totalAmount: number;
  totalQty: number;
  totalCOGS: number;
  grossProfit: number;
  itemsSummary: string;
}

export interface FinanceSummaryData {
  totalIncome: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  todayIncome?: number;
  todayCOGS?: number;
  todayGrossProfit?: number;
  todayExpenses?: number;
  todayNetProfit?: number;
  transactions: FinanceTransactionRecord[];
  paidOrders: PaidOrderSummary[];
  availableYears: number[];
}

export async function getFinanceSummary(month?: number, year?: number): Promise<FinanceSummaryData> {
  try {
    const selectedYear = year || new Date().getFullYear();
    const isAllMonths = month === 0;
    const isToday = month === -1;

    let startDate: Date;
    let endDate: Date;

    if (isToday) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (isAllMonths) {
      startDate = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
      endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    } else {
      const selectedMonth = month !== undefined && month > 0 ? month : new Date().getMonth() + 1; // 1-12
      startDate = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
      endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
    }

    // 1. Fetch Finance Transactions for this period
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

    // 3. Calculate Total COGS (HPP Terjual) from Orders paid/shipped in this period
    const paidOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'SHIPPED'] },
        paidAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { items: true },
      orderBy: { paidAt: 'desc' },
    });

    let totalCOGS = 0;
    const paidOrdersSummary: PaidOrderSummary[] = paidOrders.map((order) => {
      let orderCOGS = 0;
      let orderQty = 0;
      const itemsList: string[] = [];

      order.items.forEach((item) => {
        const itemHpp = item.costPrice > 0 ? item.costPrice : 20000;
        orderCOGS += itemHpp * item.quantity;
        orderQty += item.quantity;
        itemsList.push(`${item.productName} (${item.quantity} pcs)`);
      });

      totalCOGS += orderCOGS;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        paidAt: order.paidAt,
        totalAmount: order.totalAmount,
        totalQty: orderQty,
        totalCOGS: orderCOGS,
        grossProfit: order.totalAmount - orderCOGS,
        itemsSummary: itemsList.join(', '),
      };
    });

    const grossProfit = totalIncome - totalCOGS;
    const netProfit = grossProfit - totalExpenses;

    // 4. Calculate today's real-time metrics
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [todayTxs, todayPaidOrders] = await Promise.all([
      prisma.financeTransaction.findMany({
        where: { transactionDate: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.order.findMany({
        where: {
          status: { in: ['PAID', 'SHIPPED'] },
          paidAt: { gte: todayStart, lte: todayEnd },
        },
        include: { items: true },
      }),
    ]);

    let todayIncome = 0;
    let todayExpenses = 0;
    todayTxs.forEach((t) => {
      if (t.type === 'INCOME') todayIncome += t.amount;
      else if (t.type === 'EXPENSE') todayExpenses += t.amount;
    });

    let todayCOGS = 0;
    todayPaidOrders.forEach((o) => {
      o.items.forEach((it) => {
        const itemHpp = it.costPrice > 0 ? it.costPrice : 20000;
        todayCOGS += itemHpp * it.quantity;
      });
    });

    const todayGrossProfit = todayIncome - todayCOGS;
    const todayNetProfit = todayGrossProfit - todayExpenses;

    // 5. Fetch dynamic available years from database timestamp
    const [txDates, orderDates] = await Promise.all([
      prisma.financeTransaction.findMany({
        select: { transactionDate: true },
      }),
      prisma.order.findMany({
        where: { status: { in: ['PAID', 'SHIPPED'] } },
        select: { paidAt: true, createdAt: true },
      }),
    ]);

    const yearsSet = new Set<number>();
    const currentYear = new Date().getFullYear();
    yearsSet.add(currentYear);
    yearsSet.add(currentYear + 1);
    yearsSet.add(currentYear - 1);
    yearsSet.add(selectedYear);

    txDates.forEach((t) => {
      if (t.transactionDate) yearsSet.add(new Date(t.transactionDate).getFullYear());
    });

    orderDates.forEach((o) => {
      if (o.paidAt) yearsSet.add(new Date(o.paidAt).getFullYear());
      if (o.createdAt) yearsSet.add(new Date(o.createdAt).getFullYear());
    });

    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    return {
      totalIncome,
      totalCOGS,
      grossProfit,
      totalExpenses,
      netProfit,
      todayIncome,
      todayCOGS,
      todayGrossProfit,
      todayExpenses,
      todayNetProfit,
      transactions,
      paidOrders: paidOrdersSummary,
      availableYears,
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
      paidOrders: [],
      availableYears: [new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1],
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
