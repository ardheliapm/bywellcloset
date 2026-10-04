'use client';

import React, { useState, useEffect } from 'react';
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
  ClipboardPaste,
  Search,
  Check,
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { createPreOrder, CreatePreOrderItemInput } from './actions';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import {
  getStoredProductTypes,
  calculateProductPrice,
  findProductMasterType,
  checkIsResellerEligible,
} from '@/lib/productTypes';

interface CreatePreOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  onCreated?: () => void;
}

interface FormItem {
  id: string;
  productId: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantityOrdered: number;
  isMatched?: boolean;
}

export default function CreatePreOrderModal({
  isOpen,
  onClose,
  products = [],
  onCreated,
}: CreatePreOrderModalProps) {
  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');

  // Paste Textarea State
  const [rawText, setRawText] = useState(
`KAK DELLA
spark flower(4)
blush sparky(3)
BW83(3)`
  );

  // Common Form States
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      if (items.length === 0) {
        setItems([
          {
            id: `item-${Date.now()}`,
            productId: null,
            productSku: '',
            productName: '',
            price: 0,
            quantityOrdered: 1,
          },
        ]);
      }
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

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

  // Product Matching Helper (Accurate & avoids false positives on new products)
  const findBestProductMatch = (query: string): ProductItem | null => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    const cleanQ = q.replace(/[^a-z0-9]/g, '');

    // 1. Exact SKU match (e.g. "BW83", "bw-83", "BW 83")
    const exactSku = products.find(
      (p) =>
        p.sku.toLowerCase() === q ||
        (cleanQ.length >= 2 && p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQ)
    );
    if (exactSku) return exactSku;

    // 2. Exact Motif match (e.g. "spark flower", "blush peony")
    const exactMotif = products.find(
      (p) => p.motif && p.motif.toLowerCase().trim() === q
    );
    if (exactMotif) return exactMotif;

    // 3. Exact Full Name match (e.g. "Midi Dress Spark Flower")
    const exactName = products.find((p) => p.name.toLowerCase().trim() === q);
    if (exactName) return exactName;

    // 4. Exact Combined Name & Motif (e.g. "Midi Dress - Spark Flower")
    const exactCombined = products.find((p) => {
      const full = `${p.name} ${p.motif || ''}`.toLowerCase().trim();
      const withColor = `${p.name} ${p.motif || ''} ${p.color || ''}`.toLowerCase().trim();
      const skuMotif = `${p.sku} ${p.motif || ''}`.toLowerCase().trim();
      return full === q || withColor === q || skuMotif === q;
    });
    if (exactCombined) return exactCombined;

    // 5. SKU prefix match (e.g. "BW83")
    if (cleanQ.length >= 3) {
      const prefixSku = products.find((p) => {
        const pCleanSku = p.sku.toLowerCase().replace(/[^a-z0-9]/g, '');
        return pCleanSku === cleanQ || (pCleanSku.startsWith(cleanQ) && cleanQ.length >= 4);
      });
      if (prefixSku) return prefixSku;
    }

    // 6. Database product name / motif contains entire query (e.g. query is "Spark Flower" and product name is "Gamis Rayon Spark Flower")
    if (q.length >= 4) {
      const nameContainsQuery = products.find((p) => {
        const pName = p.name.toLowerCase();
        const pMotif = p.motif ? p.motif.toLowerCase() : '';
        return pName.includes(q) || (pMotif && pMotif.includes(q));
      });
      if (nameContainsQuery) return nameContainsQuery;
    }

    // Not matched in Master Data -> Treat as New Product
    return null;
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

  // Parse WhatsApp Text
  const handleParseWhatsAppText = () => {
    setError(null);
    if (!rawText.trim()) {
      setError('Silakan tempel teks pesanan WhatsApp terlebih dahulu.');
      return;
    }

    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setError('Teks tidak memiliki format yang valid.');
      return;
    }

    // Line 1: Customer Name
    const rawCustomer = lines[0].replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim();
    if (rawCustomer && !customerName) {
      setCustomerName(rawCustomer);
    }

    // Remaining lines: Items
    const itemLines = lines.slice(1);
    const rawResultsMap = new Map<
      string,
      {
        product?: ProductItem | null;
        productSku: string;
        productName: string;
        price: number;
        quantity: number;
      }
    >();

    itemLines.forEach((line) => {
      let itemName = line;
      let qty = 1;

      const p1 = line.match(/^(.*?)\((\d+)\)\s*$/);
      const p2 = line.match(/^(.*?)\s*[-xX:]\s*(\d+)\s*$/);
      const p3 = line.match(/^(.*?)\s+(\d+)\s*(?:pcs|pc|buah|bj)?$/i);

      if (p1) {
        itemName = p1[1].trim();
        qty = parseInt(p1[2], 10) || 1;
      } else if (p2) {
        itemName = p2[1].trim();
        qty = parseInt(p2[2], 10) || 1;
      } else if (p3) {
        itemName = p3[1].trim();
        qty = parseInt(p3[2], 10) || 1;
      }

      itemName = itemName.replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim();
      if (!itemName) return;

      const matched = findBestProductMatch(itemName);
      const sku = matched ? matched.sku : itemName.toUpperCase();
      const name = matched
        ? matched.name + (matched.motif ? ` - ${matched.motif}` : '') + (matched.color ? ` (${matched.color})` : '')
        : itemName;
      const price = matched ? matched.sellingPrice || matched.wholesalePrice || 42000 : 42000;
      const key = matched ? matched.id : sku;

      if (rawResultsMap.has(key)) {
        const exist = rawResultsMap.get(key)!;
        exist.quantity += qty;
      } else {
        rawResultsMap.set(key, {
          product: matched,
          productSku: sku,
          productName: name,
          price,
          quantity: qty,
        });
      }
    });

    const parsedList: FormItem[] = Array.from(rawResultsMap.values()).map((r, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      productId: r.product ? r.product.id : null,
      productSku: r.productSku,
      productName: r.productName,
      price: r.price,
      quantityOrdered: r.quantity,
      isMatched: !!r.product,
    }));

    if (parsedList.length === 0) {
      setError('Tidak ada rincian produk yang berhasil dikenali dari teks.');
      return;
    }

    recalculateTierPrices(parsedList);
    setHasParsed(true);
    setSuccessMsg(`Berhasil mem-parse ${parsedList.length} produk dari teks WhatsApp!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleProductSelect = (index: number, prodId: string, prod?: ProductItem) => {
    const updated = [...items];
    if (prod) {
      updated[index] = {
        ...updated[index],
        productId: prod.id,
        productSku: prod.sku,
        productName: prod.name + (prod.motif ? ` - ${prod.motif}` : '') + (prod.color ? ` (${prod.color})` : ''),
        price: prod.sellingPrice || prod.wholesalePrice || 42000,
        isMatched: true,
      };
    } else {
      updated[index] = {
        ...updated[index],
        productId: null,
        productSku: '',
        productName: '',
        price: 0,
        isMatched: false,
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
      {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: null,
        productSku: '',
        productName: '',
        price: 0,
        quantityOrdered: 1,
        isMatched: false,
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
    recalculateTierPrices(updated);
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

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all border-t border-x flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'paste'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste Chat WhatsApp (Otomatis Parse)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all border-t border-x flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Pilih Manual (Satu Per Satu)
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
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

          {/* Locked Reseller Tier Banner */}
          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Ketentuan Harga Reseller Terkunci (Locked Tier):</p>
              <p className="text-indigo-800 text-[11px] mt-0.5">
                Harga satuan dihitung otomatis berdasarkan <strong>TOTAL kuantiti seluruh item PO</strong>. Ketika barang dicicil kirim sebagian, harga per pcs tetap memakai harga reseller total ini.
              </p>
            </div>
          </div>

          {/* PASTE WHATSAPP SECTION */}
          {activeTab === 'paste' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ClipboardPaste className="w-4 h-4 text-indigo-600" /> Tempel Chat WhatsApp Customer:
                </label>
                <span className="text-[11px] text-slate-400">Baris 1 = Nama Customer, Baris berikutnya = Produk & Qty</span>
              </div>

              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Contoh format:&#10;KAK DELLA&#10;spark flower(4)&#10;blush sparky(3)&#10;BW83(3)"
                className="w-full p-3 bg-white rounded-xl border border-slate-200 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseWhatsAppText}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Proses & Parse Teks WhatsApp
                </button>
              </div>
            </div>
          )}

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
                  placeholder="Contoh: KAK DELLA"
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
                placeholder="Contoh: Titip motif cadangan lavender, kirim saat batch Bandung sampai"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* List of PO Items */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" /> Rincian Produk Pre-Order ({items.length} Item • {totalQuantity} Pcs)
                </h3>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Baris
                </button>
              </div>

                      <div className="space-y-2.5">
                {items.map((row, idx) => (
                  <div
                    key={row.id || idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col gap-2.5"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      {/* Searchable Select or Manual Input */}
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Produk PO #{idx + 1}
                          </label>
                          {row.productId ? (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...items];
                                updated[idx] = {
                                  ...updated[idx],
                                  productId: null,
                                  isMatched: false,
                                };
                                setItems(updated);
                              }}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer"
                            >
                              ✍️ Ubah ke Input Produk Baru (Manual)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...items];
                                updated[idx] = {
                                  ...updated[idx],
                                  productId: products[0]?.id || null,
                                  productSku: products[0]?.sku || '',
                                  productName: products[0]?.name || '',
                                  price: products[0]?.sellingPrice || 42000,
                                  isMatched: true,
                                };
                                setItems(updated);
                                recalculateTierPrices(updated);
                              }}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer"
                            >
                              🔍 Cari dari Master Data
                            </button>
                          )}
                        </div>

                        {row.productId ? (
                          <SearchableProductSelect
                            products={products}
                            value={row.productId}
                            onChange={(val, prod) => handleProductSelect(idx, val, prod)}
                            placeholder="Ketik SKU atau nama motif..."
                            stockType="AVAILABLE"
                            allowManual={true}
                            onManualSelect={() => {
                              const updated = [...items];
                              updated[idx] = {
                                ...updated[idx],
                                productId: null,
                                isMatched: false,
                              };
                              setItems(updated);
                            }}
                          />
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Nama motif / produk baru (cth: Gamis Rayon Spark Flower)..."
                                value={row.productName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = [...items];
                                  updated[idx] = {
                                    ...updated[idx],
                                    productName: val,
                                    productSku: updated[idx].productSku || val.toUpperCase().replace(/\s+/g, '-'),
                                  };
                                  setItems(updated);
                                  recalculateTierPrices(updated);
                                }}
                                className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 placeholder:font-normal"
                              />
                              <input
                                type="text"
                                placeholder="SKU (cth: BW83 / SPARK)"
                                value={row.productSku}
                                onChange={(e) => {
                                  const updated = [...items];
                                  updated[idx] = {
                                    ...updated[idx],
                                    productSku: e.target.value.toUpperCase(),
                                  };
                                  setItems(updated);
                                }}
                                className="w-28 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 placeholder:font-normal"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-700 font-medium bg-amber-50/80 px-2 py-0.5 rounded-md border border-amber-200/60">
                              <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>✨ Produk Baru (Belum ada di Master Data - otomatis dicocokkan saat Stok Masuk)</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      <div className="w-full sm:w-24">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Qty (Pcs)
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
                      <div className="w-full sm:w-28">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1 text-right">
                          Harga Satuan (Rp)
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
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-20 cursor-pointer"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
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
