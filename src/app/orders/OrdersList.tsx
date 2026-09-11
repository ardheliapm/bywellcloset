'use client';

import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Clock, 
  CheckCircle2, 
  Truck, 
  XCircle, 
  FileText, 
  Phone, 
  Calendar, 
  Loader2, 
  AlertTriangle,
  CreditCard,
  Package,
  X,
  Trash2,
  Plus
} from 'lucide-react';
import Link from 'next/link';
import InvoiceModal, { OrderDetail } from './InvoiceModal';
import AddItemsModal from './AddItemsModal';
import { OrderRecord, markOrderAsPaid, markOrderAsShipped, cancelOrder, deleteOrder } from './actions';

interface OrdersListProps {
  orders: OrderRecord[];
}

type DialogType = 'PAY' | 'SHIP' | 'CANCEL' | 'DELETE';

export default function OrdersList({ orders }: OrdersListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HOLD' | 'PAID' | 'SHIPPED' | 'CANCELLED'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<OrderDetail | null>(null);
  const [addItemsOrder, setAddItemsOrder] = useState<OrderRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Month options in Indonesian
  const MONTH_OPTIONS = [
    { value: 'ALL', label: 'Semua Bulan' },
    { value: '1', label: 'Januari' },
    { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' },
    { value: '4', label: 'April' },
    { value: '5', label: 'Mei' },
    { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' },
    { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' },
  ];

  // Available Years extracted dynamically from dataset
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYr = new Date().getFullYear().toString();
    years.add(currentYr);

    orders.forEach((o) => {
      const yr = new Date(o.createdAt).getFullYear().toString();
      years.add(yr);
    });

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [orders]);

  // Custom in-app confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: DialogType;
    order: OrderRecord | null;
  }>({
    isOpen: false,
    type: 'PAY',
    order: null,
  });

  // Formatting Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Orders filtered by Month & Year date period first
  const dateFilteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const d = new Date(order.createdAt);
      const m = (d.getMonth() + 1).toString();
      const y = d.getFullYear().toString();

      const matchesMonth = selectedMonth === 'ALL' || m === selectedMonth;
      const matchesYear = selectedYear === 'ALL' || y === selectedYear;

      return matchesMonth && matchesYear;
    });
  }, [orders, selectedMonth, selectedYear]);

  // KPI Summary Counts (based on Month & Year date period)
  const holdCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'HOLD').length, [dateFilteredOrders]);
  const paidCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'PAID').length, [dateFilteredOrders]);
  const shippedCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'SHIPPED').length, [dateFilteredOrders]);
  const cancelledCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'CANCELLED').length, [dateFilteredOrders]);

  // Final Filtered Orders for Table (applying Search & Status Filter)
  const filteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customerPhone && order.customerPhone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        order.items.some((it) =>
          it.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          it.productSku.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const matchesStatus = statusFilter === 'ALL' ? true : order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [dateFilteredOrders, searchTerm, statusFilter]);

  const isFilterActive = searchTerm.trim() !== '' || statusFilter !== 'ALL' || selectedMonth !== 'ALL' || selectedYear !== 'ALL';

  const handleResetFilter = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setSelectedMonth('ALL');
    setSelectedYear('ALL');
  };

  // Open confirmation modal
  const openConfirmModal = (type: DialogType, order: OrderRecord) => {
    setConfirmDialog({
      isOpen: true,
      type,
      order,
    });
  };

  const closeConfirmModal = () => {
    if (actionLoading) return;
    setConfirmDialog({
      isOpen: false,
      type: 'PAY',
      order: null,
    });
  };

  // Execute confirmed action
  const handleExecuteAction = async () => {
    if (!confirmDialog.order) return;
    const orderId = confirmDialog.order.id;

    setActionLoading(true);
    try {
      if (confirmDialog.type === 'PAY') {
        await markOrderAsPaid(orderId);
      } else if (confirmDialog.type === 'SHIP') {
        await markOrderAsShipped(orderId);
      } else if (confirmDialog.type === 'CANCEL') {
        await cancelOrder(orderId);
      } else if (confirmDialog.type === 'DELETE') {
        const res = await deleteOrder(orderId);
        if (!res.success) {
          alert(res.error || 'Gagal menghapus pesanan');
        }
      }
    } finally {
      setActionLoading(false);
      closeConfirmModal();
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>Daftar Pesanan & Pengawasan Stok</span>
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Kelola pesanan customer, verifikasi bukti transfer, potong stok otomatis, dan cetak invoice.
          </p>
        </div>

        <Link
          href="/paste-order"
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors inline-flex items-center gap-2 shadow-xs shrink-0 self-start sm:self-center"
        >
          <FileText className="w-4 h-4" /> + Paste Order Baru
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Order</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{dateFilteredOrders.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* Hold / Keep */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Keep / Menunggu Bayar</p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">{holdCount} Order</p>
            <span className="text-[11px] text-amber-600/80">Stok sedang di-hold</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Paid */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Sudah Bayar</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">{paidCount} Order</p>
            <span className="text-[11px] text-emerald-600/80">Siap dipacking/kirim</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Shipped */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Sudah Dikirim</p>
            <p className="text-2xl font-bold text-blue-600 mt-0.5">{shippedCount} Order</p>
            <span className="text-[11px] text-blue-600/80">Di tangan ekspedisi</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Left: Search Input & Month/Year Selects */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari Customer, No. Order, SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            {/* Month Select */}
            <div className="relative shrink-0">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer shadow-2xs"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Calendar className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Year Select */}
            <div className="relative shrink-0">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer shadow-2xs"
              >
                <option value="ALL">Semua Tahun</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Tahun {yr}
                  </option>
                ))}
              </select>
              <Calendar className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Reset Filter */}
            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilter}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg overflow-x-auto border border-slate-200/60">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Semua ({dateFilteredOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('HOLD')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'HOLD'
                ? 'bg-white text-amber-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Keep / Belum Bayar ({holdCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('PAID')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'PAID'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sudah Bayar ({paidCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('SHIPPED')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'SHIPPED'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sudah Kirim ({shippedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('CANCELLED')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === 'CANCELLED'
                ? 'bg-white text-slate-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Batal ({cancelledCount})
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 mx-auto flex items-center justify-center">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {orders.length === 0 ? 'Belum Ada Pesanan Masuk' : 'Pesanan Tidak Ditemukan'}
            </h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              {orders.length === 0
                ? 'Buka menu "Paste Order WhatsApp" untuk menempelkan pesanan pertama Anda.'
                : 'Coba ubah kata kunci pencarian atau tab filter status.'}
            </p>
            {orders.length === 0 && (
              <Link
                href="/paste-order"
                className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors inline-flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> Buka Paste Order WhatsApp
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">No. Order & Tanggal</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Produk Dipesan</th>
                  <th className="py-3.5 px-4 text-right">Total Tagihan</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrders.map((order) => {
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Order Number & Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900 text-xs tracking-wider">
                          #{order.orderNumber}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(order.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{order.customerName}</div>
                        {order.customerPhone ? (
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {order.customerPhone}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs italic">Tanpa nomor</span>
                        )}
                      </td>

                      {/* Products Summary */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 max-w-xs">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="text-xs flex items-center justify-between text-slate-700">
                              <span className="truncate mr-2">
                                <strong className="font-mono text-slate-900">{it.productSku}</strong> - {it.productName}
                              </span>
                              <span className="text-slate-500 font-semibold shrink-0">
                                {it.quantity}x
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Total Tagihan */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatRupiah(order.totalAmount)}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {order.status === 'HOLD' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> Keep / Hold
                          </span>
                        )}
                        {order.status === 'PAID' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Sudah Bayar
                          </span>
                        )}
                        {order.status === 'SHIPPED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Truck className="w-3 h-3" /> Sudah Kirim
                          </span>
                        )}
                        {order.status === 'CANCELLED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <XCircle className="w-3 h-3" /> Dibatalkan
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Invoice Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrderForInvoice(order)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                            title="Buka Invoice & Teks WhatsApp"
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-500" /> Invoice
                          </button>

                          {/* Action: Add Items if HOLD */}
                          {order.status === 'HOLD' && (
                            <button
                              type="button"
                              onClick={() => setAddItemsOrder(order)}
                              className="px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                              title="Tambah item ke order ini"
                            >
                              <Plus className="w-3.5 h-3.5" /> Tambah
                            </button>
                          )}

                          {/* Action: Mark as Paid if HOLD */}
                          {order.status === 'HOLD' && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('PAY', order)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                              title="Tandai pesanan lunas & potong stok fisik"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Bayar
                            </button>
                          )}

                          {/* Action: Mark as Shipped if PAID */}
                          {order.status === 'PAID' && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('SHIP', order)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                              title="Tandai pesanan sudah dikirim ke ekspedisi"
                            >
                              <Truck className="w-3.5 h-3.5" /> Kirim
                            </button>
                          )}

                          {/* Action: Cancel Order (if not cancelled) */}
                          {order.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('CANCEL', order)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Batalkan Pesanan (Lepas stok hold)"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Action: Delete Order (if CANCELLED, else disabled hint) */}
                          {order.status === 'CANCELLED' ? (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('DELETE', order)}
                              className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors border border-rose-200 bg-rose-50/50 shadow-2xs"
                              title="Hapus pesanan yang dibatalkan ini secara permanen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alert('Pesanan harus dibatalkan terlebih dahulu sebelum dapat dihapus!')}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-400 hover:bg-slate-50 transition-colors"
                              title="Hanya pesanan yang sudah dibatalkan yang dapat dihapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Modal */}
      {selectedOrderForInvoice && (
        <InvoiceModal
          isOpen={Boolean(selectedOrderForInvoice)}
          onClose={() => setSelectedOrderForInvoice(null)}
          order={selectedOrderForInvoice}
        />
      )}

      {/* Add Items Modal */}
      {addItemsOrder && (
        <AddItemsModal
          isOpen={Boolean(addItemsOrder)}
          onClose={() => setAddItemsOrder(null)}
          order={addItemsOrder}
        />
      )}

      {/* Modern In-App Confirmation Modal (Replaces browser window.confirm) */}
      {confirmDialog.isOpen && confirmDialog.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4">
            {/* Modal Icon & Header */}
            <div className="text-center space-y-2">
              {confirmDialog.type === 'PAY' && (
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
                  <CreditCard className="w-6 h-6" />
                </div>
              )}
              {confirmDialog.type === 'SHIP' && (
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto">
                  <Truck className="w-6 h-6" />
                </div>
              )}
              {confirmDialog.type === 'CANCEL' && (
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              {confirmDialog.type === 'DELETE' && (
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6" />
                </div>
              )}

              <h3 className="text-lg font-bold text-slate-800">
                {confirmDialog.type === 'PAY' && 'Konfirmasi Pelunasan Order'}
                {confirmDialog.type === 'SHIP' && 'Konfirmasi Pengiriman Paket'}
                {confirmDialog.type === 'CANCEL' && 'Konfirmasi Pembatalan Order'}
                {confirmDialog.type === 'DELETE' && 'Hapus Pesanan Permanen'}
              </h3>

              <p className="text-sm text-slate-500">
                {confirmDialog.type === 'PAY' && (
                  <>
                    Tandai pesanan <strong>#{confirmDialog.order.orderNumber}</strong> ({confirmDialog.order.customerName}) sebagai <span className="text-emerald-600 font-semibold">LUNAS / SUDAH DIBAYAR</span>?
                  </>
                )}
                {confirmDialog.type === 'SHIP' && (
                  <>
                    Tandai pesanan <strong>#{confirmDialog.order.orderNumber}</strong> ({confirmDialog.order.customerName}) telah diserahkan ke <span className="text-blue-600 font-semibold">EKSPEDISI / KURIR</span>?
                  </>
                )}
                {confirmDialog.type === 'CANCEL' && (
                  <>
                    Yakin ingin membatalkan pesanan <strong>#{confirmDialog.order.orderNumber}</strong> ({confirmDialog.order.customerName})?
                  </>
                )}
                {confirmDialog.type === 'DELETE' && (
                  <>
                    Apakah Anda yakin ingin <span className="text-rose-600 font-bold">menghapus permanen</span> pesanan <strong>#{confirmDialog.order.orderNumber}</strong> ({confirmDialog.order.customerName})?
                  </>
                )}
              </p>
            </div>

            {/* Order Highlight Box */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500">
                <span>Customer:</span>
                <strong className="text-slate-800">{confirmDialog.order.customerName}</strong>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Total Tagihan:</span>
                <strong className="text-slate-900 font-bold">{formatRupiah(confirmDialog.order.totalAmount)}</strong>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Jumlah Produk:</span>
                <strong className="text-slate-800">
                  {confirmDialog.order.items.reduce((acc, it) => acc + it.quantity, 0)} pcs
                </strong>
              </div>
            </div>

            {/* Explanatory Note on Stock Impact */}
            <div className={`p-3 rounded-xl text-xs space-y-1 border ${
              confirmDialog.type === 'PAY' 
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                : confirmDialog.type === 'SHIP'
                ? 'bg-blue-50/70 border-blue-200 text-blue-800'
                : confirmDialog.type === 'CANCEL'
                ? 'bg-amber-50/70 border-amber-200 text-amber-800'
                : 'bg-rose-50/70 border-rose-200 text-rose-800'
            }`}>
              <p className="font-semibold">💡 Catatan Sistem:</p>
              {confirmDialog.type === 'PAY' && (
                <p>
                  • <strong>Stok Fisik Gudang</strong> akan otomatis dipotong sebesar pesanan.<br />
                  • <strong>Stok Keep / Hold</strong> akan dilepaskan karena barang sah terjual.
                </p>
              )}
              {confirmDialog.type === 'SHIP' && (
                <p>
                  • Status order berubah menjadi <strong>SUDAH DIKIRIM</strong>.<br />
                  • Stok sudah terpotong sejak pembayaran.
                </p>
              )}
              {confirmDialog.type === 'CANCEL' && (
                <p>
                  • Stok yang sebelumnya di-hold akan <strong>otomatis dikembalikan</strong> ke stok siap jual (Available Stock).
                </p>
              )}
              {confirmDialog.type === 'DELETE' && (
                <p className="text-rose-700 font-medium">
                  • <strong>Hapus Permanen</strong>: Data order ini akan dihapus permanen dari basis data. Tindakan ini tidak dapat dibatalkan.
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={actionLoading}
                onClick={closeConfirmModal}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 ${
                  confirmDialog.type === 'PAY'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : confirmDialog.type === 'SHIP'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : confirmDialog.type === 'CANCEL'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    {confirmDialog.type === 'PAY' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {confirmDialog.type === 'SHIP' && <Truck className="w-3.5 h-3.5" />}
                    {confirmDialog.type === 'CANCEL' && <XCircle className="w-3.5 h-3.5" />}
                    {confirmDialog.type === 'DELETE' && <Trash2 className="w-3.5 h-3.5" />}
                    {confirmDialog.type === 'PAY' && 'Ya, Konfirmasi Lunas'}
                    {confirmDialog.type === 'SHIP' && 'Ya, Tandai Dikirim'}
                    {confirmDialog.type === 'CANCEL' && 'Ya, Batalkan Order'}
                    {confirmDialog.type === 'DELETE' && 'Ya, Hapus Permanen'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
