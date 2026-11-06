'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, PackageCheck, Loader2, AlertCircle, Search, Info } from 'lucide-react';
import { PreOrderRecord, settlePreOrdersAsShipped } from './actions';

interface SettlePreOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  preOrders: PreOrderRecord[];
  initialSelectedId?: string | null;
}

const isActive = (po: PreOrderRecord) => po.status !== 'CANCELLED' && po.status !== 'SHIPPED';

const waitingPcs = (po: PreOrderRecord) =>
  po.items.reduce((sum, it) => sum + Math.max(0, it.quantityOrdered - it.quantityFulfilled), 0);

const formatDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SettlePreOrdersModal({
  isOpen,
  onClose,
  preOrders,
  initialSelectedId,
}: SettlePreOrdersModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(initialSelectedId ? new Set([initialSelectedId]) : new Set());
      setSearch('');
      // Kalau dibuka dari satu PO yang tidak punya item menunggu, tampilkan semua supaya PO itu terlihat
      const initial = initialSelectedId ? preOrders.find((p) => p.id === initialSelectedId) : null;
      setShowAll(!!initial && waitingPcs(initial) === 0);
      setError(null);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSelectedId]);

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return preOrders
      .filter(isActive)
      .filter((po) => showAll || waitingPcs(po) > 0)
      .filter((po) => {
        if (!term) return true;
        return (
          po.customerName.toLowerCase().includes(term) ||
          po.poNumber.toLowerCase().includes(term) ||
          po.items.some(
            (it) =>
              it.productSku.toLowerCase().includes(term) ||
              it.productName.toLowerCase().includes(term)
          )
        );
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [preOrders, search, showAll]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = candidates.length > 0 && candidates.every((po) => selected.has(po.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) candidates.forEach((po) => next.delete(po.id));
      else candidates.forEach((po) => next.add(po.id));
      return next;
    });
  };

  const selectedPos = preOrders.filter((po) => selected.has(po.id) && isActive(po));
  const selectedPcs = selectedPos.reduce(
    (sum, po) => sum + po.items.reduce((s, it) => s + it.quantityOrdered, 0),
    0
  );

  const handleSubmit = async () => {
    if (selectedPos.length === 0) {
      setError('Pilih minimal 1 Pre-Order.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await settlePreOrdersAsShipped(selectedPos.map((po) => po.id));
      if (res.success) {
        const failedCount = res.failed?.length || 0;
        if (failedCount > 0) {
          alert(
            `${res.settled} PO selesai. ${failedCount} PO gagal diproses, coba lagi untuk sisanya.`
          );
        }
        onClose();
      } else {
        setError(res.error || 'Gagal menyelesaikan Pre-Order.');
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Selesaikan PO yang Sudah Terkirim</h2>
              <p className="text-xs text-slate-300">
                Untuk PO yang barangnya sudah dikirim tapi masih nyangkut di antrean
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info */}
        <div className="px-6 pt-4">
          <div className="flex items-start gap-2 text-xs text-slate-600 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                PO yang dipilih ditandai <strong>terkirim semua</strong> dan keluar dari antrean.
                <strong> Tidak ada pemasukan yang dicatat</strong> di Keuangan dan status bayar tidak berubah.
              </p>
              <p>
                Barang yang sudah ready tapi belum dikirim dikurangi dari stok seperti pengiriman biasa.
                Barang yang belum ready tidak menyentuh stok, selisihnya dibereskan lewat hitung fisik.
              </p>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="px-6 pt-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari customer, no. PO, atau motif..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Tampilkan semua PO aktif
          </label>
        </div>

        {/* List */}
        <div className="px-6 py-3 overflow-y-auto flex-1 space-y-2">
          {candidates.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-10">
              {showAll
                ? 'Tidak ada PO aktif yang cocok.'
                : 'Tidak ada PO yang nyangkut. Centang "Tampilkan semua PO aktif" untuk melihat yang lain.'}
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none pb-1">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                Pilih semua yang tampil ({candidates.length})
              </label>

              {candidates.map((po) => {
                const waiting = waitingPcs(po);
                const isChecked = selected.has(po.id);
                return (
                  <label
                    key={po.id}
                    className={`block rounded-xl border p-3 cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-indigo-300 bg-indigo-50/60'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(po.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-sm text-slate-800 truncate">
                            {po.customerName}
                          </div>
                          <div className="text-[11px] text-slate-500 shrink-0">
                            {formatDate(po.createdAt)}
                          </div>
                        </div>
                        <div className="text-[11px] font-mono text-indigo-700">#{po.poNumber}</div>
                        <div className="mt-1.5 space-y-0.5">
                          {po.items.map((it) => {
                            const isWaiting = it.quantityFulfilled < it.quantityOrdered;
                            return (
                              <div
                                key={it.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span
                                  className={`truncate ${
                                    isWaiting ? 'text-amber-700 font-semibold' : 'text-slate-600'
                                  }`}
                                >
                                  {it.productSku || it.productName}
                                </span>
                                <span
                                  className={`shrink-0 font-mono ${
                                    isWaiting ? 'text-amber-700 font-semibold' : 'text-slate-500'
                                  }`}
                                >
                                  {it.quantityFulfilled} / {it.quantityOrdered} pcs
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {waiting > 0 && (
                          <div className="mt-1.5 text-[11px] text-amber-700">
                            {waiting} pcs belum ready (nyangkut)
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {selectedPos.length > 0 ? (
              <>
                <strong>{selectedPos.length}</strong> PO dipilih ({selectedPcs} pcs)
              </>
            ) : (
              'Belum ada PO dipilih'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || selectedPos.length === 0}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memproses...
                </>
              ) : (
                <>
                  <PackageCheck className="w-3.5 h-3.5" /> Selesaikan {selectedPos.length || ''} PO
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
