'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, FileText } from 'lucide-react';
import { FinanceSummaryData } from './actions';

interface FinanceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: FinanceSummaryData;
  selectedPeriodLabel: string;
}

export default function FinanceReportModal({
  isOpen,
  onClose,
  summary,
  selectedPeriodLabel,
}: FinanceReportModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const grossMargin = summary.totalIncome > 0
    ? ((summary.grossProfit / summary.totalIncome) * 100).toFixed(1)
    : '0';
  const netMargin = summary.totalIncome > 0
    ? ((summary.netProfit / summary.totalIncome) * 100).toFixed(1)
    : '0';

  const handlePrint = () => {
    window.print();
  };

  const sortedTx = [...summary.transactions].sort(
    (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  );

  let runningBalance = 0;

  const modalContent = (
    <div
      id="report-modal-portal"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 print:p-0 print:bg-white print:static print:block"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          
          body > :not(#report-modal-portal) {
            display: none !important;
          }
          
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          #report-modal-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            inset: auto !important;
          }

          #printable-financial-report {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            padding: 4mm 2mm !important;
            margin: 0 !important;
            display: block !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }

          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      <div
        id="printable-financial-report"
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none"
      >
        {/* Top Action Bar (Hidden when printing) */}
        <div className="px-6 py-4 bg-slate-900 text-white rounded-t-2xl flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Laporan Keuangan & Jurnal Kas</h2>
              <p className="text-slate-400 text-xs">Periode: {selectedPeriodLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak / Simpan PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-5 print:p-2 print:space-y-4 text-slate-800 text-xs">
          
          {/* Document Header / Letterhead */}
          <div className="border-b-2 border-slate-800 pb-4 flex flex-row items-start justify-between gap-4 avoid-break">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-600 text-white font-black flex items-center justify-center text-sm shadow-xs tracking-wider">
                  BC
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">Bywell Closet</h1>
                  <p className="text-[11px] font-medium text-slate-500">
                    Sistem Manajemen Inventaris & Keuangan Toko
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="inline-block px-3 py-1 rounded-md bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                Laporan Laba Rugi & Jurnal Kas
              </div>
              <p className="text-xs font-semibold text-slate-700">
                Periode: <span className="text-slate-950 font-bold">{selectedPeriodLabel}</span>
              </p>
              <p className="text-[10px] text-slate-400">
                Dicetak: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB
              </p>
            </div>
          </div>

          {/* 1. Executive Summary Cards */}
          <div className="avoid-break space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                1. Ringkasan Eksekutif Finansial
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">Satuan: Rupiah (IDR)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-2.5">
              {/* Omset */}
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-300 space-y-1">
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Total Omset</p>
                <p className="text-base sm:text-lg font-black text-emerald-700">{formatRupiah(summary.totalIncome)}</p>
                <p className="text-[10px] text-emerald-600 font-medium">Uang masuk penjualan</p>
              </div>

              {/* HPP */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-300 space-y-1">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">HPP Terjual (COGS)</p>
                <p className="text-base sm:text-lg font-black text-slate-800">{formatRupiah(summary.totalCOGS)}</p>
                <p className="text-[10px] text-slate-500 font-medium">Modal bahan & jahit</p>
              </div>

              {/* Pengeluaran */}
              <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-300 space-y-1">
                <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Biaya Operasional</p>
                <p className="text-base sm:text-lg font-black text-rose-700">{formatRupiah(summary.totalExpenses)}</p>
                <p className="text-[10px] text-rose-600 font-medium">Ongkir, gaji, motif, dll</p>
              </div>

              {/* Laba Bersih */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-900 text-white space-y-1">
                <p className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Laba Bersih Akhir</p>
                <p className="text-base sm:text-lg font-black text-white">{formatRupiah(summary.netProfit)}</p>
                <p className="text-[10px] text-rose-200 font-medium">Margin Bersih: {netMargin}%</p>
              </div>
            </div>
          </div>

          {/* 2. Jurnal Arus Kas Table */}
          <div className="space-y-2 avoid-break">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                2. Buku Jurnal Mutasi Kas Masuk & Keluar
              </h3>
              <span className="text-[10px] text-slate-500 font-semibold">{summary.transactions.length} transaksi tercatat</span>
            </div>

            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-900 text-white font-semibold">
                  <tr>
                    <th className="py-2 px-2.5 w-8 text-center border-r border-slate-700">No</th>
                    <th className="py-2 px-2.5 w-24 border-r border-slate-700">Tanggal</th>
                    <th className="py-2 px-2.5 w-32 border-r border-slate-700">No. Ref</th>
                    <th className="py-2 px-2.5 w-24 border-r border-slate-700">Kategori</th>
                    <th className="py-2 px-2.5 border-r border-slate-700">Keterangan Transaksi</th>
                    <th className="py-2 px-2.5 text-right w-28 text-emerald-300 border-r border-slate-700">Debit (Masuk)</th>
                    <th className="py-2 px-2.5 text-right w-28 text-rose-300 border-r border-slate-700">Kredit (Keluar)</th>
                    <th className="py-2 px-2.5 text-right w-28">Saldo Kas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedTx.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-5 text-center text-slate-400 italic">
                        Tidak ada catatan mutasi kas pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    sortedTx.map((tx, idx) => {
                      const isIncome = tx.type === 'INCOME';
                      runningBalance += isIncome ? tx.amount : -tx.amount;
                      return (
                        <tr key={tx.id} className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}>
                          <td className="py-1.5 px-2.5 text-center text-slate-400 font-medium border-r border-slate-200">{idx + 1}</td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-600 border-r border-slate-200">
                            {new Date(tx.transactionDate).toLocaleDateString('id-ID')}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800 text-[10px] border-r border-slate-200">
                            {tx.referenceId || '-'}
                          </td>
                          <td className="py-1.5 px-2.5 border-r border-slate-200">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              tx.category === 'SALES' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              tx.category === 'ONG_KIR_RESTOK' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              tx.category === 'SALARY' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                              tx.category === 'MOTIF' ? 'bg-pink-100 text-pink-800 border border-pink-300' :
                              'bg-slate-100 text-slate-700 border border-slate-300'
                            }`}>
                              {tx.category}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 font-medium text-slate-700 border-r border-slate-200">{tx.description}</td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700 border-r border-slate-200">
                            {isIncome ? formatRupiah(tx.amount) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-rose-700 border-r border-slate-200">
                            {!isIncome ? formatRupiah(tx.amount) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-black text-slate-900">
                            {formatRupiah(runningBalance)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-900">
                  <tr>
                    <td colSpan={5} className="py-2 px-2.5 text-right uppercase tracking-wider text-[10px] border-r border-slate-300">
                      Total Mutasi Periode Ini:
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-black text-emerald-700 border-r border-slate-300">
                      {formatRupiah(summary.totalIncome)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-black text-rose-700 border-r border-slate-300">
                      {formatRupiah(summary.totalExpenses)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-black text-slate-950">
                      {formatRupiah(summary.totalIncome - summary.totalExpenses)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 3. Sales Breakdown Table */}
          {summary.paidOrders && summary.paidOrders.length > 0 && (
            <div className="space-y-2 avoid-break">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  3. Rincian Penjualan & Margin Keuntungan per Order
                </h3>
                <span className="text-[10px] text-slate-500 font-semibold">{summary.paidOrders.length} order lunas</span>
              </div>

              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-800 text-white font-semibold">
                    <tr>
                      <th className="py-2 px-2.5 w-8 text-center border-r border-slate-600">No</th>
                      <th className="py-2 px-2.5 w-32 border-r border-slate-600">No. Order</th>
                      <th className="py-2 px-2.5 w-32 border-r border-slate-600">Customer</th>
                      <th className="py-2 px-2.5 border-r border-slate-600">Rincian Produk Terjual</th>
                      <th className="py-2 px-2.5 text-center w-14 border-r border-slate-600">Qty</th>
                      <th className="py-2 px-2.5 text-right w-24 border-r border-slate-600">Omset</th>
                      <th className="py-2 px-2.5 text-right w-24 border-r border-slate-600">HPP Modal</th>
                      <th className="py-2 px-2.5 text-right w-24 text-emerald-300">Profit Kotor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {summary.paidOrders.map((ord, idx) => (
                      <tr key={ord.id} className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}>
                        <td className="py-1.5 px-2.5 text-center text-slate-400 border-r border-slate-200">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-900 text-[10px] border-r border-slate-200">{ord.orderNumber}</td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-800 border-r border-slate-200">{ord.customerName}</td>
                        <td className="py-1.5 px-2.5 text-slate-600 text-[10.5px] border-r border-slate-200">
                          {ord.itemsSummary ? (
                            <span className="inline-block bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                              {ord.itemsSummary}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-bold text-slate-800 border-r border-slate-200">{ord.totalQty} pcs</td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-slate-900 border-r border-slate-200">{formatRupiah(ord.totalAmount)}</td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-slate-500 border-r border-slate-200">{formatRupiah(ord.totalCOGS)}</td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700">{formatRupiah(ord.grossProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-900">
                    <tr>
                      <td colSpan={4} className="py-2 px-2.5 text-right uppercase tracking-wider text-[10px] border-r border-slate-300">
                        Total Akumulasi Penjualan:
                      </td>
                      <td className="py-2 px-2.5 text-center font-black border-r border-slate-300">
                        {summary.paidOrders.reduce((acc, o) => acc + o.totalQty, 0)} pcs
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-black text-slate-900 border-r border-slate-300">
                        {formatRupiah(summary.paidOrders.reduce((acc, o) => acc + o.totalAmount, 0))}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-black text-slate-600 border-r border-slate-300">
                        {formatRupiah(summary.paidOrders.reduce((acc, o) => acc + o.totalCOGS, 0))}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-black text-emerald-700">
                        {formatRupiah(summary.paidOrders.reduce((acc, o) => acc + o.grossProfit, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 4. Footer Signature Area for Physical Document */}
          <div className="pt-6 border-t border-slate-300 grid grid-cols-2 gap-10 text-center text-xs avoid-break">
            <div>
              <p className="text-slate-500 font-medium text-[11px] mb-12">Disiapkan Oleh,</p>
              <div className="w-48 mx-auto border-b border-slate-400 pb-1">
                <span className="font-bold text-slate-900 text-xs">Admin / Keuangan</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Staff Operasional</p>
            </div>
            <div>
              <p className="text-slate-500 font-medium text-[11px] mb-12">Disetujui Oleh,</p>
              <div className="w-48 mx-auto border-b border-slate-400 pb-1">
                <span className="font-bold text-slate-900 text-xs">Owner Bywell Closet</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Pimpinan Usaha</p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer (Hidden on print) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl flex items-center justify-between no-print shrink-0">
          <span className="text-xs text-slate-500">
            * Gunakan opsi cetak browser lalu pilih <strong>&quot;Save as PDF&quot;</strong> untuk menyimpan dokumen.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-white transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Cetak / Unduh PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
