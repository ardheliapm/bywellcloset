'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Package,
  Sparkles,
  ShoppingBag,
  User,
  Phone,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { createPreOrder, CreatePreOrderItemInput } from './actions';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import {
  getStoredProductTypes,
  calculateProductPrice,
  findProductMasterType,
} from '@/lib/productTypes';

interface CreatePreOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  onCreated?: () => void;
}

interface FormItem {
  productId: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantityOrdered: number;
}

export default function CreatePreOrderModal({
  isOpen,
  onClose,
  products = [],
  onCreated,
}: CreatePreOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([
    { productId: null, productSku: '', productName: '', price: 0, quantityOrdered: 1 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const totalQuantity = items.reduce((acc, it) => acc + (Number(it.quantityOrdered) || 0), 0);
  const totalAmount = items.reduce(
    (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantityOrdered) || 0),
    0
  );

  const handleProductSelect = (index: number, prodId: string, prod?: ProductItem) => {
    const updated = [...items];
    if (prod) {
      updated[index] = {
        ...updated[index],
        productId: prod.id,
        productSku: prod.sku,
        productName: prod.name + (prod.motif ? ` - ${prod.motif}` : '') + (prod.color ? ` (${prod.color})` : ''),
        price: prod.sellingPrice || prod.wholesalePrice || 42000,
      };
    } else {
      updated[index] = {
        ...updated[index],
        productId: null,
        productSku: '',
        productName: '',
        price: 0,
      };
    }
    setItems(updated);
    recalculateTierPrices(updated);
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const cleanQty = Math.max(1, qty || 1);
    const updated = [...items];
    updated[index] = { ...updated[index], quantityOrdered: cleanQty };
    setItems(updated);
    recalculateTierPrices(updated);
  };

  const handlePriceChange = (index: number, price: number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], price: Math.max(0, price) };
    setItems(updated);
  };

  const handleAddItemRow = () => {
    setItems([
      ...items,
      { productId: null, productSku: '', productName: '', price: 0, quantityOrdered: 1 },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
    recalculateTierPrices(updated);
  };

  // Recalculate tier prices based on total quantity of all PO items
  const recalculateTierPrices = (currentItems: FormItem[]) => {
    const types = getStoredProductTypes();
    const groupCountMap = new Map<string, number>();

    currentItems.forEach((it) => {
      if (!it.productName) return;
      const master = findProductMasterType(it.productName, types);
      const key = master ? master.name : '__OTHER__';
      groupCountMap.set(key, (groupCountMap.get(key) || 0) + it.quantityOrdered);
    });

    const refreshed = currentItems.map((it) => {
      if (!it.productName) return it;
      const master = findProductMasterType(it.productName, types);
      if (master && master.isResellerEligible) {
        const totalGrpQty = groupCountMap.get(master.name) || it.quantityOrdered;
        const prod = products.find((p) => p.id === it.productId);
        const basePrice = prod?.sellingPrice || master.defaultPrice || 42000;
        const calc = calculateProductPrice(it.productName, totalGrpQty, basePrice, types);
        return {
          ...it,
          price: calc.price,
        };
      }
      return it;
    });

    setItems(refreshed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!customerName.trim()) {
      setError('Nama customer wajib diisi.');
      return;
    }

    const validItems = items.filter((it) => it.productSku.trim() && it.quantityOrdered > 0);
    if (validItems.length === 0) {
      setError('Silakan pilih minimal 1 produk untuk dicatat PO.');
      return;
    }

    setLoading(true);

    const res = await createPreOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      items: validItems.map((it) => ({
        productId: it.productId,
        productSku: it.productSku,
        productName: it.productName,
        price: it.price,
        quantityOrdered: it.quantityOrdered,
      })),
    });

    setLoading(false);

    if (res.success) {
      setSuccessMsg(`Pre-Order #${res.poNumber} berhasil dicatat!`);
      if (onCreated) onCreated();
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setError(res.error || 'Gagal menyimpan Pre-Order.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Catat Pre-Order (PO) Baru</h2>
              <p className="text-slate-400 text-xs">
                Pencatatan antrean pesanan PO yang akan otomatis terpenuhi saat barang datang di Stok Masuk
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

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Info Banner */}
          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Ketentuan Harga Reseller Terkunci (Locked Tier):</p>
              <p className="text-indigo-800 text-[11px] mt-0.5">
                Harga satuan dihitung otomatis berdasarkan <strong>TOTAL kuantiti seluruh item PO</strong>. Ketika barang dicicil kirim sebagian, harga per pcs tetap memakai harga reseller total ini.
              </p>
            </div>
          </div>

          <form id="create-po-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Nama Customer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: KAK ZEE, KAK ALYA"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> No. WhatsApp (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Catatan PO */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Catatan Pre-Order (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Titip motif warna lavender jika ada, kirim setelah batch Bandung sampai"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* List of PO Items */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" /> Daftar Produk Pre-Order ({items.length} Item • {totalQuantity} Pcs)
                </h3>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Baris Produk
                </button>
              </div>

              <div className="space-y-2.5">
                {items.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    {/* Searchable Select */}
                    <div className="flex-1 w-full">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Pilih Produk PO #{idx + 1}
                      </label>
                      <SearchableProductSelect
                        products={products}
                        value={row.productId || ''}
                        onChange={(val, prod) => handleProductSelect(idx, val, prod)}
                        placeholder="Ketik SKU atau nama motif..."
                        stockType="AVAILABLE"
                      />
                    </div>

                    {/* Quantity */}
                    <div className="w-full sm:w-28">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Jumlah PO (Pcs)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={row.quantityOrdered}
                        onChange={(e) =>
                          handleQuantityChange(idx, parseInt(e.target.value, 10) || 1)
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-center focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Price */}
                    <div className="w-full sm:w-32">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 text-right">
                        Harga Reseller (Rp)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-slate-400 text-[10px] font-semibold">Rp</span>
                        <input
                          type="number"
                          min="0"
                          value={row.price}
                          onChange={(e) =>
                            handlePriceChange(idx, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-right focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Subtotal */}
                    <div className="w-full sm:w-28 text-right hidden sm:block">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Subtotal
                      </label>
                      <span className="text-xs font-bold text-slate-900">
                        {formatRupiah(row.price * row.quantityOrdered)}
                      </span>
                    </div>

                    {/* Remove */}
                    <div className="sm:pt-5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        disabled={items.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-20"
                        title="Hapus baris"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total Kuantitas PO: </span>
              <strong className="text-slate-900 font-mono text-sm">{totalQuantity} pcs</strong>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <span className="text-slate-500">Total Nilai PO: </span>
              <strong className="text-indigo-600 font-mono text-sm sm:text-base font-black">
                {formatRupiah(totalAmount)}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              form="create-po-form"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" /> Simpan Pre-Order ({totalQuantity} Pcs)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
