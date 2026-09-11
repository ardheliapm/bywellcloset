'use client';

import React, { useState } from 'react';
import { PieChart, Plus, Sparkles, CheckCircle2, AlertCircle, Loader2, TrendingUp, Target, DollarSign, Award, Pencil, Trash2, X } from 'lucide-react';
import { MotifPerformanceItem, addMotifAsset, updateMotifAsset, deleteMotifAsset } from './actions';

interface MotifClientProps {
  motifs: MotifPerformanceItem[];
}

export default function MotifClient({ motifs }: MotifClientProps) {
  const [motifName, setMotifName] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [notes, setNotes] = useState('');
  
  // Edit State
  const [editingMotif, setEditingMotif] = useState<MotifPerformanceItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editNotes, setEditNotes] = useState('');

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

  const totalAssetInvestment = motifs.reduce((acc, m) => acc + m.purchaseCost, 0);
  const totalMotifsAchievedBEP = motifs.filter((m) => m.isBEPAchieved).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const costNum = parseInt(purchaseCost, 10) || 0;
    if (!motifName.trim()) {
      setError('Nama Motif wajib diisi.');
      return;
    }

    setLoading(true);
    const res = await addMotifAsset(motifName, costNum, notes);
    setLoading(false);

    if (res.success) {
      setSuccessMsg(`Aset Motif "${motifName}" berhasil didaftarkan! Biaya ${formatRupiah(costNum)} otomatis dicatat ke Keuangan.`);
      setMotifName('');
      setPurchaseCost('');
      setNotes('');
    } else {
      setError(res.error || 'Gagal mendaftarkan motif.');
    }
  };

  const handleOpenEdit = (motif: MotifPerformanceItem) => {
    setEditingMotif(motif);
    setEditName(motif.motifName);
    setEditCost(String(motif.purchaseCost));
    setEditNotes(motif.notes || '');
    setError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMotif) return;
    setError(null);

    const costNum = parseInt(editCost, 10) || 0;
    if (!editName.trim()) {
      setError('Nama Motif wajib diisi.');
      return;
    }

    setLoading(true);
    const res = await updateMotifAsset(editingMotif.id, editName, costNum, editNotes);
    setLoading(false);

    if (res.success) {
      setEditingMotif(null);
      setSuccessMsg(`Aset Motif "${editName}" berhasil diperbarui!`);
    } else {
      setError(res.error || 'Gagal mengubah motif.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Yakin ingin menghapus aset motif "${name}"? Data pengeluaran terkait di Keuangan juga akan dihapus.`)) return;
    setLoading(true);
    const res = await deleteMotifAsset(id);
    setLoading(false);
    if (res.success) {
      setSuccessMsg(`Aset Motif "${name}" berhasil dihapus.`);
    } else {
      setError(res.error || 'Gagal menghapus motif.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-600 flex items-center justify-center">
            <PieChart className="w-5 h-5" />
          </div>
          Aset & Performa Motif Hijab (ROI & BEP)
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Modul khusus analisis keuntungan aset desain motif, target BEP (Titik Impas), dan Laba Bersih per Koleksi Motif.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Aset Motif Didaftarkan</p>
          <p className="text-2xl font-bold text-slate-800">{motifs.length} Motif</p>
          <p className="text-xs text-slate-500">Total Investasi: <strong className="font-semibold text-slate-700">{formatRupiah(totalAssetInvestment)}</strong></p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Motif Lunas Impas (BEP Passed)</p>
          <p className="text-2xl font-bold text-emerald-600">{totalMotifsAchievedBEP} dari {motifs.length} Motif</p>
          <p className="text-xs text-slate-500">Motif yang sudah menghasilkan Profit Bersih</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <p className="text-xs font-semibold text-pink-600 uppercase tracking-wider">Total Omset Penjualan Motif</p>
          <p className="text-2xl font-bold text-pink-600">
            {formatRupiah(motifs.reduce((acc, m) => acc + m.totalRevenue, 0))}
          </p>
          <p className="text-xs text-slate-500">Dari total {motifs.reduce((acc, m) => acc + m.totalSold, 0)} pcs terjual</p>
        </div>
      </div>

      {/* Main Grid: Form Left, Cards Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Register New Motif Asset (4 cols) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5 h-fit">
          <h2 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-pink-500" /> Beli / Tambah Aset Motif Baru
          </h2>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Koleksi / Motif <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={motifName}
                onChange={(e) => setMotifName(e.target.value)}
                placeholder="Contoh: Monogram Series, Flora Batch 1"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Biaya Beli Desain / Aset Motif (Rp) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  required
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  placeholder="Contoh: 1500000"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Catatan (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Beli dari desainer X / Hak Cipta Exklusif"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Daftarkan Motif & Catat Biaya
                </>
              )}
            </button>
          </form>
        </div>

        {/* Motif ROI & BEP Performance Cards (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <h2 className="font-bold text-slate-800 text-base">Analisis BEP & Profitabilitas Motif</h2>

          {motifs.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-pink-50 text-pink-500 mx-auto flex items-center justify-center">
                <PieChart className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Belum Ada Aset Motif</h3>
              <p className="text-slate-500 text-xs max-w-sm mx-auto">
                Silakan daftarkan motif pertama Anda beserta biaya pembelian desainnya pada form di sebelah kiri.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {motifs.map((motif) => (
                <div
                  key={motif.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{motif.motifName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Beli Desain: <strong className="text-slate-700">{formatRupiah(motif.purchaseCost)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {motif.isBEPAchieved && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-0.5 mr-1">
                          <Award className="w-3 h-3 text-emerald-600" /> BEP Passed
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(motif)}
                        className="p-1.5 text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                        title="Edit Motif"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(motif.id, motif.motifName)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Hapus Motif"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar BEP */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600 flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-pink-500" /> Progress Impas (BEP)
                      </span>
                      <span className="font-bold text-slate-800">
                        {motif.totalSold} / {motif.bepTargetUnits} pcs ({motif.bepProgressPercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          motif.isBEPAchieved ? 'bg-emerald-500' : 'bg-pink-500'
                        }`}
                        style={{ width: `${motif.bepProgressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[11px] text-slate-400 font-medium">Terjual</p>
                      <p className="font-bold text-slate-800 text-sm mt-0.5">{motif.totalSold} pcs</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[11px] text-slate-400 font-medium">Laba Bersih Motif</p>
                      <p className={`font-bold text-sm mt-0.5 ${motif.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatRupiah(motif.netProfit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Motif Modal */}
      {editingMotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Pencil className="w-4 h-4 text-pink-400" /> Edit Aset Motif
              </h2>
              <button onClick={() => setEditingMotif(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Koleksi / Motif <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Biaya Beli Desain / Aset Motif (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan (Opsional)</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-pink-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMotif(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
