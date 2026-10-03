'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Tag,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  ProductMasterType,
  DEFAULT_PRODUCT_TYPES,
  getStoredProductTypes,
  saveStoredProductTypes,
} from '@/lib/productTypes';

interface ManageProductTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTypesUpdated?: () => void;
}

export default function ManageProductTypesModal({
  isOpen,
  onClose,
  onTypesUpdated,
}: ManageProductTypesModalProps) {
  const [types, setTypes] = useState<ProductMasterType[]>(DEFAULT_PRODUCT_TYPES);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [isResellerEligible, setIsResellerEligible] = useState(false);
  const [defaultPrice, setDefaultPrice] = useState<string>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredProductTypes();
      setTypes(stored);
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setIsResellerEligible(false);
    setDefaultPrice('');
    setDescription('');
    setError(null);
  };

  const handleStartEdit = (t: ProductMasterType) => {
    setEditingId(t.id);
    setName(t.name);
    setIsResellerEligible(t.isResellerEligible);
    setDefaultPrice(t.defaultPrice ? String(t.defaultPrice) : '');
    setDescription(t.description || '');
    setError(null);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim().toUpperCase();
    if (!cleanName) {
      setError('Nama produk wajib diisi.');
      return;
    }

    // Check duplicate name
    const isDuplicate = types.some(
      (t) => t.name.toUpperCase() === cleanName && t.id !== editingId
    );
    if (isDuplicate) {
      setError(`Nama produk "${cleanName}" sudah ada di master data.`);
      return;
    }

    const priceNum = defaultPrice ? parseInt(defaultPrice, 10) || 0 : undefined;

    let updated: ProductMasterType[];
    if (editingId) {
      updated = types.map((t) =>
        t.id === editingId
          ? {
              ...t,
              name: cleanName,
              isResellerEligible,
              defaultPrice: priceNum,
              description: description.trim() || undefined,
            }
          : t
      );
      setSuccessMsg(`Nama produk "${cleanName}" berhasil diperbarui.`);
    } else {
      const newItem: ProductMasterType = {
        id: `type-${Date.now()}`,
        name: cleanName,
        isResellerEligible,
        defaultPrice: priceNum,
        description: description.trim() || undefined,
      };
      updated = [...types, newItem];
      setSuccessMsg(`Nama produk "${cleanName}" berhasil ditambahkan ke master data.`);
    }

    setTypes(updated);
    saveStoredProductTypes(updated);
    if (onTypesUpdated) onTypesUpdated();
    resetForm();

    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleDeleteItem = (id: string, typeName: string) => {
    if (confirm(`Yakin ingin menghapus "${typeName}" dari master data nama produk?`)) {
      const updated = types.filter((t) => t.id !== id);
      setTypes(updated);
      saveStoredProductTypes(updated);
      if (onTypesUpdated) onTypesUpdated();
      if (editingId === id) resetForm();
      setSuccessMsg(`"${typeName}" berhasil dihapus.`);
      setTimeout(() => setSuccessMsg(null), 2500);
    }
  };

  const handleToggleEligibility = (id: string) => {
    const updated = types.map((t) =>
      t.id === id ? { ...t, isResellerEligible: !t.isResellerEligible } : t
    );
    setTypes(updated);
    saveStoredProductTypes(updated);
    if (onTypesUpdated) onTypesUpdated();
  };

  const handleResetDefault = () => {
    if (confirm('Kembalikan Master Data Nama Produk ke pengaturan default standar (BABY TRYSPAN & PARIS JAPAN)?')) {
      setTypes(DEFAULT_PRODUCT_TYPES);
      saveStoredProductTypes(DEFAULT_PRODUCT_TYPES);
      if (onTypesUpdated) onTypesUpdated();
      resetForm();
      setSuccessMsg('Master data nama produk dikembalikan ke default.');
      setTimeout(() => setSuccessMsg(null), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Master Data Nama Produk</h2>
              <p className="text-slate-400 text-xs">
                Kelola daftar nama produk & tentukan produk mana yang berlaku Diskon Reseller
              </p>
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Alerts */}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Explanation Banner */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-2 text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-500" />
              Aturan Perhitungan Diskon Reseller Bywell Closet:
            </div>
            <p>
              • Produk bertanda <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-rose-700 bg-rose-100">Diskon Reseller Berlaku</span> (misal: <strong>BABY TRYSPAN</strong>) akan otomatis dihitung total kuantitasnya saat order untuk menentukan potongan harga reseller.
            </p>
            <p>
              • Produk bertanda <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-slate-700 bg-slate-200">Harga Normal (Non-Reseller)</span> (misal: <strong>PARIS JAPAN</strong>) akan <strong>TIDAK terdiskon reseller</strong> dan kuantitasnya tidak bercampur dengan kuota diskon reseller BABY TRYSPAN.
            </p>
          </div>

          {/* Form Add / Edit */}
          <form
            onSubmit={handleSaveItem}
            className="p-4 bg-white rounded-xl border-2 border-dashed border-rose-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                {editingId ? <Edit2 className="w-4 h-4 text-rose-600" /> : <Plus className="w-4 h-4 text-rose-600" />}
                {editingId ? 'Edit Nama Produk' : 'Tambah Nama Produk Baru'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: BABY TRYSPAN, PARIS JAPAN"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold uppercase focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Harga Ecer (Opsional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400 font-semibold">Rp</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="42000"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Toggle Reseller Eligibility */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="space-y-0.5 pr-4">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer" htmlFor="resellerEligibleToggle">
                  {isResellerEligible ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-slate-400" />
                  )}
                  Berlaku Diskon Reseller?
                </label>
                <p className="text-[11px] text-slate-500">
                  {isResellerEligible
                    ? 'YA — Produk ini akan mendapatkan tier harga reseller bertingkat (seperti BABY TRYSPAN).'
                    : 'TIDAK — Produk ini selalu dikenakan harga normal / reguler (seperti PARIS JAPAN).'}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="resellerEligibleToggle"
                  type="checkbox"
                  checked={isResellerEligible}
                  onChange={(e) => setIsResellerEligible(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-rose-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Keterangan / Deskripsi (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Bahan Voal Baby Tryspan Premium"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
              >
                {editingId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {editingId ? 'Simpan Perubahan' : 'Tambahkan ke Master Data'}
              </button>
            </div>
          </form>

          {/* Master Types List Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Daftar Nama Produk Terdaftar ({types.length})
              </h3>
              <span className="text-[11px] text-slate-500">
                Pilihan ini otomatis muncul di semua dropdown form produk
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Nama Produk Master</th>
                    <th className="py-2.5 px-3">Status Diskon Reseller</th>
                    <th className="py-2.5 px-3 text-right">Default Ecer</th>
                    <th className="py-2.5 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {types.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{item.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleEligibility(item.id)}
                          className="group text-left"
                          title="Klik untuk ubah status diskon reseller"
                        >
                          {item.isResellerEligible ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200 group-hover:bg-rose-200 transition-colors">
                              <Tag className="w-3 h-3 text-rose-600" /> Diskon Reseller Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 group-hover:bg-slate-200 transition-colors">
                              📦 Harga Normal (Non-Reseller)
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-700">
                        {item.defaultPrice ? `Rp ${item.defaultPrice.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Edit nama / konfigurasi"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefault}
            className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Default
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            Tutup Master Data
          </button>
        </div>
      </div>
    </div>
  );
}
