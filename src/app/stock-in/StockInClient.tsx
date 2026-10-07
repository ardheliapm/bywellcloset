'use client';

import React, { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Truck,
  Package,
  Search,
  Clock,
  Calendar,
  Building2,
  FileText,
  Boxes,
  Layers,
  Sparkles,
  XCircle,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { submitStockInBatch } from './actions';
import { InboundShipmentRecord, cancelInboundShipment, deleteInboundShipment } from './inboundActions';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import CreateInboundModal from './CreateInboundModal';
import AuditInboundModal from './AuditInboundModal';

interface StockInClientProps {
  products: ProductItem[];
  history: any[];
  inboundShipments?: InboundShipmentRecord[];
}

interface FormRow {
  productId: string;
  quantity: number;
}

export default function StockInClient({
  products,
  history,
  inboundShipments = [],
}: StockInClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab State: Default is 'inbound' (Surat Jalan Gudang)
  const [activeTab, setActiveTab] = useState<'inbound' | 'direct'>('inbound');

  // Search & Filter for Inbound
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals state
  const [isCreateInboundOpen, setIsCreateInboundOpen] = useState(false);
  const [selectedShipmentForAudit, setSelectedShipmentForAudit] = useState<InboundShipmentRecord | null>(null);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'CANCEL' | 'DELETE';
    shipment: InboundShipmentRecord | null;
  }>({
    isOpen: false,
    type: 'CANCEL',
    shipment: null,
  });
  const [actionLoading, setActionLoading] = useState(false);

  // Direct Restok Form State
  const [rows, setRows] = useState<FormRow[]>([{ productId: '', quantity: 1 }]);
  const [freightCost, setFreightCost] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // KPI Calculations
  const onDeliveryCount = useMemo(
    () => inboundShipments.filter((s) => s.status === 'ON_DELIVERY').length,
    [inboundShipments]
  );
  const onDeliveryPcs = useMemo(
    () =>
      inboundShipments
        .filter((s) => s.status === 'ON_DELIVERY')
        .reduce((acc, s) => acc + s.totalExpectedPcs, 0),
    [inboundShipments]
  );
  const receivedCount = useMemo(
    () => inboundShipments.filter((s) => s.status === 'RECEIVED').length,
    [inboundShipments]
  );
  const receivedPcs = useMemo(
    () =>
      inboundShipments
        .filter((s) => s.status === 'RECEIVED')
        .reduce((acc, s) => acc + s.totalReceivedPcs, 0),
    [inboundShipments]
  );

  // Filtered Inbound Shipments
  const filteredShipments = useMemo(() => {
    return inboundShipments.filter((s) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        s.invoiceNumber.toLowerCase().includes(q) ||
        (s.supplierName && s.supplierName.toLowerCase().includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q)) ||
        s.items.some(
          (it) =>
            it.productName.toLowerCase().includes(q) ||
            it.productSku.toLowerCase().includes(q)
        );

      let matchesStatus = true;
      if (statusFilter !== 'ALL') {
        matchesStatus = s.status === statusFilter;
      }

      return matchesSearch && matchesStatus;
    });
  }, [inboundShipments, searchTerm, statusFilter]);

  // Handle Action Execute (Cancel/Delete)
  const handleExecuteAction = async () => {
    if (!confirmDialog.shipment) return;
    setActionLoading(true);

    if (confirmDialog.type === 'CANCEL') {
      await cancelInboundShipment(confirmDialog.shipment.id);
    } else if (confirmDialog.type === 'DELETE') {
      await deleteInboundShipment(confirmDialog.shipment.id);
    }

    setActionLoading(false);
    setConfirmDialog({ isOpen: false, type: 'CANCEL', shipment: null });
    startTransition(() => {
      router.refresh();
    });
  };

  // Direct Restok Handlers
  const handleAddRow = () => {
    setRows([...rows, { productId: '', quantity: 1 }]);
  };

  const handleRemoveRow = (idx: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== idx));
  };

  const handleRowChange = (idx: number, field: keyof FormRow, value: any) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: value };
    setRows(updated);
  };

  const totalItemsCount = rows.reduce((acc, r) => acc + (r.quantity || 0), 0);

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const validRows = rows.filter((r) => r.productId && r.quantity > 0);
    if (validRows.length === 0) {
      setError('Silakan pilih produk dan tentukan jumlah stok masuk (minimal 1 pcs).');
      return;
    }

    setLoading(true);
    const res = await submitStockInBatch(validRows, freightCost, notes);
    setLoading(false);

    if (res.success) {
      setSuccessMsg(
        `Berhasil menambahkan ${res.totalPcs} pcs stok masuk ke database! ${
          freightCost > 0 ? `(Biaya ongkir ${formatRupiah(freightCost)} tercatat di Keuangan)` : ''
        }`
      );
      setRows([{ productId: '', quantity: 1 }]);
      setFreightCost(0);
      setNotes('');
      startTransition(() => {
        router.refresh();
      });
    } else {
      setError(res.error || 'Gagal menyimpan stok masuk.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center">
              <ArrowDownToLine className="w-5 h-5" />
            </div>
            Stok Masuk & Kedatangan Gudang
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Kelola surat jalan pengiriman dari konveksi (inbound) & pencatatan kedatangan fisik dengan audit selisih.
          </p>
        </div>

        {activeTab === 'inbound' && (
          <button
            type="button"
            onClick={() => setIsCreateInboundOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Catat Surat Jalan Baru
          </button>
        )}
      </div>

      {/* Mode Tabs: Inbound Shipments vs Direct Restok */}
      <div className="flex border-b border-slate-200 bg-white px-4 pt-3 rounded-2xl shadow-xs gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('inbound')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'inbound'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" /> 🚚 Surat Jalan & Invoice Gudang (Inbound)
          {onDeliveryCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold">
              {onDeliveryCount} OTW
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('direct')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'direct'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" /> ⚡ Restok Langsung (Quick Stock-In)
        </button>
      </div>

      {/* TAB 1: INBOUND SHIPMENTS */}
      {activeTab === 'inbound' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Sedang Dalam Pengiriman */}
            <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-amber-50/40">
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  Sedang Dikirim (OTW)
                </p>
                <p className="text-2xl font-black text-amber-900 mt-1">
                  {onDeliveryPcs} <span className="text-xs font-semibold">pcs</span>
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {onDeliveryCount} Surat Jalan belum tiba
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
            </div>

            {/* Sudah Tiba & Diterima */}
            <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-emerald-50/40">
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                  Sudah Diterima Fisik
                </p>
                <p className="text-2xl font-black text-emerald-900 mt-1">
                  {receivedPcs} <span className="text-xs font-semibold">pcs</span>
                </p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  {receivedCount} Surat Jalan sudah masuk stok
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* Total Surat Jalan */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total Surat Jalan
                </p>
                <p className="text-2xl font-black text-slate-800 mt-1">
                  {inboundShipments.length} <span className="text-xs font-semibold">Invoice</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Riwayat kiriman dari konveksi</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
                <Boxes className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari No. Surat Jalan, Pengirim, SKU motif..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                {[
                  { id: 'ALL', label: `Semua (${inboundShipments.length})` },
                  { id: 'ON_DELIVERY', label: `Dalam Pengiriman (${onDeliveryCount})` },
                  { id: 'RECEIVED', label: `Selesai Diterima (${receivedCount})` },
                  { id: 'CANCELLED', label: 'Dibatalkan' },
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
          </div>

          {/* Inbound Shipments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredShipments.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 mx-auto flex items-center justify-center">
                  <Truck className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  {inboundShipments.length === 0
                    ? 'Belum Ada Surat Jalan Kiriman Gudang'
                    : 'Surat Jalan Tidak Ditemukan'}
                </h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  {inboundShipments.length === 0
                    ? 'Gunakan tombol "+ Catat Surat Jalan Baru" untuk mencatat invoice pengiriman dari konveksi (misal setiap hari Rabu).'
                    : 'Coba ubah kata kunci pencarian atau filter status.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">No. Surat Jalan & Tanggal</th>
                      <th className="py-3.5 px-4">Pengirim / Konveksi</th>
                      <th className="py-3.5 px-4">Daftar Barang & Rincian</th>
                      <th className="py-3.5 px-4 text-center">Status Kiriman</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredShipments.map((shipment) => {
                      const isOnDelivery = shipment.status === 'ON_DELIVERY';
                      const isReceived = shipment.status === 'RECEIVED';
                      const isCancelled = shipment.status === 'CANCELLED';

                      return (
                        <tr key={shipment.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Invoice # & Date */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-indigo-950 text-xs tracking-wider flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-indigo-600" /> #{shipment.invoiceNumber}
                            </div>
                            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Dibuat:{' '}
                              {new Date(shipment.createdAt).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            {shipment.expectedDate && isOnDelivery && (
                              <div className="text-[11px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Est. Sampai:{' '}
                                {new Date(shipment.expectedDate).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </div>
                            )}
                          </td>

                          {/* Supplier */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {shipment.supplierName || 'Konveksi'}
                            </div>
                            {shipment.notes && (
                              <div className="text-xs text-slate-500 mt-0.5 italic max-w-xs truncate">
                                &quot;{shipment.notes}&quot;
                              </div>
                            )}
                          </td>

                          {/* Items List */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1 max-w-md">
                              <div className="text-xs font-bold text-slate-800">
                                Total: {isReceived ? shipment.totalReceivedPcs : shipment.totalExpectedPcs} pcs ({shipment.items.length} SKU)
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {shipment.items.slice(0, 5).map((it, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700 font-mono font-medium"
                                  >
                                    {it.productSku} ({isReceived ? it.receivedQty : it.expectedQty} pcs)
                                  </span>
                                ))}
                                {shipment.items.length > 5 && (
                                  <span className="text-[11px] text-slate-400 px-1 py-0.5">
                                    +{shipment.items.length - 5} SKU lainnya
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-4 text-center">
                            {isOnDelivery && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Truck className="w-3.5 h-3.5" /> Dalam Pengiriman
                              </span>
                            )}
                            {isReceived && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Sudah Diterima Fisik
                              </span>
                            )}
                            {isCancelled && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                <XCircle className="w-3.5 h-3.5" /> Dibatalkan
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Audit / Receive Button */}
                              {isOnDelivery && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedShipmentForAudit(shipment)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                                  title="Verifikasi kedatangan barang fisik dan masukkan ke stok"
                                >
                                  <Check className="w-3.5 h-3.5" /> Terima & Ceklis Fisik
                                </button>
                              )}

                              {isReceived && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedShipmentForAudit(shipment)}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                                  title="Lihat rincian audit penerimaan"
                                >
                                  <FileText className="w-3.5 h-3.5 text-indigo-600" /> Detail Audit
                                </button>
                              )}

                              {/* Cancel (Only if ON_DELIVERY) */}
                              {isOnDelivery && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDialog({ isOpen: true, type: 'CANCEL', shipment })}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                                  title="Batalkan Surat Jalan"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}

                              {/* Delete Button (Available for all statuses) */}
                              <button
                                type="button"
                                onClick={() => setConfirmDialog({ isOpen: true, type: 'DELETE', shipment })}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Surat Jalan"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
        </div>
      )}

      {/* TAB 2: DIRECT RESTOK (QUICK STOCK-IN) */}
      {activeTab === 'direct' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Restok Form (8 cols) */}
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="font-bold text-slate-800 text-base">Input Batch Restok Langsung</h2>
              <span className="text-xs font-semibold text-slate-400">Total {rows.length} SKU Dipilih</span>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleDirectSubmit} className="space-y-4">
              {/* Table Rows for Products */}
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="flex-1 w-full space-y-1">
                      <label className="block text-xs font-semibold text-slate-600">
                        Pilih Produk / SKU #{idx + 1}
                      </label>
                      <SearchableProductSelect
                        products={products}
                        value={row.productId}
                        onChange={(val) => handleRowChange(idx, 'productId', val)}
                        placeholder="Ketik SKU / Nama Produk (contoh: BW83, 154, Paris)..."
                        stockType="PHYSICAL"
                      />
                    </div>

                    <div className="w-full sm:w-32">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Jumlah (Pcs)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity || ''}
                        onChange={(e) =>
                          handleRowChange(idx, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 0))
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-center"
                      />
                    </div>

                    <div className="sm:pt-5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        disabled={rows.length === 1}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="px-3.5 py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Tambah Baris Restok
              </button>

              <hr className="border-slate-100 my-4" />

              {/* Freight Shipping Input */}
              <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <Truck className="w-4 h-4 text-amber-600" /> Biaya Ongkir Restok Pengiriman Ini (Rp)
                </div>
                <div className="relative max-w-xs">
                  <span className="absolute left-3.5 top-2 text-xs font-semibold text-amber-700">Rp</span>
                  <input
                    type="number"
                    min="0"
                    value={freightCost || ''}
                    onChange={(e) => setFreightCost(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="Contoh: 31000"
                    className="w-full pl-10 pr-3 py-2 bg-white border border-amber-300 rounded-xl text-sm font-bold text-amber-950 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <p className="text-xs text-amber-800">
                  * Nominal ongkir pengiriman ini akan otomatis dicatat sebagai Pengeluaran Keuangan.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Restok (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Pengiriman Batch 2 dari Konveksi Bandung"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan Restok...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-4 h-4" /> Simpan Restok ({totalItemsCount} Pcs Hijab)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* History Table (4 cols) */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 max-h-[600px] overflow-y-auto">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" /> Riwayat Restok Terakhir
            </h3>

            {history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Belum ada riwayat restok barang.</p>
            ) : (
              <div className="space-y-2.5">
                {history.map((tx) => (
                  <div key={tx.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold font-mono text-slate-800">+{tx.quantity} pcs</span>
                      <span className="text-slate-400 text-[11px]">
                        {new Date(tx.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-indigo-900">
                      {tx.product?.sku} - {tx.product?.name}
                    </p>
                    {tx.notes && <p className="text-[11px] text-slate-500 italic">{tx.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateInboundModal
        isOpen={isCreateInboundOpen}
        onClose={() => setIsCreateInboundOpen(false)}
        products={products}
      />

      <AuditInboundModal
        isOpen={Boolean(selectedShipmentForAudit)}
        onClose={() => setSelectedShipmentForAudit(null)}
        shipment={selectedShipmentForAudit}
      />

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && confirmDialog.shipment && (
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
                {confirmDialog.type === 'CANCEL' ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <Trash2 className="w-6 h-6" />
                )}
              </div>

              <h3 className="text-lg font-bold text-slate-800">
                {confirmDialog.type === 'CANCEL' ? 'Batalkan Surat Jalan' : 'Hapus Surat Jalan'}
              </h3>

              <p className="text-sm text-slate-500">
                {confirmDialog.type === 'CANCEL' ? (
                  <>
                    Yakin ingin membatalkan Surat Jalan <strong>#{confirmDialog.shipment.invoiceNumber}</strong>? Status akan diubah menjadi Dibatalkan.
                  </>
                ) : (
                  <>
                    Hapus data Surat Jalan <strong>#{confirmDialog.shipment.invoiceNumber}</strong> secara permanen?
                    {confirmDialog.shipment.status === 'RECEIVED' && (
                      <span className="block text-xs text-rose-600 font-semibold mt-2 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-left">
                        ⚠️ Surat Jalan ini sudah diverifikasi masuk stok ({confirmDialog.shipment.totalReceivedPcs} pcs). Menghapusnya akan membatalkan dan mengurangi kembali stok fisik produk yang bersangkutan.
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmDialog({ isOpen: false, type: 'CANCEL', shipment: null })}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer ${
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
                    {confirmDialog.type === 'CANCEL' ? 'Ya, Batalkan' : 'Ya, Hapus'}
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
