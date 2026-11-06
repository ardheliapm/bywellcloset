'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import type { ProductItem } from '../products/actions';
import { applyStockOpname, type OpnameApplyRow, type OpnameApplyResult } from './actions';
import {
  buildOpnameDraft,
  parseOpnameText,
  resolveOpnameRow,
  type OpnameDraft,
  type OpnameRow,
} from '@/lib/opnameParser';
import type { ProductSuggestion } from '@/lib/productMatching';

interface Override {
  productId?: string;
  create?: boolean;
  skip?: boolean;
  zero?: boolean;
}

type RowState = 'matched' | 'create' | 'unresolved' | 'error' | 'blank' | 'skipped';

interface RowView {
  key: string;
  row: OpnameRow;
  label: string;
  state: RowState;
  product: ProductItem | null;
  draft: OpnameDraft | null;
  suggestions: ProductSuggestion<ProductItem>[];
  counted: number | null;
  viaSuggestion: boolean;
  duplicate: boolean;
}

const CHUNK_SIZE = 10;

const labelOf = (r: OpnameRow) => [r.rawCollection, r.rawName].filter(Boolean).join(' ').trim();

export default function StockOpnameClient({ products }: { products: ProductItem[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [zeroMissing, setZeroMissing] = useState(false);
  const [blankAsZero, setBlankAsZero] = useState(false);
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<OpnameApplyResult[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  const views: RowView[] = useMemo(() => {
    const rows = parseOpnameText(text);
    const out: RowView[] = rows.map((row) => {
      const key = String(row.line);
      const ov = overrides[key] || {};
      const label = labelOf(row);
      let product: ProductItem | null = null;
      let suggestions: ProductSuggestion<ProductItem>[] = [];
      let viaSuggestion = false;

      if (ov.productId) {
        product = products.find((p) => p.id === ov.productId) ?? null;
        viaSuggestion = true;
      } else {
        const m = resolveOpnameRow(products, row);
        product = m.product;
        suggestions = m.suggestions;
      }

      const draft = !product ? buildOpnameDraft(row) : null;
      const counted = row.qty !== null ? row.qty : ov.zero || blankAsZero ? 0 : null;

      let state: RowState;
      if (row.error) state = 'error';
      else if (ov.skip) state = 'skipped';
      else if (counted === null) state = 'blank';
      else if (product) state = 'matched';
      else if (ov.create && draft) state = 'create';
      else state = 'unresolved';

      return { key, row, label, state, product, draft, suggestions, counted, viaSuggestion, duplicate: false };
    });

    // Produk yang sama muncul lebih dari sekali
    const byProduct = new Map<string, RowView[]>();
    out.filter((v) => v.state === 'matched' && v.product).forEach((v) => {
      const list = byProduct.get(v.product!.id) ?? [];
      list.push(v);
      byProduct.set(v.product!.id, list);
    });
    byProduct.forEach((list) => {
      if (list.length > 1) list.forEach((v) => (v.duplicate = true));
    });
    return out;
  }, [text, overrides, products, blankAsZero]);

  const referencedIds = useMemo(
    () => new Set(views.filter((v) => v.product && v.state !== 'skipped').map((v) => v.product!.id)),
    [views],
  );

  const missing = useMemo(
    () => activeProducts.filter((p) => !referencedIds.has(p.id)),
    [activeProducts, referencedIds],
  );

  const attention = views.filter(
    (v) => v.state === 'error' || v.state === 'unresolved' || v.duplicate,
  );
  const changes = views.filter(
    (v) =>
      !v.duplicate &&
      ((v.state === 'matched' && v.product && v.counted !== v.product.physicalStock) || v.state === 'create'),
  );
  const same = views.filter(
    (v) => !v.duplicate && v.state === 'matched' && v.product && v.counted === v.product.physicalStock,
  );
  const blanks = views.filter((v) => v.state === 'blank');
  const skipped = views.filter((v) => v.state === 'skipped');
  const missingToZero = zeroMissing ? missing.filter((p) => p.physicalStock !== 0) : [];

  const applyRows: OpnameApplyRow[] = useMemo(() => {
    const list: OpnameApplyRow[] = [];
    changes.forEach((v) => {
      if (v.state === 'create' && v.draft) {
        list.push({
          label: v.label,
          countedQty: v.counted ?? 0,
          create: {
            sku: v.draft.sku,
            name: v.draft.name,
            motif: v.draft.motif,
            color: v.draft.color,
            costPrice: v.draft.costPrice,
            sellingPrice: v.draft.sellingPrice,
            wholesalePrice: v.draft.wholesalePrice,
          },
        });
      } else if (v.product && v.counted !== null) {
        list.push({ label: v.label, productId: v.product.id, countedQty: v.counted });
      }
    });
    missingToZero.forEach((p) => list.push({ label: p.sku, productId: p.id, countedQty: 0 }));
    return list;
  }, [changes, missingToZero]);

  const setOverride = (key: string, patch: Override | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (patch === null) delete next[key];
      else next[key] = { ...(prev[key] || {}), ...patch };
      return next;
    });

  const canApply = applyRows.length > 0 && attention.length === 0 && !applying;

  const totalDelta = changes.reduce(
    (sum, v) => sum + ((v.counted ?? 0) - (v.product?.physicalStock ?? 0)),
    0,
  ) - missingToZero.reduce((sum, p) => sum + p.physicalStock, 0);

  const handleApply = async () => {
    setApplying(true);
    setFatal(null);
    setConfirmOpen(false);
    const all: OpnameApplyResult[] = [];
    setProgress({ done: 0, total: applyRows.length });
    try {
      for (let i = 0; i < applyRows.length; i += CHUNK_SIZE) {
        const chunk = applyRows.slice(i, i + CHUNK_SIZE);
        const res = await applyStockOpname({ rows: chunk, note });
        if (res.results && res.results.length > 0) all.push(...res.results);
        else if (!res.success) {
          chunk.forEach((c) => all.push({ label: c.label, sku: '', ok: false, error: res.error || 'Gagal diproses.' }));
        }
        setProgress({ done: Math.min(i + CHUNK_SIZE, applyRows.length), total: applyRows.length });
      }
    } catch (err: any) {
      setFatal(err?.message || 'Terjadi kesalahan sistem. Cek Riwayat Stok sebelum mengulang.');
    } finally {
      setResults(all);
      setApplying(false);
      setChecked(false);
      router.refresh();
    }
  };

  const reset = () => {
    setText('');
    setOverrides({});
    setZeroMissing(false);
    setBlankAsZero(false);
    setNote('');
    setResults(null);
    setFatal(null);
    setProgress({ done: 0, total: 0 });
  };

  // --- Layar hasil ---
  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    const released = ok.reduce((s, r) => s + (r.releasedFromPo || 0), 0);
    const allocated = ok.reduce((s, r) => s + (r.allocatedToPo || 0), 0);
    const holdWarn = ok.filter((r) => r.holdExceedsPhysical);
    return (
      <div className="space-y-5">
        <Header />
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <CheckCircle2 className="w-5 h-5" /> {ok.length} produk berhasil disamakan dengan hasil hitung
          </div>
          {ok.filter((r) => r.created).length > 0 && (
            <p className="text-sm text-slate-600">{ok.filter((r) => r.created).length} produk baru dibuat di Master.</p>
          )}
          {released > 0 && (
            <p className="text-sm text-amber-700">
              {released} pcs yang tadinya ditahan untuk PO dikembalikan ke antrean (PO terbaru menunggu lagi) karena stok fisik tidak cukup.
            </p>
          )}
          {allocated > 0 && <p className="text-sm text-slate-600">{allocated} pcs dibagikan ke PO yang menunggu.</p>}
          {holdWarn.length > 0 && (
            <p className="text-sm text-amber-700">
              Order HOLD menahan lebih banyak dari stok fisik di: {holdWarn.map((r) => r.sku).join(', ')}. Cek di halaman Orders.
            </p>
          )}
          {failed.length > 0 && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
              <div className="font-bold">{failed.length} baris gagal diproses:</div>
              {failed.map((r, i) => (
                <div key={i}>
                  {r.label}: {r.error}
                </div>
              ))}
              <div className="text-xs text-rose-600">Aman diulang: tempel daftar yang sama lagi, produk yang sudah sesuai tidak diubah dua kali.</div>
            </div>
          )}
          {fatal && <div className="text-sm text-rose-700">{fatal}</div>}
          <p className="text-xs text-slate-500">Semua perubahan tercatat di Riwayat Stok dengan catatan &quot;Stok opname&quot;. Keuangan tidak diubah.</p>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Mulai daftar baru
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header />

      {/* Input */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <label className="text-sm font-bold text-slate-700 block">Tempel hasil hitung fisik</label>
        <p className="text-xs text-slate-500">
          Salin dari Excel / Google Sheets. Kolom: <strong>Nama, Motif/Koleksi, Jumlah</strong> (hijab motif) atau
          <strong> Kode, Jumlah</strong> (Paris Japan, mis. <span className="font-mono">12-2 = 5</span>). Jumlah yang
          dikosongkan dianggap <strong>belum dihitung</strong>, bukan 0. Belum ada yang berubah sampai kamu klik Terapkan.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOverrides({});
          }}
          rows={8}
          placeholder={'Nama\tMotif\tSisa stok\nBlack\tMonogram\t0\nBlush Peony\tOwn\t0\n12-2\t5'}
          className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
        />
        <div className="text-xs text-slate-500">
          {views.length > 0 ? `${views.length} baris terbaca.` : 'Belum ada daftar.'}
        </div>
      </div>

      {views.length > 0 && (
        <>
          {/* Perlu keputusan */}
          {attention.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4" /> {attention.length} baris perlu keputusanmu dulu
              </div>
              {attention.map((v) => (
                <div key={v.key} className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-800">
                      {v.label}
                      {v.counted !== null && <span className="ml-2 font-mono text-slate-500">{v.counted} pcs</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">baris {v.row.line}</div>
                  </div>

                  {v.state === 'error' && (
                    <div className="text-xs text-rose-700">
                      {v.row.error}. Perbaiki di kotak teks di atas.
                    </div>
                  )}

                  {v.duplicate && (
                    <div className="text-xs text-rose-700 space-y-1.5">
                      <div>
                        Produk <strong>{v.product?.sku}</strong> muncul lebih dari sekali di daftar. Lewati salah satunya.
                      </div>
                      <SmallBtn onClick={() => setOverride(v.key, { skip: true })}>Lewati baris ini</SmallBtn>
                    </div>
                  )}

                  {v.state === 'unresolved' && (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-600">
                        {v.suggestions.length > 0 ? 'Belum ada di Master. Mirip dengan:' : 'Belum ada di Master. Tidak ada produk yang mirip.'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {v.suggestions.map((s) => (
                          <SmallBtn key={s.product.id} onClick={() => setOverride(v.key, { productId: s.product.id })}>
                            Pakai {s.product.sku} ({s.product.physicalStock} di sistem)
                          </SmallBtn>
                        ))}
                        {v.draft && (
                          <SmallBtn tone="indigo" onClick={() => setOverride(v.key, { create: true })}>
                            <Plus className="w-3 h-3" /> Buat produk baru: {v.draft.sku}
                          </SmallBtn>
                        )}
                        <SmallBtn tone="slate" onClick={() => setOverride(v.key, { skip: true })}>
                          Lewati
                        </SmallBtn>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Akan diubah */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-800">
                Akan diubah ({changes.length + missingToZero.length} produk)
              </div>
              <div className="text-xs text-slate-500">
                Total selisih: <strong className={totalDelta < 0 ? 'text-rose-600' : 'text-emerald-600'}>{totalDelta > 0 ? `+${totalDelta}` : totalDelta} pcs</strong>
              </div>
            </div>
            {changes.length + missingToZero.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">Belum ada perubahan.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-5 py-2">Produk</th>
                      <th className="text-right px-3 py-2">Sistem</th>
                      <th className="text-right px-3 py-2">Tahan</th>
                      <th className="text-right px-3 py-2">Hitungan</th>
                      <th className="text-right px-3 py-2">Selisih</th>
                      <th className="text-left px-5 py-2">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {changes.map((v) => {
                      const before = v.product?.physicalStock ?? 0;
                      const reserved = v.product?.reservedStock ?? 0;
                      const counted = v.counted ?? 0;
                      const diff = counted - before;
                      return (
                        <tr key={v.key}>
                          <td className="px-5 py-2">
                            <div className="font-semibold text-slate-800">{v.state === 'create' ? v.draft?.sku : v.product?.sku}</div>
                            <div className="text-[11px] text-slate-400">{v.label}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{v.state === 'create' ? '-' : before}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">{v.state === 'create' ? '-' : reserved}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold">{counted}</td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${diff < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="px-5 py-2 text-xs space-x-2">
                            {v.state === 'create' && (
                              <>
                                <span className="text-indigo-600 font-semibold">Produk baru</span>
                                <button type="button" onClick={() => setOverride(v.key, { create: false })} className="text-slate-400 hover:text-slate-600 underline cursor-pointer">batal</button>
                              </>
                            )}
                            {v.viaSuggestion && (
                              <>
                                <span className="text-slate-500">dipilih manual</span>
                                <button type="button" onClick={() => setOverrides((p) => { const n = { ...p }; if (n[v.key]) { delete n[v.key].productId; } return n; })} className="text-slate-400 hover:text-slate-600 underline cursor-pointer">ubah</button>
                              </>
                            )}
                            {counted < reserved && (
                              <span className="text-amber-700">
                                Tahanan {reserved} pcs melebihi hitungan: PO terbaru menunggu lagi
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {missingToZero.map((p) => (
                      <tr key={p.id} className="bg-slate-50/50">
                        <td className="px-5 py-2">
                          <div className="font-semibold text-slate-800">{p.sku}</div>
                          <div className="text-[11px] text-slate-400">tidak ada di daftar, dianggap 0</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{p.physicalStock}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{p.reservedStock}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">0</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-rose-600">-{p.physicalStock}</td>
                        <td className="px-5 py-2 text-xs text-amber-700">
                          {p.reservedStock > 0 ? `Tahanan ${p.reservedStock} pcs akan dilepas` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ringkasan lain */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <div className="text-sm font-bold text-slate-800">Sudah sama dengan sistem ({same.length})</div>
              <div className="text-xs text-slate-500">{same.map((v) => v.product?.sku).join(', ') || '-'}</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <div className="text-sm font-bold text-slate-800">Jumlah kosong, belum dihitung ({blanks.length})</div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={blankAsZero} onChange={(e) => setBlankAsZero(e.target.checked)} />
                Anggap semua jumlah kosong = 0 (habis)
              </label>
              <div className="text-xs text-slate-500">Kalau tidak dicentang, stok baris ini tidak diubah.</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {blanks.map((v) => (
                  <div key={v.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700">
                      {v.product?.sku ?? v.label}
                      {v.product ? <span className="text-slate-400"> (sistem {v.product.physicalStock})</span> : <span className="text-slate-400"> (belum ada di Master)</span>}
                    </span>
                    <SmallBtn tone="slate" onClick={() => setOverride(v.key, { zero: true })}>Anggap 0</SmallBtn>
                  </div>
                ))}
                {blanks.length === 0 && <div className="text-xs text-slate-400">-</div>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer select-none">
              <input type="checkbox" checked={zeroMissing} onChange={(e) => setZeroMissing(e.target.checked)} />
              Produk di Master yang tidak ada di daftar dianggap 0 ({missing.length} produk)
            </label>
            <div className="text-xs text-slate-500">
              Biarkan mati kalau daftarmu belum lengkap, misalnya Paris Japan belum ditempel. Stok produk ini tidak diubah.
            </div>
            <div className="text-xs text-slate-500 max-h-24 overflow-y-auto">
              {missing.map((p) => `${p.sku} (${p.physicalStock})`).join(', ') || '-'}
            </div>
            {skipped.length > 0 && (
              <div className="text-xs text-slate-400">Dilewati: {skipped.map((v) => v.label).join(', ')}</div>
            )}
          </div>

          {/* Terapkan */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan (opsional), mis. hitung fisik rumah"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
            />
            {applying && (
              <div className="text-sm text-indigo-700 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Menerapkan {progress.done}/{progress.total} produk...
              </div>
            )}
            <button
              type="button"
              disabled={!canApply}
              onClick={() => setConfirmOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" /> Terapkan ke stok ({applyRows.length} produk) <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {attention.length > 0 && (
              <div className="text-xs text-amber-700">Selesaikan {attention.length} baris yang perlu keputusan dulu.</div>
            )}
          </div>
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Terapkan stok opname?</h3>
            <div className="text-sm text-slate-600 space-y-2">
              <p>
                Stok fisik <strong>{applyRows.length} produk</strong> akan diubah menjadi hasil hitungmu (total selisih{' '}
                <strong>{totalDelta > 0 ? `+${totalDelta}` : totalDelta} pcs</strong>).
              </p>
              <p>
                Selisih dicatat di Riwayat Stok. Kalau stok fisik tidak cukup untuk PO yang sudah ditahan, PO terbaru kembali menunggu. Keuangan tidak berubah.
              </p>
              <p className="text-rose-600 font-semibold">Tidak ada tombol urungkan, jadi pastikan pratinjau sudah benar.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              Saya sudah memeriksa pratinjau
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setChecked(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!checked}
                onClick={handleApply}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Ya, terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        Stok Opname
      </h1>
      <p className="text-slate-500 text-sm mt-0.5">
        Samakan stok di sistem dengan hasil hitung fisik. Lihat dulu selisihnya, baru terapkan.
      </p>
    </div>
  );
}

function SmallBtn({
  children,
  onClick,
  tone = 'amber',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'amber' | 'indigo' | 'slate';
}) {
  const cls =
    tone === 'indigo'
      ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
      : tone === 'slate'
      ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
      : 'border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${cls}`}
    >
      {children}
    </button>
  );
}
