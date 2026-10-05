'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ClipboardPaste,
  Package,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  Tag,
} from 'lucide-react';
import { OrderRecord, addItemsToOrder, AddItemInput } from './actions';
import { ProductMatchInfo, getActiveProductsForOrder } from '../paste-order/actions';
import {
  ProductMasterType,
  getStoredProductTypes,
  checkIsResellerEligible,
  findProductMasterType,
  calculateProductPrice,
  PRODUCT_TYPES_UPDATED_EVENT,
} from '@/lib/productTypes';

interface AddItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderRecord;
}

interface ParsedNewItem {
  id: string;
  productId?: string;
  productSku: string;
  productName: string;
  sellingPrice: number;
  price: number;
  quantity: number;
  isMatched: boolean;
  isResellerEligible: boolean;
}

type TabMode = 'paste' | 'manual';

export default function AddItemsModal({ isOpen, onClose, order }: AddItemsModalProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('paste');
  const [products, setProducts] = useState<ProductMatchInfo[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [productTypes, setProductTypes] = useState<ProductMasterType[]>([]);

  // Paste mode state
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedNewItem[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // Manual mode state
  const [manualItems, setManualItems] = useState<ParsedNewItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Load products & types on mount
  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
      setProductTypes(getStoredProductTypes());
      getActiveProductsForOrder()
        .then((prods) => setProducts(prods))
        .finally(() => setLoadingProducts(false));

      // Reset state
      setRawText('');
      setParsedItems([]);
      setHasParsed(false);
      setManualItems([]);
      setSearchQuery('');
      setError(null);
      setSuccessMsg(null);
      setActiveTab('paste');
    }
  }, [isOpen]);

  // Reseller tiers
  const DEFAULT_RESELLER_TIERS = [
    { minQty: 0, maxQty: 5, price: 42000 },
    { minQty: 6, maxQty: 10, price: 39000 },
    { minQty: 11, maxQty: 19, price: 36000 },
    { minQty: 20, maxQty: 49, price: 32500 },
    { minQty: 50, maxQty: 99, price: 31000 },
    { minQty: 100, maxQty: 199, price: 30000 },
    { minQty: 200, maxQty: 500, price: 28500 },
    { minQty: 501, maxQty: 999, price: 27500 },
    { minQty: 1000, maxQty: null, price: 26000 },
  ];

  const getResellerPrice = (totalQty: number) => {
    let tiers = DEFAULT_RESELLER_TIERS;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bywell_reseller_tiers');
      if (stored) {
        try { tiers = JSON.parse(stored); } catch { /* use default */ }
      }
    }
    if (totalQty >= 1000) return tiers[8]?.price || 26000;
    if (totalQty >= 501) return tiers[7]?.price || 27500;
    if (totalQty >= 200) return tiers[6]?.price || 28500;
    if (totalQty >= 100) return tiers[5]?.price || 30000;
    if (totalQty >= 50) return tiers[4]?.price || 31000;
    if (totalQty >= 20) return tiers[3]?.price || 32500;
    if (totalQty >= 11) return tiers[2]?.price || 36000;
    if (totalQty >= 6) return tiers[1]?.price || 39000;
    return tiers[0]?.price || 42000;
  };

  // Calculate existing order quantities
  const existingTotalQty = order.items.reduce((acc, it) => acc + it.quantity, 0);
  const existingResellerQty = order.items.reduce((acc, it) => {
    return checkIsResellerEligible(it.productName, productTypes) ? acc + it.quantity : acc;
  }, 0);

  const currentItems = activeTab === 'paste' ? parsedItems : manualItems;
  const newTotalQty = currentItems.reduce((acc, it) => acc + it.quantity, 0);
  const newResellerQty = currentItems.reduce((acc, it) => {
    return checkIsResellerEligible(it.productName, productTypes) ? acc + it.quantity : acc;
  }, 0);

  const combinedResellerQty = existingResellerQty + newResellerQty;
  const resellerTierUnitPrice = getResellerPrice(combinedResellerQty);

  // Find best match in catalog
  // Accurate product match without false positives
  const findBestProductMatch = (query: string): ProductMatchInfo | null => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    const cleanQ = q.replace(/[^a-z0-9]/g, '');

    // 1. Exact SKU match
    const exactSku = products.find(
      (p) =>
        p.sku.toLowerCase() === q ||
        (cleanQ.length >= 2 && p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQ)
    );
    if (exactSku) return exactSku;

    // 2. Exact Motif match
    const exactMotif = products.find(
      (p) => p.motif && p.motif.toLowerCase().trim() === q
    );
    if (exactMotif) return exactMotif;

    // 3. Exact Full Name match
    const exactName = products.find((p) => p.name.toLowerCase().trim() === q);
    if (exactName) return exactName;

    // 4. Exact Combined Name & Motif
    const exactCombined = products.find((p) => {
      const full = `${p.name} ${p.motif || ''}`.toLowerCase().trim();
      const withColor = `${p.name} ${p.motif || ''} ${p.color || ''}`.toLowerCase().trim();
      const skuMotif = `${p.sku} ${p.motif || ''}`.toLowerCase().trim();
      return full === q || withColor === q || skuMotif === q;
    });
    if (exactCombined) return exactCombined;

    // 5. SKU prefix match
    if (cleanQ.length >= 3) {
      const prefixSku = products.find((p) => {
        const pCleanSku = p.sku.toLowerCase().replace(/[^a-z0-9]/g, '');
        return pCleanSku === cleanQ || (pCleanSku.startsWith(cleanQ) && cleanQ.length >= 4);
      });
      if (prefixSku) return prefixSku;
    }

    // 6. Database product name / motif contains entire query
    if (q.length >= 4) {
      const nameContainsQuery = products.find((p) => {
        const pName = p.name.toLowerCase();
        const pMotif = p.motif ? p.motif.toLowerCase() : '';
        return pName.includes(q) || (pMotif && pMotif.includes(q));
      });
      if (nameContainsQuery) return nameContainsQuery;
    }

    return null;
  };

  // Helper to re-apply prices to parsed or manual items based on custom tiers per product
  const syncItemPrices = (newItemsList: ParsedNewItem[]) => {
    const typesList = productTypes.length > 0 ? productTypes : getStoredProductTypes();

    // 1. Hitung total kuantiti per grup tipe produk (gabungan existing order + item baru)
    const groupQtyMap = new Map<string, number>();

    // Tambah dari item existing order
    order.items.forEach((ex) => {
      const master = findProductMasterType(ex.productName, typesList);
      const groupKey = master ? master.name.toUpperCase() : ex.productName.toUpperCase();
      groupQtyMap.set(groupKey, (groupQtyMap.get(groupKey) || 0) + ex.quantity);
    });

    // Tambah dari item baru
    newItemsList.forEach((it) => {
      const master = findProductMasterType(it.productName, typesList);
      const groupKey = master ? master.name.toUpperCase() : it.productName.toUpperCase();
      groupQtyMap.set(groupKey, (groupQtyMap.get(groupKey) || 0) + it.quantity);
    });

    // 2. Hitung harga per item
    return newItemsList.map((it) => {
      const master = findProductMasterType(it.productName, typesList);
      const groupKey = master ? master.name.toUpperCase() : it.productName.toUpperCase();
      const combinedGroupQty = groupQtyMap.get(groupKey) || it.quantity;
      const basePrice = it.sellingPrice || 42000;

      const calc = calculateProductPrice(it.productName, combinedGroupQty, basePrice, typesList);

      return {
        ...it,
        isResellerEligible: master ? master.isResellerEligible : checkIsResellerEligible(it.productName, typesList),
        price: calc.price,
      };
    });
  };

  // Parse pasted text
  const handleParse = () => {
    setError(null);
    if (!rawText.trim()) {
      setError('Teks masih kosong.');
      return;
    }

    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setError('Tidak ada item yang bisa diparsing.');
      return;
    }

    const resultMap = new Map<string, ParsedNewItem>();

    lines.forEach((line) => {
      if (/^(kak|bu|pak|mas|mbak|sis|bro|nama)\s/i.test(line)) return;
      if (/^(\+?62|08)\d{8,13}$/.test(line.replace(/[\s\-]/g, ''))) return;

      let itemName = line;
      let qty = 1;

      const p1 = line.match(/^(.*?)\((\d+)\)\s*$/);
      const p2 = line.match(/^(.*?)\s*[-xX:]\s*(\d+)\s*$/);
      const p3 = line.match(/^(.*?)\s+(\d+)\s*(?:pcs|pc|buah|bj)?$/i);

      if (p1) { itemName = p1[1].trim(); qty = parseInt(p1[2], 10); }
      else if (p2) { itemName = p2[1].trim(); qty = parseInt(p2[2], 10); }
      else if (p3) { itemName = p3[1].trim(); qty = parseInt(p3[2], 10); }

      if (!itemName) return;

      const match = findBestProductMatch(itemName);
      const sku = match?.sku || itemName.toUpperCase();
      const name = match?.name || itemName;
      const key = match?.id || sku;
      const parsedQty = Math.max(1, qty || 1);
      const isEligible = checkIsResellerEligible(name, productTypes);
      const sellingPrice = match?.sellingPrice || 42000;

      if (resultMap.has(key)) {
        const exist = resultMap.get(key)!;
        exist.quantity += parsedQty;
      } else {
        resultMap.set(key, {
          id: crypto.randomUUID(),
          productId: match?.id,
          productSku: sku,
          productName: name,
          sellingPrice,
          price: isEligible ? resellerTierUnitPrice : sellingPrice,
          quantity: parsedQty,
          isMatched: !!match,
          isResellerEligible: isEligible,
        });
      }
    });

    const results = Array.from(resultMap.values());

    if (results.length === 0) {
      setError('Tidak ada item valid yang ditemukan dari teks.');
      return;
    }

    // Re-sync with final pricing
    const finalSynced = syncItemPrices(results);
    setParsedItems(finalSynced);
    setHasParsed(true);
  };

  // Add manual item
  const handleAddManualItem = (product: ProductMatchInfo) => {
    const isEligible = checkIsResellerEligible(product.name, productTypes);
    const sellingPrice = product.sellingPrice || 42000;

    const existing = manualItems.find((m) => m.productId === product.id);
    let updated: ParsedNewItem[];

    if (existing) {
      updated = manualItems.map((m) =>
        m.productId === product.id ? { ...m, quantity: m.quantity + 1 } : m
      );
    } else {
      updated = [
        ...manualItems,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          sellingPrice,
          price: isEligible ? resellerTierUnitPrice : sellingPrice,
          quantity: 1,
          isMatched: true,
          isResellerEligible: isEligible,
        },
      ];
    }

    setManualItems(syncItemPrices(updated));
    setSearchQuery('');
  };

  // Update qty for manual item
  const updateManualQty = (id: string, qty: number) => {
    const updated = manualItems.map((m) => (m.id === id ? { ...m, quantity: Math.max(1, qty) } : m));
    setManualItems(syncItemPrices(updated));
  };

  // Remove item
  const removeItem = (id: string) => {
    if (activeTab === 'paste') {
      const updated = parsedItems.filter((p) => p.id !== id);
      setParsedItems(syncItemPrices(updated));
    } else {
      const updated = manualItems.filter((m) => m.id !== id);
      setManualItems(syncItemPrices(updated));
    }
  };

  // Update qty for parsed item
  const updateParsedQty = (id: string, qty: number) => {
    const updated = parsedItems.map((p) => (p.id === id ? { ...p, quantity: Math.max(1, qty) } : p));
    setParsedItems(syncItemPrices(updated));
  };

  // Filtered products for manual search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return products
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.motif && p.motif.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, searchQuery]);

  // Format Rupiah
  const formatRupiah = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  // Submit
  const handleSubmit = async () => {
    const items = activeTab === 'paste' ? parsedItems : manualItems;
    if (items.length === 0) {
      setError('Belum ada item yang ditambahkan.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: AddItemInput[] = items.map((it) => ({
      productId: it.productId,
      productSku: it.productSku,
      productName: it.productName,
      price: it.price,
      quantity: it.quantity,
    }));

    const result = await addItemsToOrder(order.id, payload, resellerTierUnitPrice);

    if (result.success) {
      setSuccessMsg(`Berhasil menambahkan ${items.length} item ke Order #${order.orderNumber}!`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setError(result.error || 'Gagal menambahkan item.');
    }

    setSubmitting(false);
  };

  if (!isOpen) return null;

  // Calculate new subtotal
  const addedSubtotal = currentItems.reduce((acc, it) => acc + it.price * it.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-fuchsia-50 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-violet-600" />
              Tambah Item ke Order #{order.orderNumber}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer: <strong>{order.customerName}</strong> • Item saat ini: {order.items.length} ({existingTotalQty} pcs)
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-white/80 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success overlay */}
        {successMsg && (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-base font-bold text-emerald-700">{successMsg}</p>
          </div>
        )}

        {!successMsg && (
          <>
            {/* Tab Switcher */}
            <div className="px-6 pt-4 pb-0 flex gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('paste')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'paste'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste Teks WA
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'manual'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" /> Pilih Manual
              </button>
            </div>

            {/* Content Area */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Paste Tab */}
              {activeTab === 'paste' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Tempel Teks Tambahan Pesanan:
                    </label>
                    <textarea
                      rows={5}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder={`Contoh:\nspark flower(2)\nPJ01(1)`}
                      className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleParse}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Ekstrak Item
                  </button>

                  {/* Parsed items table */}
                  {parsedItems.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden mt-3">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                          <tr>
                            <th className="p-2.5">Produk</th>
                            <th className="p-2.5 text-center">Tipe</th>
                            <th className="p-2.5 text-right">Harga</th>
                            <th className="p-2.5 text-center">Qty</th>
                            <th className="p-2.5 text-right">Subtotal</th>
                            <th className="p-2.5 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedItems.map((it) => (
                            <tr key={it.id}>
                              <td className="p-2.5">
                                <div className="font-semibold text-slate-800">{it.productName}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{it.productSku}</div>
                              </td>
                              <td className="p-2.5 text-center">
                                {it.isResellerEligible ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Reseller
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                    Normal
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-semibold text-slate-700">
                                {formatRupiah(it.price)}
                              </td>
                              <td className="p-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  value={it.quantity}
                                  onChange={(e) => updateParsedQty(it.id, parseInt(e.target.value, 10) || 1)}
                                  className="w-14 text-center px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-bold"
                                />
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-900">
                                {formatRupiah(it.price * it.quantity)}
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeItem(it.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Tab */}
              {activeTab === 'manual' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari SKU, Nama Produk, atau Motif..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>

                  {filteredProducts.length > 0 && (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white shadow-sm">
                      {filteredProducts.map((p) => {
                        const isEligible = checkIsResellerEligible(p.name, productTypes);
                        return (
                          <div
                            key={p.id}
                            className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                          >
                            <div>
                              <span className="font-mono font-bold text-xs text-slate-800">{p.sku}</span>
                              <span className="ml-2 text-xs text-slate-600">{p.name} {p.motif ? `(${p.motif})` : ''}</span>
                              <span className="ml-2 text-[10px] text-slate-400">
                                (Stok: {p.availableStock} | Ecer: {formatRupiah(p.sellingPrice)})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddManualItem(p)}
                              className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Tambah
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {manualItems.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden mt-3">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                          <tr>
                            <th className="p-2.5">Produk</th>
                            <th className="p-2.5 text-center">Tipe</th>
                            <th className="p-2.5 text-right">Harga</th>
                            <th className="p-2.5 text-center">Qty</th>
                            <th className="p-2.5 text-right">Subtotal</th>
                            <th className="p-2.5 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {manualItems.map((it) => (
                            <tr key={it.id}>
                              <td className="p-2.5">
                                <div className="font-semibold text-slate-800">{it.productName}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{it.productSku}</div>
                              </td>
                              <td className="p-2.5 text-center">
                                {it.isResellerEligible ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Reseller
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                    Normal
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-semibold text-slate-700">
                                {formatRupiah(it.price)}
                              </td>
                              <td className="p-2.5 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  value={it.quantity}
                                  onChange={(e) => updateManualQty(it.id, parseInt(e.target.value, 10) || 1)}
                                  className="w-14 text-center px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-bold"
                                />
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-900">
                                {formatRupiah(it.price * it.quantity)}
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeItem(it.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs text-slate-500">Tambahan Subtotal:</span>
                <div className="font-bold text-slate-900 text-base">{formatRupiah(addedSubtotal)}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || currentItems.length === 0}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Tambahkan ke Order
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
