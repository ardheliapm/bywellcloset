import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  Package,
  ShoppingBag,
  Clock,
  DollarSign,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  Boxes,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard - Bywell Closet Inventory',
  description: 'Ringkasan Real-Time Stok, Order, Pre-Order, dan Laba Rugi',
};

export default async function DashboardPage() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Fetch all dashboard stats in parallel
  const [
    products,
    allOrders,
    todayOrders,
    preOrders,
    todayFinanceTransactions,
    monthFinanceTransactions,
    recentOrders,
    recentPreOrders,
  ] = await Promise.all([
    // 1. Products
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        motif: true,
        physicalStock: true,
        reservedStock: true,
        sellingPrice: true,
        costPrice: true,
      },
    }),

    // 2. All Orders
    prisma.order.findMany({
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
    }),

    // 3. Today's Orders
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
      },
    }),

    // 4. Pre-Orders
    prisma.preOrder.findMany({
      select: {
        id: true,
        poNumber: true,
        customerName: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        items: {
          select: {
            quantityOrdered: true,
            quantityFulfilled: true,
            quantityShipped: true,
          },
        },
      },
    }),

    // 5. Today's Finance Transactions
    prisma.financeTransaction.findMany({
      where: {
        transactionDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
    }),

    // 6. Month's Finance Transactions
    prisma.financeTransaction.findMany({
      where: {
        transactionDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    }),

    // 7. Recent 5 Orders
    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
      },
    }),

    // 8. Recent 5 Pre-Orders
    prisma.preOrder.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
      },
    }),
  ]);

  // Aggregate Product Stats
  const totalSku = products.length;
  const totalPhysicalStock = products.reduce((acc, p) => acc + p.physicalStock, 0);
  const totalReservedStock = products.reduce((acc, p) => acc + p.reservedStock, 0);
  const totalAvailableStock = Math.max(0, totalPhysicalStock - totalReservedStock);

  // Low stock products (available <= 3)
  const lowStockItems = products.filter(
    (p) => p.physicalStock - p.reservedStock <= 3
  );

  // Aggregate Order Stats
  const holdOrders = allOrders.filter((o) => o.status === 'HOLD');
  const paidOrders = allOrders.filter((o) => o.status === 'PAID' || o.status === 'SHIPPED');
  const totalOmsetAllTime = paidOrders.reduce((acc, o) => acc + o.totalAmount, 0);

  const holdOrdersTotalAmount = holdOrders.reduce((acc, o) => acc + o.totalAmount, 0);

  // Today Order Stats
  const todayPaidOrders = todayOrders.filter((o) => o.status === 'PAID' || o.status === 'SHIPPED');
  const todayOmset = todayPaidOrders.reduce((acc, o) => acc + o.totalAmount, 0);

  // Aggregate Pre-Order Stats
  const activePOs = preOrders.filter((po) => po.status !== 'CANCELLED' && po.status !== 'SHIPPED');
  const waitingPOPcs = activePOs.reduce((acc, po) => {
    return (
      acc +
      po.items.reduce((sub, it) => sub + Math.max(0, it.quantityOrdered - it.quantityFulfilled), 0)
    );
  }, 0);
  const readyToShipPOPcs = activePOs.reduce((acc, po) => {
    return (
      acc +
      po.items.reduce((sub, it) => sub + Math.max(0, it.quantityFulfilled - it.quantityShipped), 0)
    );
  }, 0);

  // Financial calculations for Today
  const todayIncome = todayFinanceTransactions
    .filter((t) => t.type === 'INCOME')
    .reduce((acc, t) => acc + t.amount, 0);
  const todayExpense = todayFinanceTransactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((acc, t) => acc + t.amount, 0);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Banner Welcome & Real-Time Pulse */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 rounded-2xl p-6 sm:p-7 text-white shadow-xl relative overflow-hidden border border-rose-900/30">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-radial from-rose-500/15 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs font-semibold mb-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Database Connected • {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Bywell Closet Inventory System
            </h1>
            <p className="text-rose-200/90 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Monitoring real-time pergerakan stok fisik, antrean hold WhatsApp, antrean Pre-Order konveksi, serta omset penjualan terverifikasi.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:self-start md:self-center">
            <Link
              href="/orders"
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" /> Kelola Order
            </Link>
            <Link
              href="/pre-orders"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-4 h-4" /> Antrean PO
            </Link>
          </div>
        </div>
      </div>

      {/* Main KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Master SKU & Stok Fisik */}
        <Link
          href="/products"
          className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all flex items-center justify-between group cursor-pointer"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Master Produk Aktif</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{totalSku} <span className="text-sm font-semibold text-slate-500">SKU</span></p>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
              <span>{totalPhysicalStock} pcs fisik</span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-600 font-bold">{totalAvailableStock} ready</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Package className="w-6 h-6" />
          </div>
        </Link>

        {/* Menunggu Bayar (Stok Hold) */}
        <Link
          href="/orders"
          className="bg-white p-5 rounded-2xl border border-amber-200/90 shadow-xs hover:border-amber-300 hover:shadow-md transition-all flex items-center justify-between group bg-gradient-to-br from-white to-amber-50/30 cursor-pointer"
        >
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Menunggu Bayar (Hold)</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{holdOrders.length} <span className="text-sm font-semibold text-amber-700/80">Order</span></p>
            <div className="text-xs text-amber-700/80 mt-1 flex items-center gap-1 font-semibold">
              <span>{formatRupiah(holdOrdersTotalAmount)}</span>
              <span className="text-amber-400">•</span>
              <span>{totalReservedStock} pcs hold</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
        </Link>

        {/* Antrean Pre-Order */}
        <Link
          href="/pre-orders"
          className="bg-white p-5 rounded-2xl border border-indigo-200/90 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between group bg-gradient-to-br from-white to-indigo-50/30 cursor-pointer"
        >
          <div>
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Antrean Pre-Order (PO)</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{activePOs.length} <span className="text-sm font-semibold text-indigo-700/80">PO</span></p>
            <div className="text-xs text-indigo-700/80 mt-1 flex items-center gap-1 font-semibold">
              <span className="text-amber-700">{waitingPOPcs} pcs nunggu</span>
              <span className="text-indigo-300">•</span>
              <span className="text-emerald-700">{readyToShipPOPcs} ready</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Boxes className="w-6 h-6" />
          </div>
        </Link>

        {/* Total Omset Penjualan */}
        <Link
          href="/finance"
          className="bg-white p-5 rounded-2xl border border-emerald-200/90 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all flex items-center justify-between group bg-gradient-to-br from-white to-emerald-50/30 cursor-pointer"
        >
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Omset Terverifikasi</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{formatRupiah(totalOmsetAllTime)}</p>
            <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1 font-semibold">
              <span>Hari ini: {formatRupiah(todayOmset)}</span>
              <span className="text-emerald-300">•</span>
              <span>{paidOrders.length} Lunas</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <DollarSign className="w-6 h-6" />
          </div>
        </Link>
      </div>

      {/* 2-Column Split: Recent Orders & Stock / PO Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent WhatsApp Orders */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Order WhatsApp Terbaru</h3>
                  <p className="text-[11px] text-slate-400">Transaksi order yang masuk ke sistem</p>
                </div>
              </div>
              <Link
                href="/orders"
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                Lihat Semua <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentOrders.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Belum ada order dicatat.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {recentOrders.map((ord) => {
                  const totalPcs = ord.items.reduce((acc, it) => acc + it.quantity, 0);
                  const isHold = ord.status === 'HOLD';
                  const isPaid = ord.status === 'PAID';
                  const isShipped = ord.status === 'SHIPPED';
                  const isCancelled = ord.status === 'CANCELLED';

                  return (
                    <div
                      key={ord.id}
                      className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            #{ord.orderNumber}
                          </span>
                          <span className="font-bold text-slate-800 truncate">
                            {ord.customerName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {ord.items.map((it) => `${it.productSku} (${it.quantity}x)`).join(', ')}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
                          {formatRupiah(ord.totalAmount)}
                        </div>
                        <div className="mt-1">
                          {isHold && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-2.5 h-2.5" /> Hold ({totalPcs} pcs)
                            </span>
                          )}
                          {isPaid && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Lunas
                            </span>
                          )}
                          {isShipped && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Truck className="w-2.5 h-2.5" /> Terkirim
                            </span>
                          )}
                          {isCancelled && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                              Batal
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pre-Orders Feed */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Antrean Pre-Order Terkini</h3>
                  <p className="text-[11px] text-slate-400">Status alokasi kedatangan stok konveksi</p>
                </div>
              </div>
              <Link
                href="/pre-orders"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                Lihat PO <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentPreOrders.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Belum ada antrean Pre-Order.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {recentPreOrders.map((po) => {
                  const totalPcs = po.items.reduce((acc, it) => acc + it.quantityOrdered, 0);
                  const fulfilledPcs = po.items.reduce((acc, it) => acc + it.quantityFulfilled, 0);

                  return (
                    <div
                      key={po.id}
                      className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px]">
                            #{po.poNumber}
                          </span>
                          <span className="font-bold text-slate-800 truncate">
                            {po.customerName}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {po.items.map((it) => `${it.productSku} (${it.quantityOrdered} pcs)`).join(', ')}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-800 text-xs">
                          {fulfilledPcs} / {totalPcs} pcs ready
                        </div>
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5 ml-auto">
                          <div
                            className="bg-indigo-600 h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (fulfilledPcs / (totalPcs || 1)) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Stock Alerts & Fast Shortcuts */}
        <div className="space-y-4">
          {/* Stock Alerts Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Peringatan Stok Menipis
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {lowStockItems.length} SKU
              </span>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs font-bold text-emerald-800">Semua Stok Aman</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">Tidak ada produk dengan stok kritis (≤ 3 pcs)</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {lowStockItems.slice(0, 6).map((item) => {
                  const avail = item.physicalStock - item.reservedStock;
                  return (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div className="truncate mr-2">
                        <span className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                          {item.sku}
                        </span>
                        <div className="font-semibold text-slate-800 truncate mt-0.5">
                          {item.name} {item.motif ? `- ${item.motif}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                            avail <= 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {avail} pcs ready
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              href="/stock-in"
              className="w-full mt-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Package className="w-3.5 h-3.5" /> Catat Stok Masuk Baru
            </Link>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-gradient-to-br from-rose-50 via-white to-pink-50 rounded-2xl border border-rose-200/70 p-5 space-y-3">
            <h3 className="text-xs font-bold text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-600" /> Aksi Cepat
            </h3>

            <div className="grid grid-cols-1 gap-2">
              <Link
                href="/orders"
                className="p-3 rounded-xl bg-white border border-rose-100 shadow-2xs hover:border-rose-300 hover:shadow-xs transition-all flex items-center justify-between text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <span>Buat Order WhatsApp Baru</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/pre-orders"
                className="p-3 rounded-xl bg-white border border-indigo-100 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all flex items-center justify-between text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span>Catat Pre-Order Customer</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/finance"
                className="p-3 rounded-xl bg-white border border-emerald-100 shadow-2xs hover:border-emerald-300 hover:shadow-xs transition-all flex items-center justify-between text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span>Laporan Laba Rugi Real-Time</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
