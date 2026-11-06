'use client';

import React, { useMemo, useState } from 'react';
import { X, ClipboardList, Printer, Search } from 'lucide-react';
import type { PreOrderRecord } from './actions';
import { buildPickingList } from './pickingList';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preOrders: PreOrderRecord[];
}

export default function PickingListModal({ isOpen, onClose, preOrders }: Props) {
  const [search, setSearch] = useState('');
  const [onlyReady, setOnlyReady] = useState(false);

  const customers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return buildPickingList(preOrders)
      .filter((c) => !onlyReady || c.readyTotal > 0)
      .filter((c) => !term || c.customer.toLowerCase().includes(term));
  }, [preOrders, search, onlyReady]);

  if (!isOpen) return null;

  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const totalReady = customers.reduce((s, c) => s + c.readyTotal, 0);
  const totalWaiting = customers.reduce((s, c) => s + c.waitingTotal, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs picking-overlay">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #picking-print, #picking-print * { visibility: visible !important; }
          #picking-print { position: absolute; left: 0; top: 0; width: 100%; max-height: none !important; overflow: visible !important; }
          .picking-noprint { display: none !important; }
          .picking-card { break-inside: avoid; }
        }
      `}</style>
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between picking-noprint">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Daftar Sisih per Customer</h2>
              <p className="text-xs text-slate-300">Siap disisihkan vs masih menunggu stok</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex flex-wrap items-center gap-3 picking-noprint">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama customer..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={onlyReady} onChange={(e) => setOnlyReady(e.target.checked)} />
            Hanya yang ada stok siap
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Cetak
          </button>
        </div>

        <div id="picking-print" className="p-5 space-y-3 overflow-y-auto">
          <div>
            <div className="text-base font-bold text-slate-800">Daftar Sisih Pre-Order · {today}</div>
            <div className="text-xs text-slate-500">
              {customers.length} customer · siap disisihkan {totalReady} pcs · menunggu stok {totalWaiting} pcs
            </div>
          </div>

          {customers.length === 0 && <div className="text-center text-sm text-slate-500 py-8">Tidak ada PO aktif.</div>}

          {customers.map((c) => (
            <div key={c.customer} className="picking-card border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-800">
                  {c.customer}
                  {c.phone && <span className="ml-2 text-xs font-normal text-slate-500">{c.phone}</span>}
                </div>
                <div className="text-xs">
                  <span className="font-bold text-emerald-700">Siap {c.readyTotal}</span>
                  <span className="mx-1.5 text-slate-300">|</span>
                  <span className="font-bold text-amber-700">Menunggu {c.waitingTotal}</span>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left py-1">Produk</th>
                    <th className="text-left py-1">PO</th>
                    <th className="text-right py-1">Siap</th>
                    <th className="text-right py-1">Menunggu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1 font-semibold text-slate-800">
                        {l.sku} <span className="font-normal text-slate-400">{l.name !== l.sku ? l.name : ''}</span>
                      </td>
                      <td className="py-1 text-slate-500">#{l.poNumber}</td>
                      <td className="py-1 text-right font-mono font-bold text-emerald-700">{l.ready || '-'}</td>
                      <td className="py-1 text-right font-mono font-bold text-amber-700">{l.waiting || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {c.notes.length > 0 && (
                <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  {c.notes.map((n, i) => (
                    <div key={i}>Catatan {n}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
