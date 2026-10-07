'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Package,
  Layers,
  FileText,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import { InboundShipmentRecord, receiveInboundShipment } from './inboundActions';

interface AuditInboundModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: InboundShipmentRecord | null;
  onReceived?: () => void;
}

interface AuditRow {
  itemId: string;
  productId: string | null;
  productSku: string;
  productName: string;
  expectedQty: number;
  receivedQty: number;
  notes: string;
}

export default function AuditInboundModal({
  isOpen,
  onClose,
  shipment,
  onReceived,
}: AuditInboundModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [freightCost, setFreightCost] = useState<number>(0);
  const [auditNotes, setAuditNotes] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAttachment, setShowAttachment] = useState(false);
  const [successSummary, setSuccessSummary] = useState<{
    totalReceived: number;
    poAllocations: string[];
  } | null>(null);

  useEffect(() => {
    if (isOpen && shipment) {
      setError(null);
      setSuccessSummary(null);
      setShowAttachment(false);
      setFreightCost(shipment.freightCost || 0);
      setAuditNotes(shipment.auditNotes || '');

      setAuditRows(
        shipment.items.map((it) => ({
          itemId: it.id,
          productId: it.productId,
          productSku: it.productSku,
          productName: it.productName,
          expectedQty: it.expectedQty,
          // If already received before, use receivedQty, else prefill with expectedQty for convenience
          receivedQty: it.receivedQty > 0 ? it.receivedQty : it.expectedQty,
          notes: it.notes || '',
        }))
      );
    }
  }, [isOpen, shipment]);

  if (!isOpen || !shipment) return null;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const totalExpected = auditRows.reduce((acc, r) => acc + r.expectedQty, 0);
  const totalReceived = auditRows.reduce((acc, r) => acc + (Number(r.receivedQty) || 0), 0);
  const totalDiff = totalReceived - totalExpected;

  const handleQtyChange = (idx: number, qty: number) => {
    const updated = [...auditRows];
    updated[idx] = { ...updated[idx], receivedQty: Math.max(0, qty) };
    setAuditRows(updated);
  };

  const handleNotesChange = (idx: number, text: string) => {
    const updated = [...auditRows];
    updated[idx] = { ...updated[idx], notes: text };
    setAuditRows(updated);
  };

  const handleQuickMatchAll = () => {
    const updated = auditRows.map((r) => ({ ...r, receivedQty: r.expectedQty }));
    setAuditRows(updated);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    setLoading(true);

    try {
      const res = await receiveInboundShipment({
        shipmentId: shipment.id,
        freightCost,
        auditNotes: auditNotes.trim() || null,
        items: auditRows.map((r) => ({
          itemId: r.itemId,
          productId: r.productId,
          receivedQty: r.receivedQty,
          notes: r.notes.trim() || null,
        })),
      });

      if (res.success) {
        setSuccessSummary({
          totalReceived: res.totalReceivedPcs || totalReceived,
          poAllocations: res.poAllocations || [],
        });
        startTransition(() => {
          router.refresh();
        });
        if (onReceived) onReceived();
        setTimeout(() => {
          setLoading(false);
          onClose();
        }, 1500);
      } else {
        setLoading(false);
        setError(res.error || 'Gagal menyimpan penerimaan barang.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Terjadi kesalahan sistem saat memproses penerimaan.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Verifikasi & Terima Kedatangan Barang Fisik</h2>
              <p className="text-slate-400 text-xs">
                Surat Jalan #{shipment.invoiceNumber} • Pengirim: {shipment.supplierName || 'Konveksi'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Attachment Preview Banner if exists */}
          {shipment.attachmentUrl && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs text-indigo-950 font-bold">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Ada Lampiran Dokumen / Foto Invoice Asli Vendor</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAttachment(!showAttachment)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                {showAttachment ? 'Tutup Lampiran' : '📷 Buka Foto/Dokumen Invoice'}
              </button>
            </div>
          )}

          {/* Attached Document Visual Viewer */}
          {showAttachment && shipment.attachmentUrl && (
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center animate-in fade-in space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-800">
                <span>Dokumen / Foto Lampiran #{shipment.invoiceNumber}</span>
                <button
                  type="button"
                  onClick={() => setShowAttachment(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {shipment.attachmentType === 'IMAGE' ? (
                <img
                  src={shipment.attachmentUrl}
                  alt="Foto Invoice Vendor"
                  className="max-h-80 mx-auto rounded-lg object-contain shadow-lg"
                />
              ) : (
                <iframe
                  src={shipment.attachmentUrl}
                  title="PDF Preview"
                  className="w-full h-80 rounded-lg bg-white"
                />
              )}
            </div>
          )}

          {successSummary && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Berhasil Memasukkan {successSummary.totalReceived} Pcs ke Stok Fisik!</span>
              </div>
              {successSummary.poAllocations.length > 0 ? (
                <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200 text-emerald-800">
                  <p className="font-bold flex items-center gap-1 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Otomatis Terpotong ke Antrean PO:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {successSummary.poAllocations.map((alloc, i) => (
                      <li key={i}>{alloc}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-emerald-700">Semua stok siap digunakan dan tersimpan di database.</p>
              )}
            </div>
          )}

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Sesuai Surat Jalan</p>
              <p className="text-lg font-black text-slate-800 mt-0.5">{totalExpected} pcs</p>
              <p className="text-[10px] text-slate-500">{auditRows.length} macam SKU</p>
            </div>

            <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl">
              <p className="text-[11px] font-semibold text-indigo-600 uppercase">Fisik Diterima</p>
              <p className="text-lg font-black text-indigo-900 mt-0.5">{totalReceived} pcs</p>
              <p className="text-[10px] text-indigo-700">Akan masuk stok fisik</p>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                totalDiff > 0
                  ? 'bg-purple-50/50 border-purple-200 text-purple-900'
                  : totalDiff < 0
                  ? 'bg-amber-50/50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase">Status Selisih</p>
              <p className="text-lg font-black mt-0.5">
                {totalDiff > 0 ? `+${totalDiff} pcs (Lebih)` : totalDiff < 0 ? `${totalDiff} pcs (Kurang)` : 'Pas Sesuai'}
              </p>
              <p className="text-[10px] opacity-80">
                {totalDiff !== 0 ? 'Tercatat di riwayat stok' : 'Tidak ada selisih'}
              </p>
            </div>
          </div>

          {/* Checklist Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-indigo-600" /> Ceklis Fisik Barang per Motif
              </h3>
              <button
                type="button"
                onClick={handleQuickMatchAll}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
              >
                Set Semua Sesuai Invoice
              </button>
            </div>

            <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden">
              {auditRows.map((row, idx) => {
                const diff = row.receivedQty - row.expectedQty;

                return (
                  <div key={row.itemId} className="p-3.5 space-y-2 text-xs hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[11px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                          {row.productSku}
                        </span>
                        <span className="font-semibold text-slate-900">{row.productName}</span>
                      </div>

                      {/* Expected vs Actual Counter */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                        <span className="text-slate-400 text-xs">
                          Invoice: <strong className="text-slate-700 font-mono">{row.expectedQty}</strong> pcs
                        </span>

                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-bold text-slate-700">Fisik:</label>
                          <input
                            type="number"
                            min="0"
                            value={row.receivedQty}
                            onChange={(e) => handleQtyChange(idx, parseInt(e.target.value, 10) || 0)}
                            className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <span className="text-slate-600 font-medium">pcs</span>
                        </div>

                        {/* Diff Badge */}
                        {diff > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            <TrendingUp className="w-3 h-3" /> +{diff} Lebih
                          </span>
                        )}
                        {diff < 0 && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <TrendingDown className="w-3 h-3" /> {diff} Kurang
                          </span>
                        )}
                        {diff === 0 && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Sesuai
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Notes if there is a difference */}
                    {diff !== 0 && (
                      <div className="pl-2 pt-1 border-l-2 border-indigo-200">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => handleNotesChange(idx, e.target.value)}
                          placeholder={`Catatan selisih ${diff > 0 ? 'lebihan' : 'kekurangan'} untuk ${row.productSku} (cth: kurang dari pabrik / salah jahit)...`}
                          className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 text-[11px] placeholder:text-slate-400"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Freight Cost */}
          <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <Truck className="w-4 h-4 text-amber-600" /> Biaya Ongkir Pengiriman Ini (Rp)
            </div>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1.5 text-xs font-semibold text-amber-700">Rp</span>
              <input
                type="number"
                min="0"
                value={freightCost || ''}
                onChange={(e) => setFreightCost(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-950 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <p className="text-[11px] text-amber-800">
              * Nominal ongkir akan otomatis dicatat sebagai transaksi Pengeluaran di Laporan Keuangan.
            </p>
          </div>

          {/* General Audit Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Keseluruhan Penerimaan (Opsional)
            </label>
            <input
              type="text"
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              placeholder="Contoh: Paket diterima utuh oleh Admin A, kondisi bagus"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs">
            <span className="text-slate-500">Total Masuk Stok: </span>
            <strong className="text-slate-900 font-mono text-sm">{totalReceived} pcs</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={loading || isPending}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading || isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Memproses...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Konfirmasi & Masuk Stok ({totalReceived} Pcs)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
