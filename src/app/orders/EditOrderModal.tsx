'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Edit3,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Package,
  Sparkles,
  ShoppingBag,
  User,
  Phone,
  FileText,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { OrderRecord, updateOrderDetails, EditOrderItemInput } from './actions';
import { ProductItem } from '../products/actions';
import {
  getStoredProductTypes,
  calculateProductPrice,
  findProductMasterType,
  checkIsResellerEligible,
} from '@/lib/productTypes';
import SearchableProductSelect from '@/components/SearchableProductSelect';

interface EditOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderRecord | null;
  products?: ProductItem[];
}

export default function EditOrderModal({
  isOpen,
  onClose,
  order,
  products = [],
}: EditOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EditOrderItemInput[]>([]);

  // State for adding a new item
  const [selectedProductId, setSelectedProductId] = useState('');
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [isManualProduct, setIsManualProduct] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize form when modal opens with order data
  useEffect(() => {
    if (isOpen && order) {
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setNotes(order.notes || '');
      setItems(
        order.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          productSku: it.productSku,
          productName: it.productName,
          price: it.price,
          quantity: it.quantity,
        }))
      );
      setSelectedProductId('');
      setNewItemSku('');
      setNewItemName('');
      setNewItemPrice('');
      setNewItemQty(1);
      setIsManualProduct(false);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Calculations
  const totalQuantity = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const totalAmount = items.reduce(
    (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0
  );

  // Item quantity handlers
  const handleQuantityChange = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], price: Math.max(0, newPrice) };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setError('Pesanan harus memiliki minimal 1 produk. Anda tidak dapat menghapus semua item.');
      return;
    }
    setError(null);
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Product Selection for Add New Item
  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    if (!prodId) {
      setNewItemSku('');
      setNewItemName('');
      setNewItemPrice('');
      return;
    }

    if (prodId === '__MANUAL__') {
      setIsManualProduct(true);
      setNewItemSku('');
      setNewItemName('');
      setNewItemPrice('');
      return;
    }

    setIsManualProduct(false);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setNewItemSku(prod.sku);
      setNewItemName(prod.name + (prod.motif ? ` - ${prod.motif}` : '') + (prod.color ? ` (${prod.color})` : ''));
      setNewItemPrice(String(prod.sellingPrice || prod.wholesalePrice || 42000));
    }
  };

  const handleAddNewItem = () => {
    setError(null);
    const sku = newItemSku.trim().toUpperCase();
    const name = newItemName.trim();
    const price = parseInt(newItemPrice, 10) || 0;
    const qty = Math.max(1, Number(newItemQty) || 1);

    if (!sku || !name) {
      setError('Pilih produk atau masukkan Kode SKU dan Nama Produk.');
      return;
    }

    // Check if item already in the list
    const existingIndex = items.findIndex(
      (it) => it.productSku.toUpperCase() === sku || (it.productId && it.productId === selectedProductId)
    );

    if (existingIndex >= 0) {
      // Increment existing item quantity
      handleQuantityChange(existingIndex, items[existingIndex].quantity + qty);
      setSuccessMsg(`Menambahkan +${qty} pcs ke item ${sku}.`);
    } else {
      const newItem: EditOrderItemInput = {
        productId: selectedProductId && selectedProductId !== '__MANUAL__' ? selectedProductId : null,
        productSku: sku,
        productName: name,
        price,
        quantity: qty,
      };
      setItems((prev) => [...prev, newItem]);
      setSuccessMsg(`Produk ${sku} berhasil ditambahkan ke pesanan.`);
    }

    // Reset add item form
    setSelectedProductId('');
    setNewItemSku('');
    setNewItemName('');
    setNewItemPrice('');
    setNewItemQty(1);
    setIsManualProduct(false);

    setTimeout(() => setSuccessMsg(null), 2500);
  };

  // Auto Recalculate Tier Pricing for all items based on master rules
  const handleAutoRecalculatePrices = () => {
    const types = getStoredProductTypes();
    // Group quantities by master type
    const groupCountMap = new Map<string, number>();

    items.forEach((it) => {
      const master = findProductMasterType(it.productName, types);
      const key = master ? master.name : '__OTHER__';
      groupCountMap.set(key, (groupCountMap.get(key) || 0) + it.quantity);
    });

    const updated = items.map((it) => {
      const master = findProductMasterType(it.productName, types);
      if (master && master.isResellerEligible) {
        const totalGrpQty = groupCountMap.get(master.name) || it.quantity;
        const calc = calculateProductPrice(it.productName, totalGrpQty, it.price, types);
        return {
          ...it,
          price: calc.price,
        };
      }
      return it;
    });

    setItems(updated);
    setSuccessMsg('Harga satuan seluruh produk berhasil dihitung ulang otomatis sesuai ketentuan tier!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!customerName.trim()) {
      setError('Nama customer wajib diisi.');
      return;
    }

    if (items.length === 0) {
      setError('Pesanan harus memiliki minimal 1 produk.');
      return;
    }

    setLoading(true);

    const res = await updateOrderDetails({
      orderId: order.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      items,
    });

    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Gagal menyimpan perubahan order.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">Edit Pesanan #{order.orderNumber}</h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    order.status === 'HOLD'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  Status: {order.status}
                </span>
              </div>
              <p className="text-slate-400 text-xs">
                Ubah nama customer, tambah/kurang kuantiti item, atau ubah harga satuan (Stok akan otomatis disinkronkan)
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
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Alerts */}
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

          {/* Status Note Banner */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">Sinkronisasi Stok Otomatis:</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {order.status === 'HOLD'
                  ? 'Perubahan kuantiti item pada pesanan ini akan langsung menambah / mengurangi Stok Ditahan (Reserved Stock).'
                  : 'Perubahan kuantiti item pada pesanan PAID ini akan langsung menambah / mengembalikan Stok Fisik di gudang.'}
              </p>
            </div>
          </div>

          <form id="edit-order-form" onSubmit={handleSave} className="space-y-5">
            {/* Customer Info Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Nama Customer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: KAK ZEE"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> No. WhatsApp (Opsional)
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>

            {/* Catatan Order */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Catatan Pesanan (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Titip motif cadangan, bungkus rapi"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>

            {/* Items Table Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-rose-500" /> Daftar Produk Dipesan ({items.length} Item • {totalQuantity} Pcs)
                </h3>
                <button
                  type="button"
                  onClick={handleAutoRecalculatePrices}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Hitung ulang harga reseller bertingkat otomatis"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" /> Hitung Ulang Harga Reseller
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Produk / SKU</th>
                      <th className="py-2.5 px-3 text-center w-36">Kuantitas</th>
                      <th className="py-2.5 px-3 text-right w-32">Harga Satuan (Rp)</th>
                      <th className="py-2.5 px-3 text-right w-28">Subtotal</th>
                      <th className="py-2.5 px-2 text-center w-10">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const subtotal = (it.price || 0) * (it.quantity || 0);
                      return (
                        <tr key={it.id || idx} className="hover:bg-slate-50/50">
                          {/* SKU & Name */}
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] border border-slate-200">
                                {it.productSku}
                              </span>
                              <span className="truncate max-w-[180px] sm:max-w-xs">{it.productName}</span>
                            </div>
                          </td>

                          {/* Quantity Controls */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(idx, it.quantity - 1)}
                                disabled={it.quantity <= 1}
                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={it.quantity}
                                onChange={(e) =>
                                  handleQuantityChange(idx, parseInt(e.target.value, 10) || 1)
                                }
                                className="w-11 text-center font-bold text-slate-900 border-x border-slate-200 py-1 text-xs focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(idx, it.quantity + 1)}
                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* Price Input */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="relative inline-block w-28">
                              <span className="absolute left-2 top-1.5 text-slate-400 text-[10px] font-semibold">Rp</span>
                              <input
                                type="number"
                                min="0"
                                value={it.price}
                                onChange={(e) =>
                                  handlePriceChange(idx, parseInt(e.target.value, 10) || 0)
                                }
                                className="w-full pl-6 pr-2 py-1 rounded border border-slate-200 text-right font-bold text-slate-900 text-xs focus:ring-1 focus:ring-rose-500"
                              />
                            </div>
                          </td>

                          {/* Subtotal */}
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatRupiah(subtotal)}
                          </td>

                          {/* Delete */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              disabled={items.length <= 1}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-20 cursor-pointer"
                              title="Hapus produk ini dari pesanan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add New Item Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-rose-500" /> Tambah Produk Baru ke Order Ini
                </span>
                <span className="text-[11px] text-slate-500">Pilih dari Master atau ketik manual</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Select from master */}
                <div className="sm:col-span-6">
                  <SearchableProductSelect
                    products={products}
                    value={selectedProductId}
                    onChange={(val) => handleSelectProduct(val)}
                    placeholder="Ketik SKU / Nama Produk (contoh: BW83, 119)..."
                    allowManual={true}
                    onManualSelect={() => handleSelectProduct('__MANUAL__')}
                    stockType="AVAILABLE"
                  />
                </div>

                {/* SKU (if manual) or Name */}
                {isManualProduct ? (
                  <>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Kode SKU"
                        value={newItemSku}
                        onChange={(e) => setNewItemSku(e.target.value.toUpperCase())}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Nama Produk"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </>
                ) : null}

                {/* Qty & Price */}
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <div className="w-1/2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                    />
                  </div>
                  <div className="w-1/2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Harga"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleAddNewItem}
                    disabled={!newItemSku && !selectedProductId}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Item
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total Kuantitas: </span>
              <strong className="text-slate-900 font-mono text-sm">{totalQuantity} pcs</strong>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <span className="text-slate-500">Total Tagihan Baru: </span>
              <strong className="text-rose-600 font-mono text-sm sm:text-base font-black">
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
              form="edit-order-form"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Simpan Perubahan Pesanan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
