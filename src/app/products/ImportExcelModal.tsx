'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Table } from 'lucide-react';
import * as XLSX from 'xlsx';
import { bulkCreateProducts, BulkProductInput } from './actions';

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportExcelModal({ isOpen, onClose }: ImportExcelModalProps) {
  const [parsedData, setParsedData] = useState<BulkProductInput[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [freightCost, setFreightCost] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<{
    createdCount: number;
    skippedCount: number;
    errors: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Download Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Kode SKU (*)': 'BW88',
        'Nama Produk (*)': 'Bella Square Premium',
        'Motif (Opsional)': 'Monogram Series',
        'Warna (Opsional)': 'Dusty Pink',
        'Harga Modal HPP (Rp)': 25000,
        'Harga Jual (Rp) (*)': 85000,
        'Stok Fisik Awal': 30,
      },
      {
        'Kode SKU (*)': 'PJ01',
        'Nama Produk (*)': 'Paris Japan Ultrafine',
        'Motif (Opsional)': 'Polos Edition',
        'Warna (Opsional)': 'Navy',
        'Harga Modal HPP (Rp)': 28000,
        'Harga Jual (Rp) (*)': 95000,
        'Stok Fisik Awal': 20,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Import Produk');

    // Auto fit column widths
    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 15 },
    ];

    XLSX.writeFile(workbook, 'Template_Import_Produk_Bywell.xlsx');
  };

  // 2. Read and Parse Uploaded File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResultSummary(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rawJson.length === 0) {
          setError('File Excel kosong atau format tidak sesuai.');
          setParsedData([]);
          return;
        }

        // Flexibly map columns
        const mappedItems: BulkProductInput[] = rawJson.map((row: any) => {
          // Normalize object keys
          const keys = Object.keys(row);
          const findVal = (terms: string[]) => {
            const matchedKey = keys.find((k) =>
              terms.some((term) => k.toLowerCase().includes(term.toLowerCase()))
            );
            return matchedKey ? row[matchedKey] : '';
          };

          const sku = String(findVal(['sku', 'kode'])).trim().toUpperCase();
          const name = String(findVal(['nama', 'produk', 'name'])).trim();
          const motif = String(findVal(['motif', 'koleksi'])).trim();
          const color = String(findVal(['warna', 'color', 'varian'])).trim();
          const costRaw = findVal(['modal', 'hpp', 'cost']);
          const priceRaw = findVal(['harga jual', 'harga ecer', 'price', 'harga']);
          const wholesaleRaw = findVal(['grosir', 'wholesale']);
          const stockRaw = findVal(['stok', 'stock', 'fisik']);

          const costPrice = Math.max(0, parseInt(String(costRaw).replace(/[^0-9]/g, ''), 10) || 0);
          const sellingPrice = Math.max(0, parseInt(String(priceRaw).replace(/[^0-9]/g, ''), 10) || 0);
          const wholesalePrice = wholesaleRaw
            ? Math.max(0, parseInt(String(wholesaleRaw).replace(/[^0-9]/g, ''), 10) || 0)
            : sellingPrice;

          return {
            sku,
            name,
            motif: motif || undefined,
            color: color || undefined,
            costPrice,
            sellingPrice,
            wholesalePrice,
            physicalStock: Math.max(0, parseInt(String(stockRaw).replace(/[^0-9]/g, ''), 10) || 0),
          };
        });

        // Filter out empty rows
        const validRows = mappedItems.filter((item) => item.sku || item.name);

        if (validRows.length === 0) {
          setError('Tidak dapat membaca baris produk dari file Excel ini.');
        } else {
          setParsedData(validRows);
        }
      } catch (err: any) {
        console.error('Error reading excel file:', err);
        setError('Gagal membaca file Excel. Pastikan format file adalah .xlsx atau .csv');
      }
    };

    reader.readAsBinaryString(file);
  };

  // 3. Submit parsed items to database
  const handleImportSubmit = async () => {
    if (parsedData.length === 0) return;

    setLoading(true);
    setError(null);

    const res = await bulkCreateProducts(parsedData, freightCost);
    setLoading(false);

    if (res.success) {
      setResultSummary({
        createdCount: res.createdCount || 0,
        skippedCount: res.skippedCount || 0,
        errors: res.errors || [],
      });
      setParsedData([]);
      setFreightCost(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      setError(res.error || 'Gagal menyimpan data impor ke database.');
    }
  };

  const resetModal = () => {
    setParsedData([]);
    setFileName(null);
    setError(null);
    setResultSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Impor Produk Massal (Excel)</h2>
              <p className="text-slate-400 text-xs">Upload file .xlsx / .csv untuk pendaftaran banyak SKU sekaligus</p>
            </div>
          </div>
          <button
            onClick={resetModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Result Alert Summary */}
          {resultSummary && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Impor Berhasil Diproses!</span>
              </div>
              <p className="text-xs text-emerald-700">
                • <strong className="font-semibold">{resultSummary.createdCount}</strong> produk baru berhasil didaftarkan ke database.
                {resultSummary.skippedCount > 0 && (
                  <span>
                    {' '}
                    | <strong className="font-semibold">{resultSummary.skippedCount}</strong> baris dilewati (duplikat/kosong).
                  </span>
                )}
              </p>

              {resultSummary.errors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200 text-xs text-emerald-800 space-y-1">
                  <p className="font-semibold">Catatan Baris dilewati:</p>
                  <ul className="list-disc list-inside space-y-0.5 max-h-24 overflow-y-auto">
                    {resultSummary.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Download Template Banner */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">1. Unduh Format Template Excel</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Gunakan template standar Bywell Closet agar kolom SKU, Nama, Motif, Warna, Harga, dan Stok terbaca sempurna.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-4 h-4" /> Download Template
            </button>
          </div>

          {/* File Upload Zone */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-2">2. Upload File Excel Hasil Pengisian</h4>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-rose-500 hover:bg-rose-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 group"
            >
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {fileName ? `File terpilih: ${fileName}` : 'Klik untuk memilih file Excel (.xlsx / .csv)'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Mendukung format Microsoft Excel dan CSV</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Freight Cost Input Field */}
          <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/80 space-y-1.5">
            <label className="block text-sm font-bold text-amber-900">
              3. Total Biaya Ongkir Restok Pengiriman Ini (Rp) <span className="text-amber-700 font-normal">(Opsional)</span>
            </label>
            <div className="relative max-w-sm">
              <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-amber-700">Rp</span>
              <input
                type="number"
                value={freightCost || ''}
                onChange={(e) => setFreightCost(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="Contoh: 31000 (Kosongkan jika tidak ada ongkir)"
                className="w-full pl-10 pr-4 py-2 bg-white border border-amber-300 rounded-xl text-sm font-semibold text-amber-950 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <p className="text-xs text-amber-800">
              * Ongkir ini akan otomatis dicatat sebagai <strong className="font-semibold text-amber-950">Biaya Pengeluaran (Expense)</strong> di modul Keuangan bulan ini.
            </p>
          </div>

          {/* Preview Table */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <Table className="w-4 h-4 text-slate-500" /> Preview Data Impor ({parsedData.length} baris produk)
                </h4>
                <span className="text-xs text-slate-400">Silakan periksa kembali sebelum menyimpan</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Nama Produk</th>
                      <th className="py-2.5 px-3">Motif</th>
                      <th className="py-2.5 px-3">Warna</th>
                      <th className="py-2.5 px-3 text-right">Harga Jual</th>
                      <th className="py-2.5 px-3 text-center">Stok Awal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{item.sku || '-'}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{item.name || '-'}</td>
                        <td className="py-2 px-3 text-slate-500">{item.motif || '-'}</td>
                        <td className="py-2 px-3 text-slate-500">{item.color || '-'}</td>
                        <td className="py-2 px-3 text-right font-medium">
                          Rp {item.sellingPrice.toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-800">{item.physicalStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={resetModal}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white transition-colors"
          >
            Selesai / Tutup
          </button>

          {parsedData.length > 0 && (
            <button
              type="button"
              disabled={loading}
              onClick={handleImportSubmit}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan Ke Database...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" /> Import {parsedData.length} Produk Sekarang
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
