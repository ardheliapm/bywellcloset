'use client';

import React, { useState, useMemo } from 'react';
import {
  Clock,
  Search,
  Plus,
  Truck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Phone,
  Package,
  Layers,
  Sparkles,
  Loader2,
  XCircle,
  Trash2,
  Check,
  Send,
  Boxes,
  Edit3,
} from 'lucide-react';
import { PreOrderRecord, cancelPreOrder, deletePreOrder } from './actions';
import { ProductItem } from '../products/actions';
import CreatePreOrderModal from './CreatePreOrderModal';
import PreOrderInvoiceModal from './PreOrderInvoiceModal';
import ShipPreOrderModal from './ShipPreOrderModal';
import EditPreOrderModal from './EditPreOrderModal';
import AddPreOrderItemsModal from './AddPreOrderItemsModal';

interface PreOrdersClientProps {
  initialPreOrders: PreOrderRecord[];
  products: ProductItem[];
}

export default function PreOrdersClient({
  initialPreOrders = [],
  products = [],
}: PreOrdersClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPoForInvoice, setSelectedPoForInvoice] = useState<PreOrderRecord | null>(null);
  const [selectedPoForShip, setSelectedPoForShip] = useState<PreOrderRecord | null>(null);
  const [selectedPoForEdit, setSelectedPoForEdit] = useState<PreOrderRecord | null>(null);
  const [selectedPoForAddItems, setSelectedPoForAddItems] = useState<PreOrderRecord | null>(null);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'CANCEL' | 'DELETE';
    po: PreOrderRecord | null;
  }>({
    isOpen: false,
    type: 'CANCEL',
    po: null,
  });
  const [actionLoading, setActionLoading] = useState(false);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Month options
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

  // Available Years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYr = new Date().getFullYear().toString();
    years.add(currentYr);

    initialPreOrders.forEach((o) => {
      const yr = new Date(o.createdAt).getFullYear().toString();
      years.add(yr);
    });

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [initialPreOrders]);

  // Date filtered
  const dateFiltered = useMemo(() => {
    return initialPreOrders.filter((po) => {
      const d = new Date(po.createdAt);
      const m = (d.getMonth() + 1).toString();
      const y = d.getFullYear().toString();

      const matchesMonth = selectedMonth === 'ALL' || m === selectedMonth;
      const matchesYear = selectedYear === 'ALL' || y === selectedYear;

      return matchesMonth && matchesYear;
    });
  }, [initialPreOrders, selectedMonth, selectedYear]);

  // KPI Calculations
  const waitingPcsCount = useMemo(() => {
    return dateFiltered
      .filter((po) => po.status !== 'CANCELLED' && po.status !== 'SHIPPED')
      .reduce((acc, po) => {
        return (
          acc +
          po.items.reduce((sub, it) => sub + Math.max(0, it.quantityOrdered - it.quantityFulfilled), 0)
        );
      }, 0);
  }, [dateFiltered]);

  const readyToShipPcsCount = useMemo(() => {
    return dateFiltered
      .filter((po) => po.status !== 'CANCELLED' && po.status !== 'SHIPPED')
      .reduce((acc, po) => {
        return (
          acc +
          po.items.reduce((sub, it) => sub + Math.max(0, it.quantityFulfilled - it.quantityShipped), 0)
        );
      }, 0);
  }, [dateFiltered]);

  const waitingPoCount = useMemo(
    () => dateFiltered.filter((po) => po.status === 'WAITING_STOCK').length,
    [dateFiltered]
  );
  const partialReadyCount = useMemo(
    () => dateFiltered.filter((po) => po.status === 'PARTIAL_READY' || po.status === 'PARTIAL_SHIPPED').length,
    [dateFiltered]
  );
  const readyCount = useMemo(
    () => dateFiltered.filter((po) => po.status === 'READY').length,
    [dateFiltered]
  );
  const shippedCount = useMemo(
    () => dateFiltered.filter((po) => po.status === 'SHIPPED').length,
    [dateFiltered]
  );
  const cancelledCount = useMemo(
    () => dateFiltered.filter((po) => po.status === 'CANCELLED').length,
    [dateFiltered]
  );

  // Filtered for table
  const filteredPreOrders = useMemo(() => {
    return dateFiltered.filter((po) => {
      const matchesSearch =
        po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (po.customerPhone && po.customerPhone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        po.items.some(
          (it) =>
            it.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            it.productSku.toLowerCase().includes(searchTerm.toLowerCase())
        );

      let matchesStatus = true;
      if (statusFilter === 'WAITING_STOCK') {
        matchesStatus = po.status === 'WAITING_STOCK';
      } else if (statusFilter === 'PARTIAL_READY') {
        matchesStatus = po.status === 'PARTIAL_READY' || po.status === 'PARTIAL_SHIPPED';
      } else if (statusFilter === 'READY') {
        matchesStatus = po.status === 'READY';
      } else if (statusFilter === 'SHIPPED') {
        matchesStatus = po.status === 'SHIPPED';
      } else if (statusFilter === 'CANCELLED') {
        matchesStatus = po.status === 'CANCELLED';
      }

      return matchesSearch && matchesStatus;
    });
  }, [dateFiltered, searchTerm, statusFilter]);

  const handleExecuteAction = async () => {
    if (!confirmDialog.po) return;
    setActionLoading(true);

    if (confirmDialog.type === 'CANCEL') {
      await cancelPreOrder(confirmDialog.po.id);
    } else if (confirmDialog.type === 'DELETE') {
      await deletePreOrder(confirmDialog.po.id);
    }

    setActionLoading(false);
    setConfirmDialog({ isOpen: false, type: 'CANCEL', po: null });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            Pre-Order (PO) & Alokasi Kedatangan
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Kelola antrean PO customer yang akan otomatis terpenuhi dan terpotong saat stok masuk dari konveksi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Catat Pre-Order Baru
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total PO */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Antrean PO</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{dateFiltered.length}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Semua PO periode terpilih</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        {/* Menunggu Barang Datang */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-amber-50/40">
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Menunggu Barang (PO)</p>
            <p className="text-2xl font-black text-amber-900 mt-1">{waitingPcsCount} <span className="text-xs font-semibold">pcs</span></p>
            <p className="text-[11px] text-amber-700 mt-0.5">{waitingPoCount} PO belum dapat stok</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Siap Dikirim */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-emerald-50/40">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Ready Siap Kirim</p>
            <p className="text-2xl font-black text-emerald-900 mt-1">{readyToShipPcsCount} <span className="text-xs font-semibold">pcs</span></p>
            <p className="text-[11px] text-emerald-700 mt-0.5">{readyCount + partialReadyCount} PO ada barang ready</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Sudah Dikirim */}
        <div className="bg-white p-5 rounded-2xl border border-blue-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-blue-50/40">
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Sudah Dikirim</p>
            <p className="text-2xl font-black text-blue-900 mt-1">{shippedCount} <span className="text-xs font-semibold">PO</span></p>
            <p className="text-[11px] text-blue-700 mt-0.5">Terkirim ke ekspedisi</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari Customer, No. PO, SKU produk..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Month & Year Filter */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Tahun {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-t border-slate-100 pt-2.5">
          {[
            { id: 'ALL', label: `Semua (${dateFiltered.length})` },
            { id: 'WAITING_STOCK', label: `Menunggu Kedatangan (${waitingPoCount})` },
            { id: 'PARTIAL_READY', label: `Sebagian Ready (${partialReadyCount})` },
            { id: 'READY', label: `Siap Kirim (${readyCount})` },
            { id: 'SHIPPED', label: `Sudah Dikirim (${shippedCount})` },
            { id: 'CANCELLED', label: `Batal (${cancelledCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredPreOrders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 mx-auto flex items-center justify-center">
              <Clock className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {initialPreOrders.length === 0 ? 'Belum Ada Antrean Pre-Order' : 'Pre-Order Tidak Ditemukan'}
            </h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              {initialPreOrders.length === 0
                ? 'Gunakan tombol "+ Catat Pre-Order Baru" untuk mencatat antrean PO customer.'
                : 'Coba ubah kata kunci pencarian atau filter tab status.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">No. PO & Tanggal</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Produk PO & Status Kedatangan</th>
                  <th className="py-3.5 px-4 text-right">Total Nilai PO</th>
                  <th className="py-3.5 px-4 text-center">Status PO</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPreOrders.map((po) => {
                  const totalPcsOrdered = po.items.reduce((acc, it) => acc + it.quantityOrdered, 0);
                  const totalPcsFulfilled = po.items.reduce((acc, it) => acc + it.quantityFulfilled, 0);
                  const totalPcsShipped = po.items.reduce((acc, it) => acc + it.quantityShipped, 0);
                  const readyToShipPcs = totalPcsFulfilled - totalPcsShipped;

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* PO Number & Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-indigo-900 text-xs tracking-wider">
                          #{po.poNumber}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(po.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{po.customerName}</div>
                        {po.customerPhone ? (
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {po.customerPhone}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs italic">Tanpa nomor</span>
                        )}
                      </td>

                      {/* Products & Fulfillment Progress */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5 max-w-sm">
                          {po.items.map((it, idx) => {
                            const isComplete = it.quantityFulfilled >= it.quantityOrdered;
                            const isShipped = it.quantityShipped >= it.quantityOrdered;

                            return (
                              <div key={idx} className="text-xs space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="truncate mr-2 font-medium text-slate-800">
                                    <strong className="font-mono text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-[11px]">
                                      {it.productSku}
                                    </strong>{' '}
                                    {it.productName}
                                  </span>
                                  <span className="text-[11px] font-bold shrink-0">
                                    {it.quantityFulfilled} / {it.quantityOrdered} pcs
                                  </span>
                                </div>

                                {/* Mini Progress Bar */}
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                  {/* Shipped Portion */}
                                  <div
                                    style={{
                                      width: `${Math.min(100, (it.quantityShipped / it.quantityOrdered) * 100)}%`,
                                    }}
                                    className="bg-blue-500 h-full"
                                    title={`Terkirim: ${it.quantityShipped} pcs`}
                                  />
                                  {/* Ready Portion */}
                                  <div
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        ((it.quantityFulfilled - it.quantityShipped) / it.quantityOrdered) * 100
                                      )}%`,
                                    }}
                                    className="bg-emerald-500 h-full"
                                    title={`Ready: ${it.quantityFulfilled - it.quantityShipped} pcs`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatRupiah(po.totalAmount)}
                        <div className="text-[11px] text-slate-400 font-normal">
                          {totalPcsOrdered} pcs total
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {po.status === 'WAITING_STOCK' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> Menunggu Barang
                          </span>
                        )}
                        {(po.status === 'PARTIAL_READY' || po.status === 'PARTIAL_SHIPPED') && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
                            <Layers className="w-3 h-3" /> Sebagian Ready ({readyToShipPcs} pcs)
                          </span>
                        )}
                        {po.status === 'READY' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Siap Kirim Full
                          </span>
                        )}
                        {po.status === 'SHIPPED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Truck className="w-3 h-3" /> Sudah Dikirim
                          </span>
                        )}
                        {po.status === 'CANCELLED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <XCircle className="w-3 h-3" /> Dibatalkan
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Invoice / Split WA */}
                          <button
                            type="button"
                            onClick={() => setSelectedPoForInvoice(po)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                            title="Buka Invoice Lengkap / Invoice Parsial & WA"
                          >
                            <FileText className="w-3.5 h-3.5 text-indigo-600" /> Invoice
                          </button>

                          {/* Edit PO Button (for PO not yet fully shipped / cancelled) */}
                          {po.status !== 'CANCELLED' && po.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedPoForEdit(po)}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Edit rincian PO, ganti SKU motif, tambah/kurang kuantiti, atau ubah harga"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" /> Edit
                            </button>
                          )}

                          {/* + Tambah Item ke PO (seperti di daftar order) */}
                          {po.status !== 'CANCELLED' && po.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedPoForAddItems(po)}
                              className="px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title="Tambah item baru ke antrean PO ini (Paste WA / Manual)"
                            >
                              <Plus className="w-3.5 h-3.5" /> Tambah
                            </button>
                          )}

                          {/* Kirim Barang Ready */}
                          {readyToShipPcs > 0 && po.status !== 'CANCELLED' && po.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedPoForShip(po)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                              title={`Kirim ${readyToShipPcs} pcs barang yang sudah ready`}
                            >
                              <Truck className="w-3.5 h-3.5" /> Kirim ({readyToShipPcs})
                            </button>
                          )}

                          {/* Batalkan */}
                          {po.status !== 'CANCELLED' && po.status !== 'SHIPPED' && (
                            <button
                              type="button"
                              onClick={() => setConfirmDialog({ isOpen: true, type: 'CANCEL', po })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Batalkan Pre-Order"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Hapus */}
                          {po.status === 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => setConfirmDialog({ isOpen: true, type: 'DELETE', po })}
                              className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors border border-rose-200"
                              title="Hapus permanen"
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

      {/* Modals */}
      <CreatePreOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        products={products}
      />

      <PreOrderInvoiceModal
        isOpen={Boolean(selectedPoForInvoice)}
        onClose={() => setSelectedPoForInvoice(null)}
        preOrder={selectedPoForInvoice}
      />

      <ShipPreOrderModal
        isOpen={Boolean(selectedPoForShip)}
        onClose={() => setSelectedPoForShip(null)}
        preOrder={selectedPoForShip}
      />

      <EditPreOrderModal
        isOpen={Boolean(selectedPoForEdit)}
        onClose={() => setSelectedPoForEdit(null)}
        preOrder={selectedPoForEdit}
        products={products}
      />

      {selectedPoForAddItems && (
        <AddPreOrderItemsModal
          isOpen={Boolean(selectedPoForAddItems)}
          onClose={() => setSelectedPoForAddItems(null)}
          preOrder={selectedPoForAddItems}
          products={products}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && confirmDialog.po && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
                  confirmDialog.type === 'CANCEL'
                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}
              >
                {confirmDialog.type === 'CANCEL' ? <AlertTriangle className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
              </div>

              <h3 className="text-lg font-bold text-slate-800">
                {confirmDialog.type === 'CANCEL' ? 'Batalkan Pre-Order' : 'Hapus Pre-Order Permanen'}
              </h3>

              <p className="text-sm text-slate-500">
                {confirmDialog.type === 'CANCEL' ? (
                  <>
                    Yakin ingin membatalkan Pre-Order <strong>#{confirmDialog.po.poNumber}</strong> ({confirmDialog.po.customerName})? Jika ada stok yang sudah ditahan untuk PO ini, stok tersebut akan otomatis dilepaskan kembali ke gudang.
                  </>
                ) : (
                  <>
                    Hapus data Pre-Order <strong>#{confirmDialog.po.poNumber}</strong> secara permanen dari basis data?
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmDialog({ isOpen: false, type: 'CANCEL', po: null })}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${
                  confirmDialog.type === 'CANCEL'
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
                    {confirmDialog.type === 'CANCEL' ? 'Ya, Batalkan PO' : 'Ya, Hapus Permanen'}
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
