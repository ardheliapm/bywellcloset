'use client';

import React, { useState } from 'react';
import {
  X,
  Truck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Package,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { PreOrderRecord, shipPreOrderItems, ShipItemInput } from './actions';

interface ShipPreOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  preOrder: PreOrderRecord | null;
  onShipped?: () => void;
}

export default function ShipPreOrderModal({
  isOpen,
  onClose,
  preOrder,
  onShipped,
}: ShipPreOrderModalProps) {
  const [quantitiesToShip, setQuantitiesToShip] = useState<Record<string, number>>({});
  const [shippingNotes, setShippingNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (preOrder) {
      const initial: Record<string, number> = {};
      preOrder.items.forEach((it) => {
        const ready = it.quantityFulfilled - it.quantityShipped;
        initial[it.id] = Math.max(0, ready);
      });
      setQuantitiesToShip(initial);
      setShippingNotes('');
      setError(null);
    }
  }, [preOrder]);

  if (!isOpen || !preOrder) return null;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const totalPcsToShip = Object.values(quantitiesToShip).reduce((acc, q) => acc + (q || 0), 0);
  const totalNominalToShip = preOrder.items.reduce((acc, it) => {
    const q = quantitiesToShip[it.id] || 0;
    return acc + it.price * q;
  }, 0);

  const handleQtyChange = (itemId: string, val: number, maxQty: number) => {
    setQuantitiesToShip((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Math.min(val, maxQty)),
    }));
  };

  const handleSetAllMax = () => {
    const maxes: Record<string, number> = {};
    preOrder.items.forEach((it) => {
      const ready = it.quantityFulfilled - it.quantityShipped;
      maxes[it.id] = Math.max(0, ready);
    });
    setQuantitiesToShip(maxes);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const shipInputs: ShipItemInput[] = Object.entries(quantitiesToShip)
      .filter(([_, q]) => q > 0)
      .map(([itemId, quantityToShip]) => ({ itemId, quantityToShip }));

    if (shipInputs.length === 0) {
      setError('Pilih minimal 1 pcs barang ready untuk diproses kirim.');
      return;
    }

    setLoading(true);

    const res = await shipPreOrderItems(preOrder.id, shipInputs, shippingNotes);

    setLoading(false);

    if (res.success) {
      if (onShipped) onShipped();
      onClose();
    } else {
      setError(res.error || 'Gagal memproses pengiriman PO.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Kirim Barang PO #{preOrder.poNumber}</h2>
              <p className="text-slate-400 text-xs">
                Customer: <strong className="text-white">{preOrder.customerName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form id="ship-po-form" onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800">
              Tentukan Jumlah Barang Ready yang Dikirim Sekarang:
            </span>
            <button
              type="button"
              onClick={handleSetAllMax}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 underline"
            >
              Kirim Semua yang Ready
            </button>
          </div>

          {/* List of items */}
          <div className="space-y-2.5">
            {preOrder.items.map((it) => {
              const ready = it.quantityFulfilled - it.quantityShipped;
              const currentQty = quantitiesToShip[it.id] || 0;

              return (
                <div
                  key={it.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                    ready > 0
                      ? 'bg-slate-50 border-slate-200/90'
                      : 'bg-slate-100/60 border-slate-200/50 opacity-60'
                  }`}
                >
                  <div className="truncate flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        {it.productSku}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{it.productName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                      <span>Total PO: <strong>{it.quantityOrdered} pcs</strong></span>
                      <span>•</span>
                      <span>Sudah Ready: <strong className={ready > 0 ? 'text-emerald-600 font-bold' : ''}>{ready} pcs</strong></span>
                      <span>•</span>
                      <span>Sudah Dikirim: {it.quantityShipped} pcs</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <input
                        type="number"
                        min="0"
                        max={ready}
                        disabled={ready <= 0}
                        value={currentQty}
                        onChange={(e) =>
                          handleQtyChange(it.id, parseInt(e.target.value, 10) || 0, ready)
                        }
                        className="w-16 text-center px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-100"
                      />
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        maks: {ready} pcs
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expedition / Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Pengiriman / Ekspedisi (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: J&T Resi 123456 / Dikirim Parsial Batch 1"
              value={shippingNotes}
              onChange={(e) => setShippingNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">
              Total Dikirim: <strong className="text-slate-900 font-mono text-sm">{totalPcsToShip} pcs</strong>
            </div>
            <div className="text-xs text-slate-500">
              Nominal Masuk Kas: <strong className="text-blue-600 font-bold">{formatRupiah(totalNominalToShip)}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              form="ship-po-form"
              disabled={loading || totalPcsToShip <= 0}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Memproses...
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" /> Konfirmasi Pengiriman ({totalPcsToShip} Pcs)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
