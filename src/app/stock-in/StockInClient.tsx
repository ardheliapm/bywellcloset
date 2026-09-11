'use client';

import React, { useState } from 'react';
import { ArrowDownToLine, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Truck, Package, Search } from 'lucide-react';
import { ProductItem } from '../products/actions';
import { submitStockInBatch } from './actions';

interface StockInClientProps {
  products: ProductItem[];
  history: any[];
}

interface FormRow {
  productId: string;
  quantity: number;
}

export default function StockInClient({ products, history }: StockInClientProps) {
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

  const handleSubmit = async (e: React.FormEvent) => {
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
      setSuccessMsg(`Berhasil menambahkan ${res.totalPcs} pcs stok masuk ke database! ${freightCost > 0 ? `(Biaya ongkir ${formatRupiah(freightCost)} tercatat di Keuangan)` : ''}`);
      setRows([{ productId: '', quantity: 1 }]);
      setFreightCost(0);
      setNotes('');
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
            Stok Masuk (Restok Barang)
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Form pencatatan kedatangan barang dari konveksi/supplier & alokasi biaya pengeluaran ongkir.
          </p>
        </div>
      </div>

      {/* Main Grid: Form Left, Summary Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Restok Form (8 cols) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="font-bold text-slate-800 text-base">Input Batch Restok Kedatangan</h2>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Table Rows for Products */}
            <div className="space-y-3">
              {rows.map((row, idx) => {
                const selectedProd = products.find((p) => p.id === row.productId);
                return (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Pilih Produk / SKU #{idx + 1}
                      </label>
                      <select
                        value={row.productId}
                        onChange={(e) => handleRowChange(idx, 'productId', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">-- Pilih SKU Produk Hijab --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.sku}] {p.name} {p.color ? `(${p.color})` : ''} - Stok: {p.physicalStock} pcs
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full sm:w-32">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Jumlah (Pcs)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity || ''}
                        onChange={(e) => handleRowChange(idx, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 0))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-center"
                      />
                    </div>

                    <div className="sm:pt-5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        disabled={rows.length === 1}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="px-3.5 py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold transition-colors flex items-center gap-1.5"
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

            {/* Catatan / Keterangan */}
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
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
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
    </div>
  );
}
