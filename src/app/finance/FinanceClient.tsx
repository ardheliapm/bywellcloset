'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Trash2, Pencil, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, ArrowUpRight, ArrowDownRight, Printer, Sparkles } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { FinanceSummaryData, FinanceTransactionRecord, addFinanceTransaction, updateFinanceTransaction, deleteFinanceTransaction, getFinanceSummary } from './actions';
import FinanceReportModal from './FinanceReportModal';

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

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
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
    { value: -1, label: '⚡ Hari Ini (Live Real-Time)' },
    { value: 0, label: 'Semua Bulan (Rekap 1 Tahun)' },
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

  // Dynamic available years discovered from timestamps in database
  const availableYearsList = useMemo(() => {
    const list = summary.availableYears && summary.availableYears.length > 0
      ? summary.availableYears
      : [selectedYear + 1, selectedYear, selectedYear - 1];

    if (!list.includes(selectedYear)) {
      return [selectedYear, ...list].sort((a, b) => b - a);
    }
    return list;
  }, [summary.availableYears, selectedYear]);

  const selectedPeriodLabel = useMemo(() => {
    if (selectedMonth === -1) return `Hari Ini (${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})`;
    if (selectedMonth === 0) return `Rekap Tahun ${selectedYear}`;
    const found = monthsList.find((m) => m.value === selectedMonth);
    return found ? `${found.label} ${selectedYear}` : `${selectedYear}`;
  }, [selectedMonth, selectedYear]);

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
    const workbook = XLSX.utils.book_new();

    // ----------------------------------------------------
    // SHEET 1: Jurnal Keuangan & Laba Rugi Eksekutif
    // ----------------------------------------------------
    const sortedTx = [...summary.transactions].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
    );

    let runningBalance = 0;
    const cashFlowRows = sortedTx.map((tx, idx) => {
      const isIncome = tx.type === 'INCOME';
      const incomeAmt = isIncome ? tx.amount : 0;
      const expenseAmt = !isIncome ? tx.amount : 0;
      runningBalance += isIncome ? tx.amount : -tx.amount;

      let catLabel = tx.category;
      if (tx.category === 'SALES') catLabel = 'Penjualan (Sales)';
      else if (tx.category === 'ONG_KIR_RESTOK') catLabel = 'Ongkir Restok';
      else if (tx.category === 'SALARY') catLabel = 'Gaji Karyawan';
      else if (tx.category === 'MOTIF') catLabel = 'Desain Motif';
      else if (tx.category === 'ZIPLOCK' || tx.category === 'PACKAGING') catLabel = 'Packaging';
      else if (tx.category === 'OPERATIONAL') catLabel = 'Operasional';

      return [
        idx + 1,
        new Date(tx.transactionDate).toLocaleDateString('id-ID'),
        tx.referenceId || '-',
        catLabel,
        tx.description,
        incomeAmt,
        expenseAmt,
        runningBalance,
      ];
    });

    const grossMarginPercent = summary.totalIncome > 0
      ? `${((summary.grossProfit / summary.totalIncome) * 100).toFixed(1)}%`
      : '0%';
    const netMarginPercent = summary.totalIncome > 0
      ? `${((summary.netProfit / summary.totalIncome) * 100).toFixed(1)}%`
      : '0%';

    const sheet1Data = [
      ['BYWELL CLOSET - LAPORAN KEUANGAN & JURNAL ARUS KAS'],
      ['Periode Laporan:', selectedPeriodLabel, '', 'Tanggal Cetak:', new Date().toLocaleString('id-ID')],
      [],
      ['=== RINGKASAN EKSEKUTIF FINANSIAL ===', '', '', '', '', '', '', ''],
      ['Indikator Finansial', 'Nilai (Rp)', '', 'Indikator Margin & Saldo', 'Nilai / Persentase', '', '', ''],
      ['Total Omset Penjualan (Income)', summary.totalIncome, '', 'Margin Laba Kotor (Gross Margin)', grossMarginPercent, '', '', ''],
      ['Total HPP Modal Barang Terjual (COGS)', summary.totalCOGS, '', 'Margin Laba Bersih (Net Margin)', netMarginPercent, '', '', ''],
      ['Laba Kotor (Gross Profit)', summary.grossProfit, '', 'Net Arus Kas (Pemasukan - Pengeluaran)', summary.totalIncome - summary.totalExpenses, '', '', ''],
      ['Total Biaya Pengeluaran (Expense)', summary.totalExpenses, '', 'Total Transaksi Mutasi', `${summary.transactions.length} Transaksi`, '', '', ''],
      ['LABA BERSIH (NET PROFIT AKHIR)', summary.netProfit, '', 'Total Order Penjualan', `${summary.paidOrders?.length || 0} Order Terjual`, '', '', ''],
      [],
      ['=== BUKU JURNAL ARUS KAS (MUTASI KAS MASUK & KELUAR) ===', '', '', '', '', '', '', ''],
      ['No', 'Tanggal', 'No. Referensi / Order', 'Kategori', 'Keterangan Transaksi', 'Kas Masuk / Debit (Rp)', 'Kas Keluar / Kredit (Rp)', 'Saldo Kas (Rp)'],
      ...cashFlowRows,
      [
        'TOTAL',
        '',
        '',
        '',
        'Total Arus Kas Keseluruhan Periode Ini',
        summary.totalIncome,
        summary.totalExpenses,
        summary.totalIncome - summary.totalExpenses,
      ],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1['!cols'] = [
      { wch: 6 },  // No
      { wch: 14 }, // Tanggal
      { wch: 24 }, // No. Ref / Order
      { wch: 22 }, // Kategori
      { wch: 45 }, // Keterangan
      { wch: 24 }, // Kas Masuk
      { wch: 24 }, // Kas Keluar
      { wch: 22 }, // Saldo Kas
    ];

    // Rich styling for ws1
    if (ws1['A1']) {
      ws1['A1'].s = {
        font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: 'BE123C' } },
        alignment: { horizontal: 'left', vertical: 'center' },
      };
    }
    ['A2', 'B2', 'D2', 'E2'].forEach((k) => {
      if (ws1[k]) {
        ws1[k].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '475569' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
        };
      }
    });
    ['A4', 'A12'].forEach((k) => {
      if (ws1[k]) {
        ws1[k].s = {
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'E2E8F0' } },
        };
      }
    });
    ['A5', 'B5', 'D5', 'E5'].forEach((k) => {
      if (ws1[k]) {
        ws1[k].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '334155' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
    });
    for (let r = 6; r <= 10; r++) {
      ['A', 'D'].forEach((col) => {
        const cell = ws1[`${col}${r}`];
        if (cell) {
          cell.s = {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '334155' } },
            fill: { fgColor: { rgb: 'F8FAFC' } },
          };
        }
      });
      ['B', 'E'].forEach((col) => {
        const cell = ws1[`${col}${r}`];
        if (cell) {
          const isOmset = r === 6 && col === 'B';
          const isNet = r === 10 && col === 'B';
          const isExpense = r === 9 && col === 'B';
          cell.s = {
            font: {
              name: 'Calibri',
              sz: isNet ? 11 : 10,
              bold: true,
              color: { rgb: isNet ? 'FFFFFF' : isOmset ? '047857' : isExpense ? 'BE123C' : '0F172A' },
            },
            fill: { fgColor: { rgb: isNet ? '0F172A' : isOmset ? 'ECFDF5' : isExpense ? 'FFF1F2' : 'F1F5F9' } },
            alignment: { horizontal: typeof cell.v === 'number' ? 'right' : 'center', vertical: 'center' },
            numFmt: typeof cell.v === 'number' ? '#,##0' : undefined,
          };
        }
      });
    }

    ['A13', 'B13', 'C13', 'D13', 'E13', 'F13', 'G13', 'H13'].forEach((k) => {
      if (ws1[k]) {
        ws1[k].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1E293B' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        };
      }
    });

    const journalStartRow = 14;
    const journalEndRow = 13 + cashFlowRows.length;
    for (let r = journalStartRow; r <= journalEndRow; r++) {
      const isEven = r % 2 === 0;
      const bg = isEven ? 'F8FAFC' : 'FFFFFF';
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
        const cell = ws1[`${col}${r}`];
        if (cell) {
          const isIncome = col === 'F';
          const isExpense = col === 'G';
          const isBalance = col === 'H';
          cell.s = {
            font: {
              name: 'Calibri',
              sz: 10,
              bold: isBalance || isIncome || isExpense,
              color: { rgb: isIncome ? '047857' : isExpense ? 'BE123C' : '1E293B' },
            },
            fill: { fgColor: { rgb: bg } },
            alignment: {
              horizontal: col === 'A' || col === 'B' ? 'center' : col === 'F' || col === 'G' || col === 'H' ? 'right' : 'left',
              vertical: 'center',
            },
            numFmt: typeof cell.v === 'number' ? '#,##0' : undefined,
            border: {
              bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
            },
          };
        }
      });
    }

    const totalRowIndex = journalEndRow + 1;
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
      const cell = ws1[`${col}${totalRowIndex}`];
      if (cell) {
        cell.s = {
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'E2E8F0' } },
          alignment: { horizontal: col === 'A' || col === 'E' ? 'center' : 'right', vertical: 'center' },
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined,
          border: {
            top: { style: 'thin', color: { rgb: '94A3B8' } },
            bottom: { style: 'double', color: { rgb: '0F172A' } },
          },
        };
      }
    });

    XLSX.utils.book_append_sheet(workbook, ws1, 'Jurnal & Laba Rugi');

    // ----------------------------------------------------
    // SHEET 2: Rincian Penjualan & Profit per Order
    // ----------------------------------------------------
    const paidOrders = summary.paidOrders || [];
    const salesRows = paidOrders.map((ord, idx) => [
      idx + 1,
      ord.paidAt ? new Date(ord.paidAt).toLocaleDateString('id-ID') : '-',
      ord.orderNumber,
      ord.customerName,
      ord.customerPhone || '-',
      ord.itemsSummary,
      ord.totalQty,
      ord.totalAmount,
      ord.totalCOGS,
      ord.grossProfit,
      ord.totalAmount > 0 ? `${((ord.grossProfit / ord.totalAmount) * 100).toFixed(1)}%` : '0%',
    ]);

    const totalSalesQty = paidOrders.reduce((acc, o) => acc + o.totalQty, 0);
    const totalSalesAmount = paidOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    const totalSalesCOGS = paidOrders.reduce((acc, o) => acc + o.totalCOGS, 0);
    const totalSalesGross = paidOrders.reduce((acc, o) => acc + o.grossProfit, 0);

    const sheet2Data = [
      ['BYWELL CLOSET - RINCIAN PENJUALAN & KEUNTUNGAN PER ORDER'],
      ['Periode Laporan:', selectedPeriodLabel, '', 'Total Order Terjual:', `${paidOrders.length} Order`],
      [],
      ['No', 'Tanggal Lunas', 'No. Order', 'Nama Customer', 'No. WhatsApp', 'Rincian Produk & Qty', 'Total Qty (pcs)', 'Omset Penjualan (Rp)', 'HPP Modal (Rp)', 'Laba Kotor (Rp)', 'Margin (%)'],
      ...salesRows,
      [
        'TOTAL',
        '',
        '',
        '',
        '',
        'Total Akumulasi Order Terjual',
        totalSalesQty,
        totalSalesAmount,
        totalSalesCOGS,
        totalSalesGross,
        totalSalesAmount > 0 ? `${((totalSalesGross / totalSalesAmount) * 100).toFixed(1)}%` : '0%',
      ],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2['!cols'] = [
      { wch: 6 },  // No
      { wch: 14 }, // Tanggal Lunas
      { wch: 24 }, // No. Order
      { wch: 22 }, // Nama Customer
      { wch: 16 }, // WhatsApp
      { wch: 45 }, // Rincian Produk
      { wch: 15 }, // Total Qty
      { wch: 22 }, // Omset Penjualan
      { wch: 18 }, // HPP Modal
      { wch: 18 }, // Laba Kotor
      { wch: 12 }, // Margin %
    ];

    if (ws2['A1']) {
      ws2['A1'].s = {
        font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0F172A' } },
        alignment: { horizontal: 'left', vertical: 'center' },
      };
    }
    ['A2', 'B2', 'D2', 'E2'].forEach((k) => {
      if (ws2[k]) {
        ws2[k].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '475569' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
        };
      }
    });

    ['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4', 'I4', 'J4', 'K4'].forEach((k) => {
      if (ws2[k]) {
        ws2[k].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1E293B' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        };
      }
    });

    const salesStartRow = 5;
    const salesEndRow = 4 + salesRows.length;
    for (let r = salesStartRow; r <= salesEndRow; r++) {
      const isEven = r % 2 === 0;
      const bg = isEven ? 'F8FAFC' : 'FFFFFF';
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
        const cell = ws2[`${col}${r}`];
        if (cell) {
          const isProfit = col === 'J';
          cell.s = {
            font: {
              name: 'Calibri',
              sz: 10,
              bold: isProfit,
              color: { rgb: isProfit ? '047857' : '1E293B' },
            },
            fill: { fgColor: { rgb: bg } },
            alignment: {
              horizontal: col === 'A' || col === 'B' || col === 'C' || col === 'G' || col === 'K' ? 'center' : col === 'H' || col === 'I' || col === 'J' ? 'right' : 'left',
              vertical: 'center',
            },
            numFmt: typeof cell.v === 'number' ? '#,##0' : undefined,
            border: {
              bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
            },
          };
        }
      });
    }

    const totalSalesRowIndex = salesEndRow + 1;
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
      const cell = ws2[`${col}${totalSalesRowIndex}`];
      if (cell) {
        cell.s = {
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'E2E8F0' } },
          alignment: { horizontal: col === 'A' || col === 'F' ? 'center' : 'right', vertical: 'center' },
          numFmt: typeof cell.v === 'number' ? '#,##0' : undefined,
          border: {
            top: { style: 'thin', color: { rgb: '94A3B8' } },
            bottom: { style: 'double', color: { rgb: '0F172A' } },
          },
        };
      }
    });

    XLSX.utils.book_append_sheet(workbook, ws2, 'Rincian Penjualan & Profit');

    // Save File
    const periodName = selectedMonth === 0 ? `Semua_Bulan_${selectedYear}` : `Bulan_${selectedMonth}_${selectedYear}`;
    XLSX.writeFile(workbook, `Laporan_Keuangan_Bywell_${periodName}.xlsx`);
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'ONG_KIR_RESTOK':
        return <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200">🚚 Ongkir Restok</span>;
      case 'ZIPLOCK':
        return <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-800 text-[11px] font-semibold border border-purple-200">📦 Packaging</span>;
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
            Keuangan & Laba Rugi {selectedMonth === 0 ? 'Tahunan' : 'Bulanan'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Laporan lengkap Omset, Total HPP Terjual, Pengeluaran Operasional, dan Profit Bersih ({selectedPeriodLabel}).
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

          {/* Year Dropdown - Dynamic from timestamps */}
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
            <select
              value={selectedYear}
              onChange={(e) => handleFilterChange(selectedMonth, parseInt(e.target.value, 10))}
              className="text-xs font-bold text-slate-800 focus:outline-hidden bg-transparent cursor-pointer"
            >
              {availableYearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Ekspor Excel
          </button>

          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="w-4 h-4 text-rose-600" /> Cetak / Unduh PDF
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

      {/* Today Real-Time Highlight Bar */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Laba Rugi & Keuangan Hari Ini</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-slate-950 uppercase tracking-wider">Live Real-Time</span>
            </div>
            <p className="text-xs text-slate-300">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 flex-wrap w-full lg:w-auto justify-between lg:justify-end">
          <div>
            <span className="text-[11px] text-slate-400 block">Omset Hari Ini</span>
            <strong className="text-sm sm:text-base font-bold text-emerald-400 font-mono">
              {formatRupiah(summary.todayIncome || 0)}
            </strong>
          </div>
          <div className="h-8 w-px bg-slate-800 hidden sm:block" />
          <div>
            <span className="text-[11px] text-slate-400 block">Laba Kotor Hari Ini</span>
            <strong className="text-sm sm:text-base font-bold text-indigo-300 font-mono">
              {formatRupiah(summary.todayGrossProfit || 0)}
            </strong>
          </div>
          <div className="h-8 w-px bg-slate-800 hidden sm:block" />
          <div>
            <span className="text-[11px] text-slate-400 block">Pengeluaran Hari Ini</span>
            <strong className="text-sm sm:text-base font-bold text-rose-400 font-mono">
              {formatRupiah(summary.todayExpenses || 0)}
            </strong>
          </div>
          <div className="h-8 w-px bg-slate-800 hidden sm:block" />
          <div>
            <span className="text-[11px] text-slate-400 block">Laba Bersih Hari Ini</span>
            <strong className="text-base sm:text-lg font-black text-amber-300 font-mono">
              {formatRupiah(summary.todayNetProfit || 0)}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => handleFilterChange(-1, new Date().getFullYear())}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-colors cursor-pointer"
          >
            Filter Hari Ini &rarr;
          </button>
        </div>
      </div>

      {/* KPI Cards: P&L Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Omset (Income) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Omset ({selectedPeriodLabel})</p>
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
          <p className="text-[11px] text-slate-400">Modal produk (Kain + Jahit)</p>
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
          <p className="text-[11px] text-slate-400">Ongkir restok, Motif, Gaji, dll</p>
        </div>

        {/* Card 4: Profit Bersih (Net Profit) */}
        <div className={`p-5 rounded-2xl border shadow-sm space-y-2 ${
          summary.netProfit >= 0 ? 'bg-slate-900 text-white border-slate-800' : 'bg-rose-900 text-white border-rose-800'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Laba Bersih ({selectedPeriodLabel})</p>
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

      {/* Printable / Export PDF Financial Report Modal */}
      <FinanceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        summary={summary}
        selectedPeriodLabel={selectedPeriodLabel}
      />
    </div>
  );
}
