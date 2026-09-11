'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Trash2, Pencil, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { FinanceSummaryData, FinanceTransactionRecord, addFinanceTransaction, updateFinanceTransaction, deleteFinanceTransaction, getFinanceSummary } from './actions';

interface FinanceClientProps {
  initialSummary: FinanceSummaryData;
  initialMonth: number;
  initialYear: number;
}

export default function FinanceClient({ initialSummary, initialMonth, initialYear }: FinanceClientProps) {
  const [summary, setSummary] = useState<FinanceSummaryData>(initialSummary);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [isPending, startTransition] = useTransition();

  // Form State for Adding/Editing Transaction
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTransactionRecord | null>(null);
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [category, setCategory] = useState<string>('SALARY');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingTx(null);
    setType('EXPENSE');
    setCategory('SALARY');
    setAmount('');
    setDescription('');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: FinanceTransactionRecord) => {
    setEditingTx(tx);
    setType(tx.type as 'INCOME' | 'EXPENSE');
    setCategory(tx.category);
    setAmount(String(tx.amount));
    setDescription(tx.description);
    setError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseInt(amount, 10) || 0;

    if (amt <= 0) {
      setError('Nominal transaksi harus lebih dari 0.');
      return;
    }

    if (!description.trim()) {
      setError('Keterangan transaksi wajib diisi.');
      return;
    }

    setLoading(true);
    let res;
    if (editingTx) {
      res = await updateFinanceTransaction(editingTx.id, {
        type,
        category,
        amount: amt,
        description: description.trim(),
      });
    } else {
      res = await addFinanceTransaction({
        type,
        category,
        amount: amt,
        description: description.trim(),
      });
    }
    setLoading(false);

    if (res.success) {
      setIsModalOpen(false);
      setEditingTx(null);
      setAmount('');
      setDescription('');
      handleFilterChange(selectedMonth, selectedYear);
    } else {
      setError(res.error || 'Gagal menyimpan transaksi.');
    }
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const monthsList = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember' },
  ];

  const handleFilterChange = (m: number, y: number) => {
    setSelectedMonth(m);
    setSelectedYear(y);
    startTransition(async () => {
      const data = await getFinanceSummary(m, y);
      setSummary(data);
    });
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseInt(amount, 10) || 0;

    if (amt <= 0) {
      setError('Nominal transaksi harus lebih dari 0.');
      return;
    }

    if (!description.trim()) {
      setError('Keterangan transaksi wajib diisi.');
      return;
    }

    setLoading(true);
    const res = await addFinanceTransaction({
      type,
      category,
      amount: amt,
      description: description.trim(),
    });
    setLoading(false);

    if (res.success) {
      setIsModalOpen(false);
      setAmount('');
      setDescription('');
      handleFilterChange(selectedMonth, selectedYear);
    } else {
      setError(res.error || 'Gagal menyimpan transaksi.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus transaksi ini?')) return;
    await deleteFinanceTransaction(id);
    handleFilterChange(selectedMonth, selectedYear);
  };

  const handleExportExcel = () => {
    const exportData = summary.transactions.map((tx, idx) => ({
      'No': idx + 1,
      'Tanggal': new Date(tx.transactionDate).toLocaleDateString('id-ID'),
      'Tipe': tx.type === 'INCOME' ? 'Pemasukan (Kas Masuk)' : 'Pengeluaran (Kas Keluar)',
      'Kategori': tx.category,
      'Keterangan': tx.description,
      'Nominal (Rp)': tx.amount,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Keuangan');

    XLSX.writeFile(workbook, `Laporan_Keuangan_Bywell_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'ONG_KIR_RESTOK':
        return <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200">🚚 Ongkir Restok</span>;
      case 'ZIPLOCK':
        return <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-800 text-[11px] font-semibold border border-purple-200">📦 Ziplock</span>;
      case 'MOTIF':
        return <span className="px-2.5 py-0.5 rounded-md bg-pink-50 text-pink-800 text-[11px] font-semibold border border-pink-200">✨ Desain Motif</span>;
      case 'SALARY':
        return <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[11px] font-semibold border border-blue-200">💼 Gaji Karyawan</span>;
      case 'SALES':
        return <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200">🛍️ Penjualan</span>;
      case 'OPERATIONAL':
        return <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">⚙️ Operasional</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">Lainnya</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            Keuangan & Laba Rugi Bulanan
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Laporan lengkap Omset, Total HPP Terjual, Pengeluaran Operasional, dan Profit Bersih Bulanan.
          </p>
        </div>

        {/* Month / Year Filters & Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Month Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => handleFilterChange(parseInt(e.target.value, 10), selectedYear)}
              className="text-xs font-bold text-slate-800 focus:outline-hidden bg-transparent cursor-pointer"
            >
              {monthsList.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year Dropdown */}
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
            <select
              value={selectedYear}
              onChange={(e) => handleFilterChange(selectedMonth, parseInt(e.target.value, 10))}
              className="text-xs font-bold text-slate-800 focus:outline-hidden bg-transparent cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Ekspor Excel
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" /> Catat Transaksi Manual
          </button>
        </div>
      </div>

      {/* KPI Cards: P&L Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Omset (Income) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Omset Penjualan</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{formatRupiah(summary.totalIncome)}</p>
          <p className="text-[11px] text-slate-400">Total uang masuk dari order lunas</p>
        </div>

        {/* Card 2: Total HPP Terjual */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total HPP Barang Terjual</p>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatRupiah(summary.totalCOGS)}</p>
          <p className="text-[11px] text-slate-400">Modal produk (Kain + Jahit + Ziplock)</p>
        </div>

        {/* Card 3: Total Pengeluaran (Expenses) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Total Biaya Pengeluaran</p>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-700">{formatRupiah(summary.totalExpenses)}</p>
          <p className="text-[11px] text-slate-400">Ongkir restok, Motif, Gaji, Plastik, dll</p>
        </div>

        {/* Card 4: Profit Bersih (Net Profit) */}
        <div className={`p-5 rounded-2xl border shadow-sm space-y-2 ${
          summary.netProfit >= 0 ? 'bg-slate-900 text-white border-slate-800' : 'bg-rose-900 text-white border-rose-800'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Laba Bersih Bulan Ini</p>
            <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">{formatRupiah(summary.netProfit)}</p>
          <p className="text-[11px] text-slate-300">Profit = Omset - HPP - Pengeluaran</p>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm">
            Log Mutasi Kas Masuk & Keluar ({summary.transactions.length} transaksi)
          </h2>
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        {summary.transactions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">Belum ada transaksi di bulan ini</p>
            <p className="text-xs text-slate-400">Transaksi otomatis dari Ongkir Restok, Ziplock, dan Penjualan akan muncul di sini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/60 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Keterangan Transaksi</th>
                  <th className="py-3 px-4 text-right">Nominal (Rp)</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {summary.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 text-slate-500 font-medium">
                      {new Date(tx.transactionDate).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="py-3 px-4">
                      {tx.type === 'INCOME' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                          <ArrowUpRight className="w-3.5 h-3.5" /> Pemasukan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                          <ArrowDownRight className="w-3.5 h-3.5" /> Pengeluaran
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">{getCategoryBadge(tx.category)}</td>

                    <td className="py-3 px-4 font-medium text-slate-800">{tx.description}</td>

                    <td className={`py-3 px-4 text-right font-bold ${
                      tx.type === 'INCOME' ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {tx.type === 'INCOME' ? '+' : '-'}{formatRupiah(tx.amount)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tx)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit Transaksi"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tx.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus Transaksi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add Manual Transaction */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="text-base font-bold">
                {editingTx ? 'Edit Transaksi Keuangan' : 'Catat Transaksi Kas Manual'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Transaksi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('EXPENSE')}
                    className={`py-2 rounded-xl text-xs font-bold transition-colors border ${
                      type === 'EXPENSE'
                        ? 'bg-rose-500 text-white border-rose-500'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Pengeluaran (Kas Keluar)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('INCOME')}
                    className={`py-2 rounded-xl text-xs font-bold transition-colors border ${
                      type === 'INCOME'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Pemasukan (Kas Masuk)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                >
                  <option value="SALARY">💼 Gaji Karyawan Mingguan</option>
                  <option value="OPERATIONAL">⚙️ Biaya Plastik Polymailer / Solasi / Lakban</option>
                  <option value="MOTIF">✨ Biaya Desain Motif / Aset</option>
                  <option value="ONG_KIR_RESTOK">🚚 Ongkir Masuk Restok</option>
                  <option value="OTHER">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal (Rp)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Contoh: 500000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan Transaksi</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Gaji Karyawan Minggu 1 September"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
