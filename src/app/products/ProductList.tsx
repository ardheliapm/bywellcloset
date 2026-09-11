'use client';

import React, { useState, useMemo } from 'react';
import { Package, Plus, Search, Tag, CheckCircle2, XCircle, RefreshCw, AlertTriangle, Download, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import AddProductModal from './AddProductModal';
import ImportExcelModal from './ImportExcelModal';
import ResellerPricelistModal from './ResellerPricelistModal';
import { ProductItem, toggleProductStatus } from './actions';

interface ProductListProps {
  products: ProductItem[];
}

type SortOption = 'NEWEST' | 'STOCK_DESC' | 'STOCK_ASC';
type StockAlertFilter = 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export default function ProductList({ products }: ProductListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPricelistModalOpen, setIsPricelistModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [nameFilter, setNameFilter] = useState<string>('ALL');
  const [stockAlertFilter, setStockAlertFilter] = useState<StockAlertFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Formatting Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Ambil daftar unik Nama Produk secara dinamis untuk pilihan dropdown filter
  const uniqueNames = useMemo(() => {
    const names = products.map((p) => p.name);
    return Array.from(new Set(names)).sort();
  }, [products]);

  // Hitung jumlah produk stok menipis (<= 5) dan habis (= 0)
  const lowStockCount = useMemo(() => {
    return products.filter((p) => p.availableStock > 0 && p.availableStock <= 5).length;
  }, [products]);

  const outOfStockCount = useMemo(() => {
    return products.filter((p) => p.availableStock === 0).length;
  }, [products]);

  // Proses Filter Data
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Search Bar
      const matchesSearch =
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.motif && p.motif.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.color && p.color.toLowerCase().includes(searchTerm.toLowerCase()));

      // 2. Status Active/Inactive
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? p.isActive
          : !p.isActive;

      // 3. Nama Produk / Bahan Filter
      const matchesName = nameFilter === 'ALL' || p.name === nameFilter;

      // 4. Alert Stok Filter
      const matchesStockAlert =
        stockAlertFilter === 'ALL'
          ? true
          : stockAlertFilter === 'LOW_STOCK'
          ? p.availableStock > 0 && p.availableStock <= 5
          : p.availableStock === 0;

      return matchesSearch && matchesStatus && matchesName && matchesStockAlert;
    });
  }, [products, searchTerm, statusFilter, nameFilter, stockAlertFilter]);

  // Proses Sorting Data
  const sortedProducts = useMemo(() => {
    const items = [...filteredProducts];

    switch (sortBy) {
      case 'STOCK_DESC':
        return items.sort((a, b) => b.availableStock - a.availableStock);
      case 'STOCK_ASC':
        return items.sort((a, b) => a.availableStock - b.availableStock);
      case 'NEWEST':
      default:
        return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [filteredProducts, sortBy]);

  // Ekspor Excel Function
  const handleExportExcel = () => {
    const exportData = sortedProducts.map((p, index) => ({
      'No': index + 1,
      'SKU': p.sku,
      'Nama Produk': p.name,
      'Motif': p.motif || '-',
      'Warna': p.color || '-',
      'Harga Jual (Rp)': p.sellingPrice,
      'Harga Grosir (Rp)': p.wholesalePrice || p.sellingPrice,
      'Stok Fisik': p.physicalStock,
      'Stok Ditahan': p.reservedStock,
      'Stok Available': p.availableStock,
      'Status': p.isActive ? 'Aktif' : 'Non-Aktif',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Produk');

    // Auto widths
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 15 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 15 },
      { wch: 12 },
    ];

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Data_Produk_Bywell_${today}.xlsx`);
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    setTogglingId(id);
    await toggleProductStatus(id, currentStatus);
    setTogglingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Product Master</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Kelola katalog SKU hijab, varian warna, motif, harga jual, dan ketersediaan stok.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsPricelistModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs"
          >
            <Tag className="w-4 h-4 text-amber-600" /> Pricelist Reseller
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs"
          >
            <Download className="w-4 h-4 text-emerald-600" /> Ekspor Excel
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs"
          >
            <Upload className="w-4 h-4 text-emerald-600" /> Impor Excel
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" /> Tambah Produk Baru
          </button>
        </div>
      </div>

      {/* Summary KPI Mini Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total SKU</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{products.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Stok Fisik</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">
              {products.reduce((acc, p) => acc + p.physicalStock, 0)} pcs
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Tag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Stok Ditahan (Hold)</p>
            <p className="text-xl font-bold text-amber-600 mt-0.5">
              {products.reduce((acc, p) => acc + p.reservedStock, 0)} pcs
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
            HOLD
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Stok Available</p>
            <p className="text-xl font-bold text-rose-600 mt-0.5">
              {products.reduce((acc, p) => acc + p.availableStock, 0)} pcs
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
            SIAP
          </div>
        </div>
      </div>

      {/* Filter & Sorting Controls Area */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        {/* Row 1: Search + Filter Nama Produk + Sorting Dropdown */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Bar (5 cols) */}
          <div className="relative md:col-span-5">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari SKU, Nama, Motif, Warna..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          {/* Filter Nama Produk / Bahan (4 cols) */}
          <div className="md:col-span-4">
            <select
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
            >
              <option value="ALL">Semua Nama Produk ({uniqueNames.length} jenis)</option>
              {uniqueNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Sorting Dropdown (3 cols) */}
          <div className="md:col-span-3 relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
            >
              <option value="NEWEST">Sort: Terbaru</option>
              <option value="STOCK_DESC">Sort: Stok Terbanyak</option>
              <option value="STOCK_ASC">Sort: Stok Sedikit / Menipis</option>
            </select>
          </div>
        </div>

        {/* Row 2: Status Tabs & Quick Stock Alert Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Quick Alert Filter Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">Filter Stok:</span>
            <button
              type="button"
              onClick={() => setStockAlertFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                stockAlertFilter === 'ALL'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua Stok
            </button>
            <button
              type="button"
              onClick={() => setStockAlertFilter('LOW_STOCK')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border flex items-center gap-1 ${
                stockAlertFilter === 'LOW_STOCK'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Stok Menipis ({lowStockCount})
            </button>
            <button
              type="button"
              onClick={() => setStockAlertFilter('OUT_OF_STOCK')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border flex items-center gap-1 ${
                stockAlertFilter === 'OUT_OF_STOCK'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              Stok Habis ({outOfStockCount})
            </button>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua Status ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Aktif ({products.filter((p) => p.isActive).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white text-slate-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Non-Aktif ({products.filter((p) => !p.isActive).length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {sortedProducts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 mx-auto flex items-center justify-center">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {products.length === 0 ? 'Belum Ada Data Produk' : 'Produk Tidak Ditemukan'}
            </h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              {products.length === 0
                ? 'Silakan klik tombol "Tambah Produk Baru" atau "Impor Excel" untuk menambahkan SKU produk Anda.'
                : 'Coba ubah filter nama produk, pencarian, atau status pengurutan.'}
            </p>
            {products.length === 0 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium text-sm hover:bg-emerald-100 transition-colors inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Impor Excel
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Tambah Produk Pertama
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4">Nama Produk & Motif</th>
                  <th className="py-3.5 px-4">Warna</th>
                  <th className="py-3.5 px-4">Harga Modal (HPP)</th>
                  <th className="py-3.5 px-4">Harga Ecer (Rp)</th>
                  <th className="py-3.5 px-4 text-center">Physical Stock</th>
                  <th className="py-3.5 px-4 text-center">Reserved Stock</th>
                  <th className="py-3.5 px-4 text-center">Available Stock</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sortedProducts.map((product) => (
                  <tr
                    key={product.id}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      !product.isActive ? 'opacity-60 bg-slate-50/40' : ''
                    }`}
                  >
                    {/* SKU */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs tracking-wider">
                        {product.sku}
                      </span>
                    </td>

                    {/* Nama & Motif */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{product.name}</div>
                      {product.motif && (
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" /> {product.motif}
                        </div>
                      )}
                    </td>

                    {/* Warna */}
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {product.color || <span className="text-slate-300 italic">-</span>}
                    </td>

                    {/* Harga Modal HPP */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-500 text-xs">
                        {formatRupiah(product.costPrice || 0)}
                      </div>
                    </td>

                    {/* Harga Ecer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">
                        {formatRupiah(product.sellingPrice)}
                      </div>
                    </td>

                    {/* Physical Stock */}
                    <td className="py-3.5 px-4 text-center font-semibold text-slate-800">
                      {product.physicalStock}
                    </td>

                    {/* Reserved Stock */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold text-xs border border-amber-200/60">
                        {product.reservedStock}
                      </span>
                    </td>

                    {/* Available Stock */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs border ${
                          product.availableStock > 5
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : product.availableStock > 0
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                        }`}
                      >
                        {product.availableStock} {product.availableStock === 0 ? '(Habis)' : ''}
                      </span>
                    </td>

                    {/* Status Active / Inactive */}
                    <td className="py-3.5 px-4 text-center">
                      {product.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                          <XCircle className="w-3.5 h-3.5" /> Non-Aktif
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={togglingId === product.id}
                        onClick={() => handleToggleStatus(product.id, product.isActive)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          product.isActive
                            ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {togglingId === product.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : product.isActive ? (
                          'Non-aktifkan'
                        ) : (
                          'Aktifkan'
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      <AddProductModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Import Excel Modal */}
      <ImportExcelModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />

      {/* Reseller Pricelist Modal */}
      <ResellerPricelistModal isOpen={isPricelistModalOpen} onClose={() => setIsPricelistModalOpen(false)} />
    </div>
  );
}
