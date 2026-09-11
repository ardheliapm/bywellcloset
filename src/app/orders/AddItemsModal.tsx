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
} from 'lucide-react';
import { OrderRecord, addItemsToOrder, AddItemInput } from './actions';
import { ProductMatchInfo, getActiveProductsForOrder } from '../paste-order/actions';

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
  price: number;
  quantity: number;
  isMatched: boolean;
}

type TabMode = 'paste' | 'manual';

export default function AddItemsModal({ isOpen, onClose, order }: AddItemsModalProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('paste');
  const [products, setProducts] = useState<ProductMatchInfo[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Paste mode state
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedNewItem[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // Manual mode state
  const [manualItems, setManualItems] = useState<ParsedNewItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Load products on mount
  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
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

  // Calculate total qty including existing order items
  const existingQty = order.items.reduce((acc, it) => acc + it.quantity, 0);

  const currentItems = activeTab === 'paste' ? parsedItems : manualItems;
  const newQty = currentItems.reduce((acc, it) => acc + it.quantity, 0);
  const combinedTotalQty = existingQty + newQty;

  const unitPrice = getResellerPrice(combinedTotalQty);

  // Find best match in catalog
  const findBestProductMatch = (query: string): ProductMatchInfo | null => {
    const q = query.toLowerCase().trim();
    if (!q) return null;

    const exactSku = products.find((p) => p.sku.toLowerCase() === q);
    if (exactSku) return exactSku;

    const exactName = products.find((p) => p.name.toLowerCase() === q);
    if (exactName) return exactName;

    const exactMotif = products.find((p) => p.motif && p.motif.toLowerCase() === q);
    if (exactMotif) return exactMotif;

    const partSku = products.find((p) => p.sku.toLowerCase().includes(q) || q.includes(p.sku.toLowerCase()));
    if (partSku) return partSku;

    const partName = products.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
    if (partName) return partName;

    const partMotif = products.find((p) => p.motif && (p.motif.toLowerCase().includes(q) || q.includes(p.motif.toLowerCase())));
    if (partMotif) return partMotif;

    return null;
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

    const results: ParsedNewItem[] = [];

    lines.forEach((line) => {
      // Skip lines that look like customer names
      if (/^(kak|bu|pak|mas|mbak|sis|bro|nama)\s/i.test(line)) return;
      // Skip phone numbers
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

      results.push({
        id: crypto.randomUUID(),
        productId: match?.id,
        productSku: match?.sku || itemName.toUpperCase(),
        productName: match?.name || itemName,
        price: unitPrice,
        quantity: qty || 1,
        isMatched: !!match,
      });
    });

    if (results.length === 0) {
      setError('Tidak ada item valid yang ditemukan dari teks.');
      return;
    }

    setParsedItems(results);
    setHasParsed(true);
  };

  // Add manual item
  const handleAddManualItem = (product: ProductMatchInfo) => {
    const existing = manualItems.find((m) => m.productId === product.id);
    if (existing) {
      setManualItems((prev) =>
        prev.map((m) => m.productId === product.id ? { ...m, quantity: m.quantity + 1 } : m)
      );
    } else {
      setManualItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          price: unitPrice,
          quantity: 1,
          isMatched: true,
        },
      ]);
    }
    setSearchQuery('');
  };

  // Update qty for manual item
  const updateManualQty = (id: string, qty: number) => {
    setManualItems((prev) => prev.map((m) => m.id === id ? { ...m, quantity: Math.max(1, qty) } : m));
  };

  // Remove item
  const removeItem = (id: string) => {
    if (activeTab === 'paste') {
      setParsedItems((prev) => prev.filter((p) => p.id !== id));
    } else {
      setManualItems((prev) => prev.filter((m) => m.id !== id));
    }
  };

  // Update qty for parsed item
  const updateParsedQty = (id: string, qty: number) => {
    setParsedItems((prev) => prev.map((p) => p.id === id ? { ...p, quantity: Math.max(1, qty) } : p));
  };

  // Recalculate prices when combined total changes
  useEffect(() => {
    const price = getResellerPrice(combinedTotalQty);
    if (activeTab === 'paste') {
      setParsedItems((prev) => prev.map((p) => ({ ...p, price })));
    } else {
      setManualItems((prev) => prev.map((m) => ({ ...m, price })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedTotalQty]);

  // Filtered products for manual search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.motif && p.motif.toLowerCase().includes(q))
    ).slice(0, 8);
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

    const result = await addItemsToOrder(order.id, payload);

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

  const additionalTotal = currentItems.reduce((acc, it) => acc + it.price * it.quantity, 0);

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
              Customer: <strong>{order.customerName}</strong> • Item saat ini: {order.items.length} ({existingQty} pcs)
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
              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {/* === PASTE TAB === */}
              {activeTab === 'paste' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">
                      Paste teks tambahan (tanpa nama customer):
                    </label>
                    <textarea
                      value={rawText}
                      onChange={(e) => { setRawText(e.target.value); setHasParsed(false); }}
                      placeholder={`Contoh:\nBW90(5)\nBW91(3)\nblush sparky(2)`}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-none font-mono bg-slate-50"
                    />
                  </div>

                  <button
                    onClick={handleParse}
                    className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-xs"
                  >
                    <Sparkles className="w-4 h-4" /> Parse & Cocokkan SKU
                  </button>

                  {/* Parsed Results */}
                  {hasParsed && parsedItems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-600">Hasil Parsing ({parsedItems.length} item):</h4>
                      {parsedItems.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                            item.isMatched
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : 'bg-amber-50/60 border-amber-200'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {item.isMatched ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              )}
                              <span className="text-xs font-bold text-slate-800 truncate">
                                <span className="font-mono">{item.productSku}</span> — {item.productName}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 ml-6">
                              {formatRupiah(item.price)} /pcs
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateParsedQty(item.id, parseInt(e.target.value, 10))}
                              min={1}
                              className="w-14 px-2 py-1 text-center rounded-lg border border-slate-200 text-xs font-bold bg-white"
                            />
                            <span className="text-xs text-slate-400">pcs</span>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* === MANUAL TAB === */}
              {activeTab === 'manual' && (
                <div className="space-y-3">
                  {/* Product Search */}
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Cari produk (SKU / Nama / Motif):</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Ketik SKU atau nama produk..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-slate-50"
                      />
                    </div>

                    {/* Search Dropdown */}
                    {filteredProducts.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-20 max-h-48 overflow-y-auto">
                        {filteredProducts.map((prod) => (
                          <button
                            key={prod.id}
                            onClick={() => handleAddManualItem(prod)}
                            className="w-full px-4 py-2.5 text-left hover:bg-violet-50 transition-colors flex items-center justify-between border-b border-slate-50 last:border-0"
                          >
                            <div>
                              <span className="text-xs font-bold font-mono text-slate-800">{prod.sku}</span>
                              <span className="text-xs text-slate-500 ml-2">{prod.name}</span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Stok: {prod.availableStock}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {loadingProducts && (
                    <div className="text-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-violet-500 mx-auto" />
                      <p className="text-xs text-slate-400 mt-1">Memuat produk...</p>
                    </div>
                  )}

                  {/* Manual Items List */}
                  {manualItems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-600">Item yang akan ditambahkan ({manualItems.length} item):</h4>
                      {manualItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border bg-emerald-50/60 border-emerald-200 flex items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="text-xs font-bold text-slate-800 truncate">
                                <span className="font-mono">{item.productSku}</span> — {item.productName}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 ml-6">
                              {formatRupiah(item.price)} /pcs
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateManualQty(item.id, parseInt(e.target.value, 10))}
                              min={1}
                              className="w-14 px-2 py-1 text-center rounded-lg border border-slate-200 text-xs font-bold bg-white"
                            />
                            <span className="text-xs text-slate-400">pcs</span>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {manualItems.length === 0 && !loadingProducts && (
                    <div className="text-center py-6 text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">Cari dan pilih produk dari dropdown di atas untuk menambahkan ke order.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              {currentItems.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Item baru yang akan ditambahkan:</span>
                    <span className="font-bold">{currentItems.length} item ({newQty} pcs)</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Total qty gabungan (lama + baru):</span>
                    <span className="font-bold">{existingQty} + {newQty} = {combinedTotalQty} pcs</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Harga per pcs (tier {combinedTotalQty} pcs):</span>
                    <span className="font-bold text-violet-700">{formatRupiah(unitPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1.5 text-slate-800">
                    <span>Tambahan tagihan:</span>
                    <span className="text-rose-600">{formatRupiah(additionalTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/80">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-white transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || currentItems.length === 0}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Simpan & Tambahkan
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
