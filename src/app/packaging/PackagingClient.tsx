'use client';

import React, { useState } from 'react';
import { Box, Plus, CheckCircle2, AlertCircle, Loader2, Info, PackageCheck } from 'lucide-react';
import { addZiplockStock } from './actions';

interface PackagingClientProps {
  ziplock: {
    id: string;
    name: string;
    stock: number;
    unitCost: number;
  } | null;
}

export default function PackagingClient({ ziplock }: PackagingClientProps) {
  const [quantity, setQuantity] = useState<string>('100');
  const [totalPrice, setTotalPrice] = useState<string>('70000');
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

  const currentStock = ziplock?.stock || 0;
  const currentUnitCost = ziplock?.unitCost || 700;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const qty = parseInt(quantity, 10) || 0;
    const price = parseInt(totalPrice, 10) || 0;

    if (qty <= 0) {
      setError('Kuantitas ziplock minimal 1 pcs.');
      return;
    }

    setLoading(true);
    const res = await addZiplockStock(qty, price);
    setLoading(false);

    if (res.success) {
      setSuccessMsg(`Berhasil menambah ${qty} pcs Ziplock! Pengeluaran Rp ${price.toLocaleString('id-ID')} otomatis dicatat ke Keuangan.`);
      setQuantity('100');
      setTotalPrice('70000');
    } else {
      setError(res.error || 'Gagal menyimpan stok ziplock.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 flex items-center justify-center">
            <Box className="w-5 h-5" />
          </div>
          Stok Kemasan Ziplock (Packaging Hijab)
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Sistem akan memotong 1 pcs ziplock otomatis untuk setiap unit hijab yang terjual saat pembayaran Lunas (PAID).
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sisa Stok Ziplock</p>
          <p className="text-2xl font-bold text-purple-700">{currentStock} pcs</p>
          <p className="text-xs text-slate-500">Kemasan ziplock Siap Pakai</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Harga Modal Ziplock / Pcs</p>
          <p className="text-2xl font-bold text-slate-800">{formatRupiah(currentUnitCost)} / pcs</p>
          <p className="text-xs text-slate-500">Estimasi HPP Kemasan per Hijab</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Pemotongan</p>
          <p className="text-sm font-bold text-emerald-600 flex items-center gap-1.5 pt-1">
            <PackageCheck className="w-5 h-5 text-emerald-500" /> Auto-Deduct Aktif
          </p>
          <p className="text-xs text-slate-500">Dipotong 1 pcs per 1 Hijab saat Lunas</p>
        </div>
      </div>

      {/* Form Purchase / Restok Ziplock */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs max-w-2xl space-y-5">
        <h2 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3">
          Tambah Stok Kemasan Ziplock Baru
        </h2>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Jumlah Ziplock (Pcs) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jumlah Kemasan Beli (Pcs) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Contoh: 100"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            {/* Total Harga Beli (Rp) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Total Biaya Pembelian (Rp) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  required
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder="Contoh: 70000"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-xs text-purple-900 space-y-1">
            <p className="flex items-center gap-1 font-bold">
              <Info className="w-4 h-4 text-purple-600" /> Informasi Biaya:
            </p>
            <p>
              • Harga modal per ziplock = <strong className="font-semibold">{formatRupiah(Math.round((parseInt(totalPrice, 10) || 0) / (parseInt(quantity, 10) || 1)))} / pcs</strong>.
            </p>
            <p>
              • Biaya ini akan otomatis masuk ke tabel <strong className="font-semibold">Pengeluaran Keuangan</strong>.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Tambah Stok Ziplock & Catat Pengeluaran
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
