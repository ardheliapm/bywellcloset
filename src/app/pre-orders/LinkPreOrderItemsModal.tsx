'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Link2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { linkPreOrderItemsToProducts, type PreOrderRecord } from './actions';
import type { ProductItem } from '../products/actions';
import { suggestProducts } from '@/lib/productMatching';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import { findLinkableItems } from './linkableItems';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preOrders: PreOrderRecord[];
  products: ProductItem[];
}

export default function LinkPreOrderItemsModal({ isOpen, onClose, preOrders, products }: Props) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ ok: number; allocated: number; failed: string[] } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setChoice({});
      setError(null);
      setReport(null);
      setLoading(false);
    }
  }, [isOpen]);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const rows = useMemo(
    () =>
      findLinkableItems(preOrders, activeProducts).map((r) => ({
        ...r,
        suggestions: suggestProducts(activeProducts, r.item.productSku || '', r.item.productName || '', 3),
      })),
    [preOrders, activeProducts],
  );

  if (!isOpen) return null;

  const picked = rows.filter((r) => choice[r.item.id]);

  const handleSubmit = async () => {
    if (picked.length === 0) {
      setError('Pilih produk tujuan untuk minimal 1 item.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await linkPreOrderItemsToProducts(
        picked.map((r) => ({ itemId: r.item.id, productId: choice[r.item.id] })),
      );
      const results = res.results ?? [];
      if (!res.success && results.length === 0) {
        setError(res.error || 'Gagal menautkan.');
      } else {
        setReport({
          ok: results.filter((x) => x.ok).length,
          allocated: results.reduce((s, x) => s + (x.allocated || 0), 0),
          failed: results.filter((x) => !x.ok).map((x) => x.error || 'Gagal'),
        });
        setChoice({});
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Tautkan Produk</h2>
              <p className="text-xs text-slate-300">Item PO yang namanya tidak dikenali sistem</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {report && (
            <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" /> {report.ok} item berhasil ditautkan
              </div>
              {report.allocated > 0 && <div className="text-xs">{report.allocated} pcs stok bebas langsung dibagikan ke PO.</div>}
              {report.failed.map((f, i) => (
                <div key={i} className="text-xs text-rose-700">{f}</div>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8">Tidak ada item PO yang perlu ditautkan.</div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Pilih produk yang benar untuk tiap item. Nama/SKU item akan disamakan dengan Master, lalu stok bebas
                produk itu dibagikan ke antrean PO (terlama dulu). Keuangan tidak berubah.
              </p>
              {rows.map(({ po, item, suggestions }) => (
                <div key={item.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-800">
                        {item.productSku || '-'} <span className="font-normal text-slate-500">{item.productName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        PO #{po.poNumber} · {po.customerName} · {item.quantityOrdered - item.quantityFulfilled} pcs menunggu
                      </div>
                    </div>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s.product.id}
                          type="button"
                          onClick={() => setChoice((c) => ({ ...c, [item.id]: s.product.id }))}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                            choice[item.id] === s.product.id
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900'
                          }`}
                        >
                          Pakai {s.product.sku} (bebas {s.product.availableStock})
                        </button>
                      ))}
                    </div>
                  )}
                  <SearchableProductSelect
                    products={activeProducts}
                    value={choice[item.id] || ''}
                    onChange={(id) => setChoice((c) => ({ ...c, [item.id]: id }))}
                    placeholder="Atau cari produk lain..."
                    stockType="AVAILABLE"
                  />
                </div>
              ))}
            </>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
            Tutup
          </button>
          <button
            type="button"
            disabled={loading || picked.length === 0}
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Tautkan ({picked.length} item)
          </button>
        </div>
      </div>
    </div>
  );
}
