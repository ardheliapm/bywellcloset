'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Package,
  Sparkles,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ClipboardPaste,
  Clock,
  Tag,
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { PreOrderRecord, addItemsToPreOrder, AddPreOrderItemInput } from './actions';
import {
  getStoredProductTypes,
  findProductMasterType,
  checkIsResellerEligible,
  calculateProductPrice,
  ProductMasterType,
  DEFAULT_PRODUCT_TYPES,
} from '@/lib/productTypes';

interface AddPreOrderItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preOrder: PreOrderRecord | null;
  products?: ProductItem[];
}

interface NewItemRow {
  id: string;
  productId: string | null;
  productSku: string;
  productName: string;
  categoryName: string;
  price: number;
  quantityOrdered: number;
  isCustomPrice?: boolean;
}

export default function AddPreOrderItemsModal({
  isOpen,
  onClose,
  preOrder,
  products = [],
}: AddPreOrderItemsModalProps) {
  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');
  const [rawText, setRawText] = useState('');
  const [items, setItems] = useState<NewItemRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // Manual search state
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [productTypes, setProductTypes] = useState<ProductMasterType[]>([]);

  // Filter products for catalog search (must be before any return statement according to React Rules of Hooks)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return (products || [])
      .filter(
        (p) =>
          p.sku?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          (p.motif && p.motif.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      setProductTypes(getStoredProductTypes());
      setActiveTab('paste');
      setRawText('');
      setItems([]);
      setHasParsed(false);
      setSearchQuery('');
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen || !preOrder) return null;

  const existingTotalQty = preOrder?.items?.length
    ? preOrder.items.reduce((acc, it) => acc + (Number(it.quantityOrdered) || 0), 0)
    : 0;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  // Best product match in catalog
  const findBestProductMatch = (query: string, preferredCategory?: string): ProductItem | null => {
    const q = (query || '').toLowerCase().trim();
    if (!q) return null;
    const cleanQ = q.replace(/[^a-z0-9]/g, '');

    const candidateProducts = preferredCategory
      ? products.filter((p) => {
          const cat = preferredCategory.toLowerCase();
          const pName = (p.name || '').toLowerCase();
          return (
            pName.includes(cat) ||
            (cat.includes('paris') && pName.includes('paris')) ||
            (cat.includes('tryspan') && pName.includes('tryspan')) ||
            (cat.includes('bella') && pName.includes('bella'))
          );
        })
      : products;

    // 1. Exact SKU match
    const exactSku = candidateProducts.find(
      (p) =>
        p.sku?.toLowerCase() === q ||
        (cleanQ.length >= 2 && p.sku?.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQ)
    );
    if (exactSku) return exactSku;

    // 2. Exact Motif
    const exactMotif = candidateProducts.find(
      (p) => p.motif && p.motif.toLowerCase().trim() === q
    );
    if (exactMotif) return exactMotif;

    // 3. Exact Name
    const exactName = candidateProducts.find((p) => (p.name || '').toLowerCase().trim() === q);
    if (exactName) return exactName;

    // 4. Combined
    const exactCombined = candidateProducts.find((p) => {
      const full = `${p.name || ''} ${p.motif || ''}`.toLowerCase().trim();
      const skuMotif = `${p.sku || ''} ${p.motif || ''}`.toLowerCase().trim();
      return full === q || skuMotif === q;
    });
    if (exactCombined) return exactCombined;

    // 5. Fallback across all products
    if (preferredCategory) {
      const fallbackExact = products.find((p) => p.sku?.toLowerCase() === q);
      if (fallbackExact) return fallbackExact;
    }

    return null;
  };

  // Re-calculate prices according to master reseller tiers
  const syncPricesWithTiers = (itemList: NewItemRow[]): NewItemRow[] => {
    try {
      const typesList = productTypes.length > 0 ? productTypes : getStoredProductTypes();

      // Sum existing PO items by category group
      const groupQtyMap = new Map<string, number>();

      if (Array.isArray(preOrder?.items)) {
        preOrder.items.forEach((ex) => {
          const master = findProductMasterType(ex.productName, typesList);
          const groupKey = master ? master.name.toUpperCase() : (ex.productName || '').toUpperCase();
          groupQtyMap.set(groupKey, (groupQtyMap.get(groupKey) || 0) + (Number(ex.quantityOrdered) || 0));
        });
      }

      if (Array.isArray(itemList)) {
        itemList.forEach((it) => {
          const master = findProductMasterType(it.productName, typesList);
          const groupKey = master ? master.name.toUpperCase() : (it.categoryName || '').toUpperCase();
          groupQtyMap.set(groupKey, (groupQtyMap.get(groupKey) || 0) + (Number(it.quantityOrdered) || 0));
        });
      }

      return itemList.map((it) => {
        if (it.isCustomPrice) return it;

        const master = findProductMasterType(it.productName, typesList);
        const groupKey = master ? master.name.toUpperCase() : (it.categoryName || '').toUpperCase();
        const totalGroupQty = groupQtyMap.get(groupKey) || (Number(it.quantityOrdered) || 1);

        let defaultSellingPrice = 42000;
        if (master && master.defaultPrice) {
          defaultSellingPrice = master.defaultPrice;
        } else if ((it.categoryName || '').includes('PARIS')) {
          defaultSellingPrice = 25000;
        }

        const calc = calculateProductPrice(it.productName || '', totalGroupQty, defaultSellingPrice, typesList);

        return {
          ...it,
          price: calc?.price ?? defaultSellingPrice,
        };
      });
    } catch (err) {
      console.error('Error in syncPricesWithTiers:', err);
      return itemList;
    }
  };

  // Parse pasted WhatsApp text
  const handleParseWhatsApp = () => {
    setError(null);
    if (!rawText.trim()) {
      setError('Teks WhatsApp masih kosong.');
      return;
    }

    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setError('Tidak ada baris yang bisa dibaca.');
      return;
    }

    let currentCategory = 'BABY TRYSPAN';
    const parsedList: NewItemRow[] = [];

    lines.forEach((line) => {
      const upperLine = line.toUpperCase();

      // Customer name header ignore (or check)
      if (
        /^(KAK|BU|PAK|MAS|MBAK|SIS|BRO|NAMA)\s/i.test(line) &&
        !line.includes('(') &&
        !line.includes('-') &&
        !line.includes(':')
      ) {
        return;
      }

      // Detect Category Header
      if (
        upperLine === 'PARIS JEPANG' ||
        upperLine === 'PARIS JAPAN' ||
        upperLine === 'PJ' ||
        upperLine.includes('PARIS JEPANG') ||
        upperLine.includes('PARIS JAPAN')
      ) {
        currentCategory = 'PARIS JAPAN';
        return;
      } else if (
        upperLine === 'BABY TRYSPAN' ||
        upperLine === 'TRYSPAN' ||
        upperLine === 'BT' ||
        upperLine.includes('BABY TRYSPAN')
      ) {
        currentCategory = 'BABY TRYSPAN';
        return;
      } else if (
        upperLine === 'BELLA SQUARE' ||
        upperLine === 'BELLA' ||
        upperLine.includes('BELLA SQUARE')
      ) {
        currentCategory = 'BELLA SQUARE';
        return;
      }

      // Ignore phone number
      if (/^(\+?62|08)\d{8,13}$/.test(line.replace(/[\s\-]/g, ''))) return;

      // Extract item and quantity
      let itemCode = line;
      let qty = 1;

      const p1 = line.match(/^(.*?)\((\d+)\)\s*$/);
      const p2 = line.match(/^(.*?)\s*[-xX:]\s*(\d+)\s*$/);
      const p3 = line.match(/^(.*?)\s+(\d+)\s*(?:pcs|pc|buah|bj)?$/i);

      if (p1) {
        itemCode = p1[1].trim();
        qty = parseInt(p1[2], 10);
      } else if (p2) {
        itemCode = p2[1].trim();
        qty = parseInt(p2[2], 10);
      } else if (p3) {
        itemCode = p3[1].trim();
        qty = parseInt(p3[2], 10);
      }

      if (!itemCode) return;

      const match = findBestProductMatch(itemCode, currentCategory);
      let defaultPrice = 42000;
      if (currentCategory === 'PARIS JAPAN') defaultPrice = 25000;
      if (match?.sellingPrice) defaultPrice = match.sellingPrice;

      const finalSku = match?.sku || (currentCategory === 'PARIS JAPAN' && !itemCode.toUpperCase().startsWith('PJ-') ? itemCode.toUpperCase() : itemCode.toUpperCase());
      const finalName = match?.name || `${currentCategory} - ${itemCode}`;

      parsedList.push({
        id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        productId: match?.id || null,
        productSku: finalSku,
        productName: finalName,
        categoryName: currentCategory,
        price: defaultPrice,
        quantityOrdered: Math.max(1, qty || 1),
      });
    });

    if (parsedList.length === 0) {
      setError('Tidak ada item valid yang ditemukan dari format teks.');
      return;
    }

    const synced = syncPricesWithTiers(parsedList);
    setItems(synced);
    setHasParsed(true);
  };

  // Add manual item from catalog search
  const handleAddCatalogItem = (product: ProductItem) => {
    let catName = 'BABY TRYSPAN';
    if (product.name.toUpperCase().includes('PARIS') || product.sku.toUpperCase().startsWith('PJ')) {
      catName = 'PARIS JAPAN';
    } else if (product.name.toUpperCase().includes('BELLA')) {
      catName = 'BELLA SQUARE';
    }

    const newRow: NewItemRow = {
      id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: product.id,
      productSku: product.sku,
      productName: `${product.name} ${product.motif ? `(${product.motif})` : ''}`.trim(),
      categoryName: catName,
      price: product.sellingPrice || (catName === 'PARIS JAPAN' ? 25000 : 42000),
      quantityOrdered: 1,
    };

    const updated = [...items, newRow];
    setItems(syncPricesWithTiers(updated));
    setSearchQuery('');
  };

  // Add empty manual row
  const handleAddManualRow = () => {
    const newRow: NewItemRow = {
      id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: null,
      productSku: '',
      productName: '',
      categoryName: 'PARIS JAPAN',
      price: 25000,
      quantityOrdered: 1,
    };
    setItems((prev) => [...prev, newRow]);
  };

  // Update item field
  const handleUpdateItem = (id: string, field: keyof NewItemRow, val: any) => {
    const updated = items.map((it) => {
      if (it.id !== id) return it;
      const modified = { ...it, [field]: val };
      if (field === 'price') {
        modified.isCustomPrice = true;
      }
      return modified;
    });

    if (field === 'quantityOrdered' || field === 'categoryName') {
      setItems(syncPricesWithTiers(updated));
    } else {
      setItems(updated);
    }
  };

  // Remove item
  const handleRemoveItem = (id: string) => {
    const filtered = items.filter((it) => it.id !== id);
    setItems(syncPricesWithTiers(filtered));
  };

  const addedQty = items.reduce((acc, it) => acc + (Number(it.quantityOrdered) || 0), 0);
  const addedSubtotal = items.reduce(
    (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantityOrdered) || 0),
    0
  );

  // Submit to server
  const handleSubmit = async () => {
    if (items.length === 0) {
      setError('Belum ada item tambahan yang ditambahkan.');
      return;
    }

    const invalid = items.find((it) => !it.productSku?.trim() && !it.productName?.trim());
    if (invalid) {
      setError('Pastikan semua baris memiliki Kode / Nama SKU produk.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: AddPreOrderItemInput[] = items.map((it) => ({
      productId: it.productId,
      productSku: it.productSku.trim() || it.productName.trim(),
      productName: it.productName.trim() || `${it.categoryName} - ${it.productSku}`,
      price: Number(it.price) || 0,
      quantityOrdered: Number(it.quantityOrdered) || 1,
    }));

    const res = await addItemsToPreOrder(preOrder.id, payload);

    if (res.success) {
      setSuccessMsg(`Berhasil menambahkan ${items.length} item (${addedQty} pcs) ke Pre-Order #${preOrder.poNumber}!`);
      setTimeout(() => {
        onClose();
      }, 1400);
    } else {
      setError(res.error || 'Gagal menambahkan item ke Pre-Order.');
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
                <Plus className="w-4 h-4" />
              </div>
              Tambah Item ke Pre-Order #{preOrder.poNumber}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer: <strong className="text-slate-800">{preOrder?.customerName}</strong> • Item saat ini: {preOrder?.items?.length || 0} ({existingTotalQty} pcs)
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-white/80 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Overlay */}
        {successMsg && (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-emerald-800">Item Berhasil Ditambahkan!</h4>
            <p className="text-sm text-slate-600 max-w-md">{successMsg}</p>
          </div>
        )}

        {!successMsg && (
          <>
            {/* Tab Buttons */}
            <div className="px-6 pt-4 pb-0 flex gap-2 shrink-0 border-b border-slate-100 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ClipboardPaste className="w-4 h-4" /> Paste Chat WhatsApp (Otomatis)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'manual'
                    ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Plus className="w-4 h-4" /> Input Manual (Satu Per Satu)
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* TAB 1: PASTE WHATSAPP */}
              {activeTab === 'paste' && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <ClipboardPaste className="w-4 h-4 text-violet-600" />
                        Tempel Chat WhatsApp Tambahan:
                      </label>
                      <span className="text-[11px] text-slate-500">
                        Bisa campur kategori (PARIS JEPANG & BABY TRYSPAN)
                      </span>
                    </div>

                    <textarea
                      rows={5}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder={`Contoh:\nPARIS JEPANG\n152(1)\n123(1)\nBABY TRYSPAN\nSPARK FLOWER(1)`}
                      className="w-full p-3 bg-white rounded-xl border border-slate-200 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Klik tombol di samping untuk mengekstrak item dari teks
                      </span>
                      <button
                        type="button"
                        onClick={handleParseWhatsApp}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Proses Teks Copas
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MANUAL CATALOG SEARCH */}
              {activeTab === 'manual' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari SKU, Nama Produk, atau Motif dari Master..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>

                  {filteredProducts.length > 0 && (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white shadow-sm max-h-48 overflow-y-auto">
                      {filteredProducts.map((p) => (
                        <div
                          key={p.id}
                          className="p-2.5 flex items-center justify-between hover:bg-violet-50/50 transition-colors"
                        >
                          <div>
                            <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.sku}
                            </span>
                            <span className="ml-2 text-xs font-semibold text-slate-700">
                              {p.name} {p.motif ? `(${p.motif})` : ''}
                            </span>
                            <span className="ml-2 text-[11px] text-slate-400">
                              (Stok: {p.physicalStock - p.reservedStock} | Ecer: {formatRupiah(p.sellingPrice)})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddCatalogItem(p)}
                            className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Tambah
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ITEMS LIST (FOR BOTH TABS) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-violet-600" />
                    Daftar Item Tambahan ({items.length} item • {addedQty} pcs)
                  </h4>

                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="text-xs text-violet-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris Manual
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center space-y-2 bg-slate-50/50">
                    <p className="text-xs text-slate-500">
                      {activeTab === 'paste'
                        ? 'Tempel chat WhatsApp di atas lalu klik "Proses Teks Copas", atau klik "Tambah Baris Manual".'
                        : 'Cari produk di atas atau klik "Tambah Baris Manual" untuk menambahkan item.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const isParis = it.categoryName === 'PARIS JAPAN' || it.productName.toUpperCase().includes('PARIS');
                      return (
                        <div
                          key={it.id}
                          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-violet-300 transition-all flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs"
                        >
                          {/* Category Badge & Product Info */}
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                const nextCat = isParis ? 'BABY TRYSPAN' : 'PARIS JAPAN';
                                handleUpdateItem(it.id, 'categoryName', nextCat);
                              }}
                              className={`px-2 py-1 rounded-md text-[10px] font-bold shrink-0 cursor-pointer border transition-colors ${
                                isParis
                                  ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}
                              title="Klik untuk ubah kategori"
                            >
                              {isParis ? 'PARIS JAPAN' : 'BABY TRYSPAN'}
                            </button>

                            <input
                              type="text"
                              value={it.productSku || it.productName}
                              onChange={(e) => {
                                handleUpdateItem(it.id, 'productSku', e.target.value);
                                handleUpdateItem(it.id, 'productName', e.target.value);
                              }}
                              placeholder="Nama SKU / Motif Produk..."
                              className="font-semibold text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 flex-1 min-w-0 focus:outline-hidden focus:ring-1 focus:ring-violet-500 focus:bg-white"
                            />
                          </div>

                          {/* Qty, Unit Price, Subtotal & Delete */}
                          <div className="flex items-center gap-2 shrink-0 justify-between sm:justify-end">
                            {/* Qty */}
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                              <button
                                type="button"
                                onClick={() => handleUpdateItem(it.id, 'quantityOrdered', Math.max(1, it.quantityOrdered - 1))}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-200 font-bold text-xs"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={it.quantityOrdered}
                                onChange={(e) =>
                                  handleUpdateItem(it.id, 'quantityOrdered', Math.max(1, parseInt(e.target.value, 10) || 1))
                                }
                                className="w-12 text-center text-xs font-bold bg-white py-1 focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateItem(it.id, 'quantityOrdered', it.quantityOrdered + 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-200 font-bold text-xs"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-[11px] text-slate-400">pcs</span>

                            {/* Price */}
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-slate-400">@</span>
                              <input
                                type="number"
                                step={500}
                                value={it.price}
                                onChange={(e) => handleUpdateItem(it.id, 'price', Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-20 text-right px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-violet-500"
                              />
                            </div>

                            {/* Subtotal */}
                            <div className="font-bold text-xs text-slate-900 min-w-[75px] text-right">
                              {formatRupiah(it.price * it.quantityOrdered)}
                            </div>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(it.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Hapus baris"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs text-slate-500">
                  Tambahan Subtotal ({addedQty} pcs):
                </span>
                <div className="font-bold text-slate-900 text-lg">{formatRupiah(addedSubtotal)}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || items.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Tambahkan ke Pre-Order ({addedQty} Pcs)
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
