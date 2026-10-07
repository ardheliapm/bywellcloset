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
  Plus,
  Edit3,
  Layers,
  Boxes,
  Send,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import InvoiceModal, { OrderDetail } from './InvoiceModal';
import AddItemsModal from './AddItemsModal';
import EditOrderModal from './EditOrderModal';
import PreOrderInvoiceModal from '../pre-orders/PreOrderInvoiceModal';
import ShipPreOrderModal from '../pre-orders/ShipPreOrderModal';
import EditPreOrderModal from '../pre-orders/EditPreOrderModal';
import { PreOrderRecord, cancelPreOrder, deletePreOrder } from '../pre-orders/actions';
import { ProductItem } from '../products/actions';
import { OrderRecord, markOrderAsPaid, markOrderAsShipped, cancelOrder, deleteOrder } from './actions';

interface OrdersListProps {
  orders: OrderRecord[];
  products?: ProductItem[];
}

type DialogType = 'PAY' | 'SHIP' | 'CANCEL' | 'DELETE';

export default function OrdersList({ orders, products = [] }: OrdersListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'REGULAR' | 'PRE_ORDER'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  
  // Regular order modals
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<OrderDetail | null>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<OrderRecord | null>(null);
  const [addItemsOrder, setAddItemsOrder] = useState<OrderRecord | null>(null);
  
  // PO modals
  const [selectedPoForInvoice, setSelectedPoForInvoice] = useState<PreOrderRecord | null>(null);
  const [selectedPoForShip, setSelectedPoForShip] = useState<PreOrderRecord | null>(null);
  const [selectedPoForEdit, setSelectedPoForEdit] = useState<PreOrderRecord | null>(null);

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
  const regularCount = useMemo(() => dateFilteredOrders.filter((o) => o.orderType !== 'PRE_ORDER').length, [dateFilteredOrders]);
  const poCount = useMemo(() => dateFilteredOrders.filter((o) => o.orderType === 'PRE_ORDER').length, [dateFilteredOrders]);
  
  const holdCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'HOLD' || o.status === 'WAITING_STOCK').length, [dateFilteredOrders]);
  const paidCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'PAID' || o.status === 'READY' || o.status === 'PARTIAL_READY').length, [dateFilteredOrders]);
  const shippedCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'SHIPPED' || o.status === 'PARTIAL_SHIPPED').length, [dateFilteredOrders]);
  const cancelledCount = useMemo(() => dateFilteredOrders.filter((o) => o.status === 'CANCELLED').length, [dateFilteredOrders]);

  // Final Filtered Orders for Table (applying Search, Type & Status Filter)
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

      let matchesType = true;
      if (typeFilter === 'REGULAR') {
        matchesType = order.orderType !== 'PRE_ORDER';
      } else if (typeFilter === 'PRE_ORDER') {
        matchesType = order.orderType === 'PRE_ORDER';
      }

      let matchesStatus = true;
      if (statusFilter === 'HOLD') {
        matchesStatus = order.status === 'HOLD' || order.status === 'WAITING_STOCK';
      } else if (statusFilter === 'PAID') {
        matchesStatus = order.status === 'PAID' || order.status === 'READY' || order.status === 'PARTIAL_READY';
      } else if (statusFilter === 'SHIPPED') {
        matchesStatus = order.status === 'SHIPPED' || order.status === 'PARTIAL_SHIPPED';
      } else if (statusFilter === 'CANCELLED') {
        matchesStatus = order.status === 'CANCELLED';
      } else if (statusFilter === 'PO_WAITING') {
        matchesStatus = order.status === 'WAITING_STOCK';
      } else if (statusFilter === 'PO_READY') {
        matchesStatus = order.status === 'READY' || order.status === 'PARTIAL_READY';
      }

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [dateFilteredOrders, searchTerm, typeFilter, statusFilter]);

  const isFilterActive = searchTerm.trim() !== '' || statusFilter !== 'ALL' || typeFilter !== 'ALL' || selectedMonth !== 'ALL' || selectedYear !== 'ALL';

  const handleResetFilter = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setSelectedMonth('ALL');
    setSelectedYear('ALL');
  };

  // Helper to open invoice modal for either regular order or PO
  const handleOpenInvoice = (order: OrderRecord) => {
    if (order.orderType === 'PRE_ORDER') {
      const poData: PreOrderRecord = order.rawPreOrder || {
        id: order.id,
        poNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        totalAmount: order.totalAmount,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items.map((it) => ({
          id: it.id,
          preOrderId: order.id,
          productId: it.productId,
          productSku: it.productSku,
          productName: it.productName,
          price: it.price,
          quantityOrdered: it.quantity,
          quantityFulfilled: it.quantityFulfilled ?? 0,
          quantityShipped: it.quantityShipped ?? 0,
          subtotal: it.subtotal,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        })),
      };
      setSelectedPoForInvoice(poData);
    } else {
      setSelectedOrderForInvoice({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        totalAmount: order.totalAmount,
        notes: order.notes,
        createdAt: order.createdAt,
        items: order.items,
      });
    }
  };

  // Helper to open PO shipment modal
  const handleOpenPoShipment = (order: OrderRecord) => {
    const poData: PreOrderRecord = order.rawPreOrder || {
      id: order.id,
      poNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      totalAmount: order.totalAmount,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((it) => ({
        id: it.id,
        preOrderId: order.id,
        productId: it.productId,
        productSku: it.productSku,
        productName: it.productName,
        price: it.price,
        quantityOrdered: it.quantity,
        quantityFulfilled: it.quantityFulfilled ?? 0,
        quantityShipped: it.quantityShipped ?? 0,
        subtotal: it.subtotal,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
    };
    setSelectedPoForShip(poData);
  };

  // Helper to open PO edit modal
  const handleOpenPoEdit = (order: OrderRecord) => {
    const poData: PreOrderRecord = order.rawPreOrder || {
      id: order.id,
      poNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      status: order.status,
      totalAmount: order.totalAmount,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((it) => ({
        id: it.id,
        preOrderId: order.id,
        productId: it.productId,
        productSku: it.productSku,
        productName: it.productName,
        price: it.price,
        quantityOrdered: it.quantity,
        quantityFulfilled: it.quantityFulfilled ?? 0,
        quantityShipped: it.quantityShipped ?? 0,
        subtotal: it.subtotal,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
    };
    setSelectedPoForEdit(poData);
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
    const order = confirmDialog.order;
    const orderId = order.id;
    const isPo = order.orderType === 'PRE_ORDER';

    setActionLoading(true);
    try {
      let res: { success: boolean; error?: string } = { success: true };

      if (confirmDialog.type === 'PAY') {
        if (!isPo) {
          res = await markOrderAsPaid(orderId);
        }
      } else if (confirmDialog.type === 'SHIP') {
        if (!isPo) {
          res = await markOrderAsShipped(orderId);
        }
      } else if (confirmDialog.type === 'CANCEL') {
        if (isPo) {
          res = await cancelPreOrder(orderId);
        } else {
          res = await cancelOrder(orderId);
        }
      } else if (confirmDialog.type === 'DELETE') {
        if (isPo) {
          res = await deletePreOrder(orderId);
        } else {
          res = await deleteOrder(orderId);
        }
      }

      if (!res.success) {
        alert(res.error || 'Gagal memproses pesanan.');
      }
    } catch (e: any) {
      alert(e?.message || 'Terjadi kesalahan sistem saat memproses pesanan.');
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
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            Daftar Pesanan & Pengawasan Stok
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Semua pesanan customer (Order Reguler & Pre-Order PO) terpusat di sini dengan invoice WhatsApp & update stok real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Link
            href="/pre-orders"
            className="px-3.5 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Clock className="w-4 h-4 text-indigo-600" /> Buka Antrean PO
          </Link>

          <Link
            href="/paste-order"
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors inline-flex items-center gap-2 shadow-xs"
          >
            <FileText className="w-4 h-4" /> + Paste Order Baru
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Pesanan</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{dateFilteredOrders.length}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {regularCount} Reguler • {poCount} Pre-Order (PO)
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* Hold / Menunggu */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Keep / Menunggu</p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">{holdCount} Pesanan</p>
            <span className="text-[11px] text-amber-600/80">Belum bayar / nunggu stok PO</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Paid / PO Ready */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Lunas / Ready Kirim</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">{paidCount} Pesanan</p>
            <span className="text-[11px] text-emerald-600/80">Siap dipacking & kirim</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Shipped */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Sudah Dikirim</p>
            <p className="text-2xl font-bold text-blue-600 mt-0.5">{shippedCount} Pesanan</p>
            <span className="text-[11px] text-blue-600/80">Diserahkan ke ekspedisi</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3.5">
        {/* Top Filter Row: Search + Segment Pills + Date */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari Customer, No. Order/PO, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          {/* Type Filter Button Pills (1-Click Switch: Semua / Khusus PO / Reguler) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                typeFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Semua Pesanan</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                typeFilter === 'ALL' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {dateFilteredOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter('PRE_ORDER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                typeFilter === 'PRE_ORDER'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-700 hover:bg-indigo-100/60 bg-indigo-50/70 border border-indigo-200/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Khusus PO</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                typeFilter === 'PRE_ORDER' ? 'bg-indigo-800 text-indigo-100' : 'bg-indigo-200/80 text-indigo-900'
              }`}>
                {poCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter('REGULAR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                typeFilter === 'REGULAR'
                  ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              <span>Reguler</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                typeFilter === 'REGULAR' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {regularCount}
              </span>
            </button>
          </div>

          {/* Right: Month & Year Selects + Reset */}
          <div className="flex items-center gap-2 shrink-0">
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
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
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
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Semua Status ({dateFilteredOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('PO_ONLY')}
            className={`px-3 py-1.5 rounded-md text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
              statusFilter === 'PO_ONLY'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/60'
            }`}
          >
            <Clock className="w-3 h-3" /> Hanya PO ({poCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('HOLD')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'PAID'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Lunas / Ready ({paidCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('SHIPPED')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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
                ? 'Buka menu "Paste Order WhatsApp" atau "Pre-Order" untuk mencatat pesanan pertama Anda.'
                : 'Coba ubah kata kunci pencarian atau tab filter status.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">No. Order / PO & Tanggal</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Produk Dipesan</th>
                  <th className="py-3.5 px-4 text-right">Total Tagihan</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrders.map((order) => {
                  const isPo = order.orderType === 'PRE_ORDER';
                  const poReadyPcs = isPo
                    ? order.items.reduce(
                        (acc, it) => acc + Math.max(0, (it.quantityFulfilled ?? 0) - (it.quantityShipped ?? 0)),
                        0
                      )
                    : 0;

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isPo ? 'bg-indigo-50/20' : ''
                      }`}
                    >
                      {/* Order Number, Type Badge & Date */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-mono font-bold text-xs tracking-wider ${
                              isPo ? 'text-indigo-900' : 'text-slate-900'
                            }`}
                          >
                            #{order.orderNumber}
                          </span>

                          {isPo ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-2xs">
                              <Clock className="w-2.5 h-2.5 text-indigo-600" /> PO (Pre-Order)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Reguler
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
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
                                {isPo && it.quantityFulfilled !== undefined ? (
                                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">
                                    {it.quantityFulfilled}/{it.quantity} ready
                                  </span>
                                ) : (
                                  `${it.quantity}x`
                                )}
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
                        {/* Regular Order Statuses */}
                        {!isPo && (
                          <>
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
                          </>
                        )}

                        {/* Pre-Order Specific Statuses */}
                        {isPo && (
                          <>
                            {order.status === 'WAITING_STOCK' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="w-3 h-3" /> Menunggu Barang PO
                              </span>
                            )}
                            {(order.status === 'PARTIAL_READY' || order.status === 'PARTIAL_SHIPPED') && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
                                <Layers className="w-3 h-3" /> PO: Sebagian Ready ({poReadyPcs} pcs)
                              </span>
                            )}
                            {order.status === 'READY' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> PO: Siap Kirim Full
                              </span>
                            )}
                            {order.status === 'SHIPPED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <Truck className="w-3 h-3" /> Sudah Dikirim
                              </span>
                            )}
                            {order.status === 'CANCELLED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                <XCircle className="w-3 h-3" /> Dibatalkan
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Universal Invoice Button with WA for both Regular & PO */}
                          <button
                            type="button"
                            onClick={() => handleOpenInvoice(order)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer ${
                              isPo
                                ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                            title="Buka Invoice & Kirim WhatsApp"
                          >
                            <FileText className={`w-3.5 h-3.5 ${isPo ? 'text-indigo-600' : 'text-rose-500'}`} /> Invoice
                          </button>

                          {/* Pre-Order Specific Actions: Edit */}
                          {isPo && order.status !== 'CANCELLED' && order.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPoEdit(order)}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Edit rincian PO, ganti SKU motif, tambah/kurang kuantiti, atau ubah harga"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" /> Edit
                            </button>
                          )}

                          {/* Pre-Order Specific Actions: Ship */}
                          {isPo && poReadyPcs > 0 && order.status !== 'CANCELLED' && order.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPoShipment(order)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title={`Kirim ${poReadyPcs} pcs barang PO yang sudah ready`}
                            >
                              <Truck className="w-3.5 h-3.5" /> Kirim ({poReadyPcs})
                            </button>
                          )}

                          {/* Regular Order Specific Actions: Edit */}
                          {!isPo && (order.status === 'HOLD' || order.status === 'PAID') && (
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForEdit(order)}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Edit rincian pesanan, tambah/kurang kuantiti item, atau ubah harga"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" /> Edit
                            </button>
                          )}

                          {/* Regular Order Specific Actions: Add Items */}
                          {!isPo && order.status === 'HOLD' && (
                            <button
                              type="button"
                              onClick={() => setAddItemsOrder(order)}
                              className="px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Tambah item ke order ini"
                            >
                              <Plus className="w-3.5 h-3.5" /> Tambah
                            </button>
                          )}

                          {/* Regular Order Specific Actions: Mark Paid */}
                          {!isPo && order.status === 'HOLD' && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('PAY', order)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                              title="Tandai pesanan lunas & potong stok fisik"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Bayar
                            </button>
                          )}

                          {/* Regular Order Specific Actions: Mark Shipped */}
                          {!isPo && order.status === 'PAID' && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('SHIP', order)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                              title="Tandai pesanan sudah dikirim ke ekspedisi"
                            >
                              <Truck className="w-3.5 h-3.5" /> Kirim
                            </button>
                          )}

                          {/* Universal Cancel Action */}
                          {order.status !== 'CANCELLED' && order.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('CANCEL', order)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Batalkan Pesanan (Lepas stok hold)"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Universal Delete Action */}
                          {order.status === 'CANCELLED' ? (
                            <button
                              type="button"
                              onClick={() => openConfirmModal('DELETE', order)}
                              className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors border border-rose-200 bg-rose-50/50 shadow-2xs cursor-pointer"
                              title="Hapus pesanan yang dibatalkan ini secara permanen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alert('Pesanan harus dibatalkan terlebih dahulu sebelum dapat dihapus!')}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer"
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

      {/* Regular Invoice Modal */}
      {selectedOrderForInvoice && (
        <InvoiceModal
          isOpen={Boolean(selectedOrderForInvoice)}
          onClose={() => setSelectedOrderForInvoice(null)}
          order={selectedOrderForInvoice}
        />
      )}

      {/* Pre-Order Invoice Modal with Full WA & Payment Details */}
      {selectedPoForInvoice && (
        <PreOrderInvoiceModal
          isOpen={Boolean(selectedPoForInvoice)}
          onClose={() => setSelectedPoForInvoice(null)}
          preOrder={selectedPoForInvoice}
        />
      )}

      {/* Pre-Order Ship Modal */}
      {selectedPoForShip && (
        <ShipPreOrderModal
          isOpen={Boolean(selectedPoForShip)}
          onClose={() => setSelectedPoForShip(null)}
          preOrder={selectedPoForShip}
        />
      )}

      {/* Pre-Order Edit Modal */}
      {selectedPoForEdit && (
        <EditPreOrderModal
          isOpen={Boolean(selectedPoForEdit)}
          onClose={() => setSelectedPoForEdit(null)}
          preOrder={selectedPoForEdit}
          products={products}
        />
      )}

      {/* Add Items Modal (Regular) */}
      {addItemsOrder && (
        <AddItemsModal
          isOpen={Boolean(addItemsOrder)}
          onClose={() => setAddItemsOrder(null)}
          order={addItemsOrder}
        />
      )}

      {/* Edit Order Modal (Regular) */}
      {selectedOrderForEdit && (
        <EditOrderModal
          isOpen={Boolean(selectedOrderForEdit)}
          onClose={() => setSelectedOrderForEdit(null)}
          order={selectedOrderForEdit}
          products={products}
        />
      )}

      {/* Modern In-App Confirmation Modal */}
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
                {confirmDialog.type === 'CANCEL' && 'Konfirmasi Pembatalan'}
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
                    Yakin ingin membatalkan pesanan <strong>#{confirmDialog.order.orderNumber}</strong> ({confirmDialog.order.customerName})? Stok yang di-hold akan otomatis dikembalikan.
                  </>
                )}
                {confirmDialog.type === 'DELETE' && (
                  <>
                    Apakah Anda yakin ingin <span className="text-rose-600 font-bold">menghapus permanen</span> data <strong>#{confirmDialog.order.orderNumber}</strong> ({confirmDialog.order.customerName})?
                  </>
                )}
              </p>
            </div>

            {/* Order Highlight Box */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500">
                <span>Jenis:</span>
                <strong className={confirmDialog.order.orderType === 'PRE_ORDER' ? 'text-indigo-700' : 'text-slate-800'}>
                  {confirmDialog.order.orderType === 'PRE_ORDER' ? 'Pre-Order (PO)' : 'Order Reguler'}
                </strong>
              </div>
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

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={actionLoading}
                onClick={closeConfirmModal}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer ${
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
                    {confirmDialog.type === 'CANCEL' && 'Ya, Batalkan'}
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

