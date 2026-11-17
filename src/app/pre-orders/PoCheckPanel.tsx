'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PreviewLine, PreviewProduct } from '@/lib/poPreview';
import { buildNewProductDraft } from '@/lib/productMatching';

interface Props<P extends PreviewProduct> {
  lines: PreviewLine<P>[];
  /** Dipanggil saat pengguna memilih saran produk untuk baris yang tidak dikenali */
  onPick: (itemId: string, product: P) => void;
  /** Dipanggil saat pengguna memilih membuat produk baru untuk baris yang tidak dikenali */
  onCreate?: (itemId: string) => void;
  /** Id baris yang sedang dibuatkan produknya */
  creatingId?: string | null;
}

/** Pratinjau sebelum PO disimpan: produk Master yang dituju, stok bebas, dan berapa pcs yang langsung siap. */
export default function PoCheckPanel<P extends PreviewProduct>({ lines, onPick, onCreate, creatingId }: Props<P>) {
  if (lines.length === 0) return null;
  const unknown = lines.filter((l) => !l.product).length;

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-800">Periksa sebelum disimpan</h4>
        {unknown > 0 ? (
          <span className="text-[11px] font-bold text-amber-700">{unknown} produk tidak dikenali</span>
        ) : (
          <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Semua produk dikenali
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-100 text-xs">
        {lines.map((l) =>
          l.product ? (
            <div key={l.itemId} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono font-bold">
                  {l.product.sku}
                </span>
                <span className="ml-2 text-slate-500">{l.quantity} pcs</span>
              </div>
              <div className="text-[11px] text-slate-600">
                Stok bebas <strong>{l.free}</strong> ·{' '}
                {l.ready > 0 ? (
                  <span className="text-emerald-700 font-bold">langsung siap {l.ready} pcs</span>
                ) : (
                  <span className="text-slate-500">belum ada yang siap</span>
                )}
                {l.waiting > 0 && <span className="text-amber-700 font-bold"> · menunggu {l.waiting} pcs</span>}
              </div>
            </div>
          ) : (
            <div key={l.itemId} className="py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> &quot;{l.typed || '(kosong)'}&quot; tidak ada di Master Produk ({l.quantity} pcs)
              </div>
              {l.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {l.suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onPick(l.itemId, s)}
                      className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-semibold cursor-pointer"
                    >
                      Pakai {s.sku} (bebas {Math.max(0, s.physicalStock - s.reservedStock)})
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">Tidak ada saran. Periksa ejaannya, atau buat produk baru di bawah.</div>
              )}
              {onCreate && (() => {
                const draft = buildNewProductDraft(l.rawSku, l.rawName);
                if (!draft) return null;
                return (
                  <button
                    type="button"
                    disabled={creatingId === l.itemId}
                    onClick={() => onCreate(l.itemId)}
                    className="px-2.5 py-1 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {creatingId === l.itemId ? 'Membuat...' : `+ Buat produk baru "${draft.sku}" (${draft.name})`}
                  </button>
                );
              })()}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
