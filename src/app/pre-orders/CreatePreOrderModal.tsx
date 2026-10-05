'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  ChevronDown,
  Check,
  Edit3,
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { createPreOrder } from './actions';
import {
  getStoredProductTypes,
  findProductMasterType,
  ProductMasterType,
  DEFAULT_PRODUCT_TYPES,
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
}

export default function CreatePreOrderModal({
  isOpen,
  onClose,
  products = [],
  onCreated,
}: CreatePreOrderModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab State: Default is 'paste'
  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');

  // WhatsApp quick paste text state
  const [rawText, setRawText] = useState(
`KAK DELLA
spark flower(4)
blush sparky(3)
BW83(3)`
  );

  // Main Form States
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);
  const [hasParsedFromPaste, setHasParsedFromPaste] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Open suggestion dropdown for a specific row index in manual mode
  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab('paste');
      setError(null);
      setSuccessMsg(null);
      setCustomerPhone('');
      setNotes('');
      // Auto-parse default text on open
      const initial = parseWhatsAppStringToItems(rawText);
      if (initial) {
        setCustomerName(initial.customer);
        setItems(initial.items);
        setHasParsedFromPaste(true);
      } else {
        setCustomerName('');
        setItems([
          {
            id: `item-${Date.now()}`,
            productId: null,
            productSku: '',
            productName: '',
            price: 42000,
            quantityOrdered: 1,
          },
        ]);
        setHasParsedFromPaste(false);
      }
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

  // Product Matching Helper
  const findBestProductMatch = (query: string): ProductItem | null => {
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

    // 4. Exact Combined
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

    // 6. Name / Motif includes query
    if (q.length >= 4) {
      const nameContains = products.find((p) => {
        const pName = p.name.toLowerCase();
        const pMotif = p.motif ? p.motif.toLowerCase() : '';
        return pName.includes(q) || (pMotif && pMotif.includes(q));
      });
      if (nameContains) return nameContains;
    }

    return null;
  };

  // Reseller tier price calculation based on total PO qty
  const getResellerTierPriceForTotalQty = (
    totalQty: number,
    typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
  ): number => {
    const resellerType = typesList.find((t) => t.isResellerEligible) || DEFAULT_PRODUCT_TYPES[0];
    if (!resellerType || !resellerType.tiers || resellerType.tiers.length === 0) {
      return 42000;
    }
    const sorted = [...resellerType.tiers].sort((a, b) => b.minQty - a.minQty);
    for (const tier of sorted) {
      const isMin = totalQty >= tier.minQty;
      const isMax = tier.maxQty === null || tier.maxQty === undefined || totalQty <= tier.maxQty;
      if (isMin && isMax) {
        return tier.price;
      }
    }
    return 42000;
  };

  // Recalculate tier prices
  const recalculateTierPrices = (currentItems: FormItem[]) => {
    const types = getStoredProductTypes();
    
    let totalResellerPoolQty = 0;
    currentItems.forEach((it) => {
      const nameToCheck = it.productName || it.productSku;
      if (!nameToCheck) return;
      const master = findProductMasterType(nameToCheck, types);
      if (!master || master.isResellerEligible) {
        totalResellerPoolQty += Number(it.quantityOrdered) || 0;
      }
    });

    const resellerUnitPrice = getResellerTierPriceForTotalQty(totalResellerPoolQty, types);

    const refreshed = currentItems.map((it) => {
      const nameToCheck = it.productName || it.productSku;
      if (!nameToCheck) return it;
      const master = findProductMasterType(nameToCheck, types);

      if (master && !master.isResellerEligible) {
        const prod = products.find((p) => p.id === it.productId);
        const basePrice = prod?.sellingPrice || master.defaultPrice || 85000;
        return {
          ...it,
          price: basePrice,
        };
      }

      return {
        ...it,
        price: resellerUnitPrice,
      };
    });

    setItems(refreshed);
  };

  // Parse WhatsApp Text String Helper
  const parseWhatsAppStringToItems = (text: string) => {
    if (!text.trim()) return null;
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return null;

    const rawCustomer = lines[0].replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim();
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
    }));

    if (parsedList.length === 0) return null;

    const types = getStoredProductTypes();
    let totalResellerPoolQty = 0;
    parsedList.forEach((it) => {
      const nameToCheck = it.productName || it.productSku;
      if (!nameToCheck) return;
      const master = findProductMasterType(nameToCheck, types);
      if (!master || master.isResellerEligible) {
        totalResellerPoolQty += Number(it.quantityOrdered) || 0;
      }
    });

    const resellerUnitPrice = getResellerTierPriceForTotalQty(totalResellerPoolQty, types);

    const refreshed = parsedList.map((it) => {
      const nameToCheck = it.productName || it.productSku;
      if (!nameToCheck) return it;
      const master = findProductMasterType(nameToCheck, types);

      if (master && !master.isResellerEligible) {
        const prod = products.find((p) => p.id === it.productId);
        const basePrice = prod?.sellingPrice || master.defaultPrice || 85000;
        return {
          ...it,
          price: basePrice,
        };
      }

      return {
        ...it,
        price: resellerUnitPrice,
      };
    });

    return {
      customer: rawCustomer,
      items: refreshed,
    };
  };

  // Parse WhatsApp Text on button click or textarea change
  const handleParseWhatsAppText = (customText?: string) => {
    setError(null);
    const textToParse = typeof customText === 'string' ? customText : rawText;
    const parsed = parseWhatsAppStringToItems(textToParse);
    if (!parsed) {
      setError('Format teks belum sesuai. Baris 1: Nama Customer, Baris berikutnya: Nama motif / SKU & Jumlah pcs.');
      return;
    }

    if (parsed.customer) {
      setCustomerName(parsed.customer);
    }
    setItems(parsed.items);
    setHasParsedFromPaste(true);
    setSuccessMsg(`Berhasil mem-parse ${parsed.items.length} produk untuk ${parsed.customer || 'Customer'}!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSelectProduct = (index: number, prod: ProductItem) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: prod.id,
      productSku: prod.sku,
      productName: prod.name + (prod.motif ? ` - ${prod.motif}` : '') + (prod.color ? ` (${prod.color})` : ''),
      price: prod.sellingPrice || prod.wholesalePrice || 42000,
    };
    setActiveDropdownIndex(null);
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
    const types = getStoredProductTypes();
    const defaultUnitPrice = getResellerTierPriceForTotalQty(totalQuantity + 1, types);
    setItems([
      ...items,
      {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: null,
        productSku: '',
        productName: '',
        price: defaultUnitPrice,
        quantityOrdered: 1,
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
    recalculateTierPrices(updated);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    let activeCustomerName = customerName.trim();
    let activeItems = [...items];

    // If in paste tab, ensure we process the latest raw text if items aren't yet populated
    if (activeTab === 'paste' && (!activeCustomerName || activeItems.length === 0 || !hasParsedFromPaste)) {
      const parsed = parseWhatsAppStringToItems(rawText);
      if (parsed) {
        if (!activeCustomerName && parsed.customer) {
          activeCustomerName = parsed.customer;
          setCustomerName(parsed.customer);
        }
        activeItems = parsed.items;
        setItems(parsed.items);
      }
    }

    if (!activeCustomerName) {
      setError('Nama customer wajib diisi. Silakan isi Nama Customer di baris pertama teks WhatsApp.');
      return;
    }

    const validItems = activeItems.filter(
      (it) => (it.productSku?.trim() || it.productName?.trim()) && Number(it.quantityOrdered) > 0
    );

    if (validItems.length === 0) {
      setError('Silakan tentukan minimal 1 nama produk/motif untuk dicatat PO.');
      return;
    }

    setLoading(true);

    try {
      const res = await createPreOrder({
        customerName: activeCustomerName,
        customerPhone: customerPhone.trim() || null,
        notes: notes.trim() || null,
        items: validItems.map((it) => ({
          productId: it.productId,
          productSku: (it.productSku || it.productName || 'PO-ITEM').trim(),
          productName: (it.productName || it.productSku || 'Produk PO').trim(),
          price: it.price,
          quantityOrdered: it.quantityOrdered,
        })),
      });

      if (res.success) {
        setSuccessMsg(`Pre-Order #${res.poNumber} berhasil dicatat!`);
        startTransition(() => {
          router.refresh();
        });
        if (onCreated) onCreated();
        setTimeout(() => {
          setLoading(false);
          onClose();
        }, 700);
      } else {
        setLoading(false);
        setError(res.error || 'Gagal menyimpan Pre-Order.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Terjadi kesalahan sistem saat menyimpan Pre-Order.');
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
                Pencatatan antrean PO yang otomatis terpotong saat stok masuk dari konveksi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation: Default is Paste */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-t border-x flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'paste'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> 📋 Paste Chat WhatsApp (Otomatis)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-t border-x flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> ✍️ Input Manual (Satu Per Satu)
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
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

          {/* TAB 1: PASTE WHATSAPP (DEFAULT) */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ClipboardPaste className="w-4 h-4 text-indigo-600" /> Tempel Chat WhatsApp Customer:
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Baris 1 = Nama Customer, Baris berikutnya = Nama Motif/SKU & Qty
                  </span>
                </div>

                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                  }}
                  placeholder="Contoh format:&#10;KAK DELLA&#10;spark flower(4)&#10;blush sparky(3)&#10;BW83(3)"
                  className="w-full p-3 bg-white rounded-xl border border-slate-200 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] text-indigo-700 font-medium">
                    ✨ Klik tombol di samping untuk mengupdate preview jika baru copas teks baru
                  </span>
                  <button
                    type="button"
                    onClick={() => handleParseWhatsAppText()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Proses Teks Copas
                  </button>
                </div>
              </div>

              {/* Optional Phone & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Catatan Pre-Order (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Titip motif cadangan lavender"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Live Parsed Preview Table */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" /> Hasil Copas: {customerName ? `Customer "${customerName}"` : 'Belum Terdeteksi'}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {items.length} Motif / Produk • {totalQuantity} pcs • Harga Reseller Otomatis
                    </p>
                  </div>
                  <span className="font-mono font-bold text-sm text-indigo-700">
                    {formatRupiah(totalAmount)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {items.map((it, idx) => (
                    <div key={it.id || idx} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 shrink-0">
                          {it.productSku}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">
                          {it.productName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-right">
                        <span className="font-bold text-slate-900 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                          {it.quantityOrdered} pcs
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          @ {formatRupiah(it.price)}
                        </span>
                        <span className="font-bold text-slate-900 w-24">
                          {formatRupiah(it.price * it.quantityOrdered)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MANUAL INPUT */}
          {activeTab === 'manual' && (
            <form id="create-po-manual-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Customer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" /> Nama Customer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: KAK DELLA"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
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
                  {items.map((row, idx) => {
                    const filteredMaster = row.productName?.trim()
                      ? products.filter((p) => {
                          const q = row.productName.toLowerCase();
                          return (
                            p.sku.toLowerCase().includes(q) ||
                            p.name.toLowerCase().includes(q) ||
                            (p.motif && p.motif.toLowerCase().includes(q))
                          );
                        })
                      : products.slice(0, 8);

                    return (
                      <div
                        key={row.id || idx}
                        className="p-3 bg-slate-50/90 rounded-xl border border-slate-200 flex flex-col gap-2 relative"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          {/* Unified Product / Motif Input with Suggestions */}
                          <div className="flex-1 w-full relative">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Nama Produk / Motif PO #{idx + 1}
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Ketik nama motif / produk (cth: Monogram Navy / BW83)..."
                                value={row.productName}
                                onFocus={() => setActiveDropdownIndex(idx)}
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
                                  setActiveDropdownIndex(idx);
                                }}
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400 placeholder:font-normal"
                              />

                              {/* Dropdown Suggestions */}
                              {activeDropdownIndex === idx && filteredMaster.length > 0 && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-50">
                                  <div className="p-1.5 bg-slate-50 text-[10px] font-semibold text-slate-400 uppercase flex items-center justify-between">
                                    <span>Pilih dari Master Data</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveDropdownIndex(null)}
                                      className="text-slate-400 hover:text-slate-700"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                  {filteredMaster.map((prod) => (
                                    <div
                                      key={prod.id}
                                      onClick={() => handleSelectProduct(idx, prod)}
                                      className="p-2 hover:bg-indigo-50 cursor-pointer text-xs flex items-center justify-between"
                                    >
                                      <div className="truncate">
                                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-[10px] mr-1.5">
                                          {prod.sku}
                                        </span>
                                        <span className="font-medium text-slate-800">
                                          {prod.name} {prod.motif ? `- ${prod.motif}` : ''}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 shrink-0">
                                        Stok: {prod.physicalStock}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
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
                    );
                  })}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total PO: </span>
              <strong className="text-slate-900 font-mono text-sm">{totalQuantity} pcs</strong>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <span className="text-slate-500">Total Nilai: </span>
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
              type="button"
              onClick={() => handleSubmit()}
              disabled={loading || isPending}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading || isPending ? (
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
