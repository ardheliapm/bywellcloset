'use client';

import React, { useState } from 'react';
import { X, Plus, Package, Loader2, AlertCircle } from 'lucide-react';
import { createProduct } from './actions';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddProductModal({ isOpen, onClose }: AddProductModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [motif, setMotif] = useState('');
  const [color, setColor] = useState('');
  const [costPrice, setCostPrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [physicalStock, setPhysicalStock] = useState<string>('0');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const costNum = parseInt(costPrice, 10) || 0;
    const priceNum = parseInt(sellingPrice, 10) || 0;
    const stockNum = parseInt(physicalStock, 10) || 0;

    const res = await createProduct({
      sku,
      name,
      motif,
      color,
      costPrice: costNum,
      sellingPrice: priceNum,
      physicalStock: stockNum,
    });

    setLoading(false);

    if (res.success) {
      // Reset form & close modal
      setSku('');
      setName('');
      setMotif('');
      setColor('');
      setCostPrice('');
      setSellingPrice('');
      setPhysicalStock('0');
      onClose();
    } else {
      setError(res.error || 'Gagal menyimpan produk');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Tambah Produk Baru</h2>
              <p className="text-slate-400 text-xs">Pendaftaran SKU produk hijab ke Master Data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SKU */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode SKU <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: BW80, FL01"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-mono tracking-wider"
              />
            </div>

            {/* Warna */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Warna / Varian
              </label>
              <input
                type="text"
                placeholder="Contoh: Dusty Pink, Navy"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>

          {/* Nama Produk */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Produk <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Bella Square Premium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          {/* Motif */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motif / Koleksi (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Monogram Series, Flora Batch 1"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Harga Modal HPP */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Harga Modal (Rp)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  placeholder="25000"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-semibold"
                />
              </div>
            </div>

            {/* Harga Eceran (Rupiah) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Harga Ecer (Rp) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="85000"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-semibold"
                />
              </div>
            </div>

            {/* Stok Fisik Awal */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Stok Fisik Awal
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={physicalStock}
                onChange={(e) => setPhysicalStock(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-semibold"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs text-slate-500 space-y-1">
            <p>💡 <span className="font-semibold">Catatan Stok:</span></p>
            <p>• <span className="font-medium text-slate-700">Reserved Stock</span> otomatis dimulai dari 0.</p>
            <p>• <span className="font-medium text-slate-700">Available Stock</span> dihitung otomatis = Physical Stock - Reserved Stock.</p>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Simpan Produk
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
