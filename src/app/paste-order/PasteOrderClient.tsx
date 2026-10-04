'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardPaste, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  ShoppingBag, 
  FileText, 
  Loader2, 
  Tag,
  Gift,
  Layers,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { ProductMatchInfo, createOrder } from './actions';
import InvoiceModal from '../orders/InvoiceModal';
import {
  ProductMasterType,
  getStoredProductTypes,
  checkIsResellerEligible,
  findProductMasterType,
  calculateProductPrice,
  PRODUCT_TYPES_UPDATED_EVENT,
} from '@/lib/productTypes';

interface ParsedItem {
  id: string;
  rawText: string;
  productId?: string;
  productSku: string;
  productName: string;
  sellingPrice: number;
  wholesalePrice: number;
  price: number;
  quantity: number;
  availableStock: number;
  isMatched: boolean;
  isResellerEligible: boolean;
}

interface PasteOrderClientProps {
  products: ProductMatchInfo[];
}

export default function PasteOrderClient({ products }: PasteOrderClientProps) {
  const [rawText, setRawText] = useState(
`KAK DELLA
spark flower(4)
blush sparky(3)
BW76(3)`
  );

  const [customerName, setCustomerName] = useState('KAK DELLA');
  const [customerPhone, setCustomerPhone] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productTypes, setProductTypes] = useState<ProductMasterType[]>([]);

  // Success state
  const [successOrder, setSuccessOrder] = useState<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    totalAmount: number;
    items: {
      productSku: string;
      productName: string;
      price: number;
      quantity: number;
      subtotal: number;
    }[];
    createdAt: Date;
  } | null>(null);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Formatting Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Find best match in catalog (Accurate & avoids false positives on new products)
  const findBestProductMatch = (query: string): ProductMatchInfo | null => {
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

  // Default Reseller Tier Definitions based on Pricelist
  const DEFAULT_RESELLER_TIERS = [
    { minQty: 0, maxQty: 5, price: 42000, label: 'Eceran (0-5 PCS)' },
    { minQty: 6, maxQty: 10, price: 39000, label: 'Tier 6-10 PCS' },
    { minQty: 11, maxQty: 19, price: 36000, label: 'Tier 11-19 PCS' },
    { minQty: 20, maxQty: 49, price: 32500, label: 'Tier 20-49 PCS' },
    { minQty: 50, maxQty: 99, price: 31000, label: 'Tier 50-99 PCS' },
    { minQty: 100, maxQty: 199, price: 30000, label: 'Tier 100-199 PCS' },
    { minQty: 200, maxQty: 500, price: 28500, label: 'Tier 200-500 PCS' },
    { minQty: 501, maxQty: 999, price: 27500, label: 'Tier 501-999 PCS' },
    { minQty: 1000, maxQty: null, price: 26000, label: 'Tier >1000 PCS' },
  ];

  const [resellerTiers, setResellerTiers] = useState(DEFAULT_RESELLER_TIERS);

  const loadCustomTiers = () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bywell_reseller_tiers');
      if (stored) {
        try {
          setResellerTiers(JSON.parse(stored));
        } catch (e) {
          setResellerTiers(DEFAULT_RESELLER_TIERS);
        }
      } else {
        setResellerTiers(DEFAULT_RESELLER_TIERS);
      }
    }
  };

  const loadProductTypes = () => {
    setProductTypes(getStoredProductTypes());
  };

  useEffect(() => {
    loadCustomTiers();
    loadProductTypes();

    const handleTierUpdate = () => loadCustomTiers();
    const handleTypesUpdate = () => loadProductTypes();

    window.addEventListener('bywell_pricelist_updated', handleTierUpdate);
    window.addEventListener(PRODUCT_TYPES_UPDATED_EVENT, handleTypesUpdate);

    return () => {
      window.removeEventListener('bywell_pricelist_updated', handleTierUpdate);
      window.removeEventListener(PRODUCT_TYPES_UPDATED_EVENT, handleTypesUpdate);
    };
  }, []);

  const getResellerTier = (totalQty: number) => {
    const list = resellerTiers.length === 9 ? resellerTiers : DEFAULT_RESELLER_TIERS;
    if (totalQty >= 1000) return list[8];
    if (totalQty >= 501) return list[7];
    if (totalQty >= 200) return list[6];
    if (totalQty >= 100) return list[5];
    if (totalQty >= 50) return list[4];
    if (totalQty >= 20) return list[3];
    if (totalQty >= 11) return list[2];
    if (totalQty >= 6) return list[1];
    return list[0];
  };

  const getNextResellerTier = (totalQty: number) => {
    if (totalQty < 6) return { nextQty: 6, nextPrice: 39000, diffQty: 6 - totalQty };
    if (totalQty < 11) return { nextQty: 11, nextPrice: 36000, diffQty: 11 - totalQty };
    if (totalQty < 20) return { nextQty: 20, nextPrice: 32500, diffQty: 20 - totalQty };
    if (totalQty < 50) return { nextQty: 50, nextPrice: 31000, diffQty: 50 - totalQty };
    if (totalQty < 100) return { nextQty: 100, nextPrice: 30000, diffQty: 100 - totalQty };
    if (totalQty < 200) return { nextQty: 200, nextPrice: 28500, diffQty: 200 - totalQty };
    if (totalQty < 501) return { nextQty: 501, nextPrice: 27500, diffQty: 501 - totalQty };
    if (totalQty < 1000) return { nextQty: 1000, nextPrice: 26000, diffQty: 1000 - totalQty };
    return null;
  };

  // Sync pricing: Hitung harga otomatis berdasarkan ketentuan tier masing-masing produk
  const applyResellerTierPricing = (items: ParsedItem[], currentTypes = productTypes) => {
    const typesList = currentTypes.length > 0 ? currentTypes : getStoredProductTypes();

    // 1. Kelompokkan total kuantiti per tipe/nama produk
    const groupQtyMap = new Map<string, number>();

    items.forEach((it) => {
      const master = findProductMasterType(it.productName, typesList);
      const groupKey = master ? master.name.toUpperCase() : it.productName.toUpperCase();
      groupQtyMap.set(groupKey, (groupQtyMap.get(groupKey) || 0) + it.quantity);
    });

    // 2. Hitung harga per item sesuai tier kuantiti tipe produk tersebut
    return items.map((item) => {
      const master = findProductMasterType(item.productName, typesList);
      const groupKey = master ? master.name.toUpperCase() : item.productName.toUpperCase();
      const groupQty = groupQtyMap.get(groupKey) || item.quantity;
      const basePrice = item.sellingPrice || 42000;

      const calc = calculateProductPrice(item.productName, groupQty, basePrice, typesList);

      return {
        ...item,
        isResellerEligible: master ? master.isResellerEligible : checkIsResellerEligible(item.productName, typesList),
        wholesalePrice: calc.price,
        price: calc.price,
      };
    });
  };

  // Parser Algorithm
  const parseWhatsAppText = () => {
    setError(null);
    if (!rawText.trim()) {
      setError('Teks order WhatsApp masih kosong.');
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
    const rawCustomer = lines[0]
      .replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '')
      .trim();
    setCustomerName(rawCustomer || 'Customer Tanpa Nama');

    // Remaining lines: Order Items
    const itemLines = lines.slice(1);
    const rawResultsMap = new Map<string, {
      rawText: string;
      product?: ProductMatchInfo | null;
      productSku: string;
      productName: string;
      quantity: number;
    }>();

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
      const name = matched ? matched.name : itemName;
      const key = matched ? matched.id : sku;

      if (rawResultsMap.has(key)) {
        const exist = rawResultsMap.get(key)!;
        exist.quantity += qty;
        exist.rawText += ` + ${line}`;
      } else {
        rawResultsMap.set(key, {
          rawText: line,
          product: matched,
          productSku: sku,
          productName: name,
          quantity: qty,
        });
      }
    });

    const rawResults = Array.from(rawResultsMap.values());
    const currentTypes = productTypes.length > 0 ? productTypes : getStoredProductTypes();

    const rawParsed: ParsedItem[] = rawResults.map((r, idx) => {
      const isEligible = checkIsResellerEligible(r.productName, currentTypes);

      if (r.product) {
        const sellingPrice = r.product.sellingPrice || 42000;
        return {
          id: `item-${idx}-${Date.now()}`,
          rawText: r.rawText,
          productId: r.product.id,
          productSku: r.product.sku,
          productName: r.product.name,
          sellingPrice,
          wholesalePrice: sellingPrice,
          price: sellingPrice,
          quantity: r.quantity,
          availableStock: r.product.availableStock,
          isMatched: true,
          isResellerEligible: isEligible,
        };
      } else {
        return {
          id: `item-${idx}-${Date.now()}`,
          rawText: r.rawText,
          productId: undefined,
          productSku: r.productSku,
          productName: r.productName,
          sellingPrice: 42000,
          wholesalePrice: 42000,
          price: 42000,
          quantity: r.quantity,
          availableStock: 0,
          isMatched: false,
          isResellerEligible: isEligible,
        };
      }
    });

    const finalized = applyResellerTierPricing(rawParsed, currentTypes);
    setParsedItems(finalized);
    setHasParsed(true);
  };

  // Initial parse on load
  useEffect(() => {
    if (products.length > 0 && !hasParsed) {
      parseWhatsAppText();
    }
  }, [products]);

  // Total Calculations
  const totalQty = useMemo(() => {
    return parsedItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [parsedItems]);

  // Hitung jumlah pcs khusus item yang berlaku diskon reseller (BABY TRYSPAN)
  const resellerEligibleQty = useMemo(() => {
    return parsedItems.reduce((acc, item) => {
      const isEligible = checkIsResellerEligible(item.productName, productTypes);
      return isEligible ? acc + item.quantity : acc;
    }, 0);
  }, [parsedItems, productTypes]);

  // Hitung jumlah pcs non-reseller (PARIS JAPAN, dll)
  const nonResellerQty = useMemo(() => {
    return totalQty - resellerEligibleQty;
  }, [totalQty, resellerEligibleQty]);

  const activeResellerTier = useMemo(() => {
    return getResellerTier(resellerEligibleQty);
  }, [resellerEligibleQty]);

  const nextResellerTier = useMemo(() => {
    return getNextResellerTier(resellerEligibleQty);
  }, [resellerEligibleQty]);

  const totalAmount = useMemo(() => {
    return parsedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [parsedItems]);

  const baseRetailTotal = useMemo(() => {
    return parsedItems.reduce((acc, item) => acc + item.sellingPrice * item.quantity, 0);
  }, [parsedItems]);

  const totalSavings = Math.max(0, baseRetailTotal - totalAmount);

  // Handle select product from dropdown
  const handleSelectProduct = (itemId: string, selectedProductId: string) => {
    const selected = products.find((p) => p.id === selectedProductId);
    if (!selected) return;

    setParsedItems((prev) => {
      const isEligible = checkIsResellerEligible(selected.name, productTypes);
      const updated = prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            productId: selected.id,
            productSku: selected.sku,
            productName: selected.name,
            sellingPrice: selected.sellingPrice || 42000,
            availableStock: selected.availableStock,
            isMatched: true,
            isResellerEligible: isEligible,
          };
        }
        return item;
      });
      return applyResellerTierPricing(updated);
    });
  };

  // Update item quantity with automatic reseller tier switch
  const handleQuantityChange = (itemId: string, newQty: number) => {
    const val = Math.max(1, newQty);
    const updated = parsedItems.map((item) => (item.id === itemId ? { ...item, quantity: val } : item));
    setParsedItems(applyResellerTierPricing(updated));
  };

  // Update item price manually
  const handlePriceChange = (itemId: string, newPrice: number) => {
    const val = Math.max(0, newPrice);
    setParsedItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, price: val } : item))
    );
  };

  // Delete item
  const handleDeleteItem = (itemId: string) => {
    const updated = parsedItems.filter((item) => item.id !== itemId);
    setParsedItems(applyResellerTierPricing(updated));
  };

  // Add new item manual
  const handleAddNewItem = () => {
    const firstProd = products[0];
    const isEligible = firstProd ? checkIsResellerEligible(firstProd.name, productTypes) : true;
    const initialPrice = firstProd ? firstProd.sellingPrice || 42000 : 42000;

    const newItem: ParsedItem = {
      id: `manual-${Date.now()}`,
      rawText: firstProd ? firstProd.name : 'Produk Baru',
      productId: firstProd ? firstProd.id : undefined,
      productSku: firstProd ? firstProd.sku : 'PROD-NEW',
      productName: firstProd ? firstProd.name : 'BABY TRYSPAN',
      sellingPrice: initialPrice,
      wholesalePrice: initialPrice,
      price: initialPrice,
      quantity: 1,
      availableStock: firstProd ? firstProd.availableStock : 0,
      isMatched: Boolean(firstProd),
      isResellerEligible: isEligible,
    };

    setParsedItems(applyResellerTierPricing([...parsedItems, newItem]));
  };

  // Submit Order
  const handleSaveOrder = async () => {
    if (!customerName.trim()) {
      setError('Nama customer tidak boleh kosong.');
      return;
    }

    if (parsedItems.length === 0) {
      setError('Daftar pesanan tidak boleh kosong.');
      return;
    }

    const unmatchedCount = parsedItems.filter((i) => !i.productId).length;
    if (unmatchedCount > 0) {
      const confirmUnmatched = window.confirm(
        `Ada ${unmatchedCount} produk yang belum terhubung ke Master Produk. Tetap simpan order ini?`
      );
      if (!confirmUnmatched) return;
    }

    setSubmitting(true);
    setError(null);

    const res = await createOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      notes: rawText.trim(),
      items: parsedItems.map((item) => ({
        productId: item.productId,
        productSku: item.productSku,
        productName: item.productName,
        price: item.price,
        quantity: item.quantity,
      })),
    });

    setSubmitting(false);

    if (res.success && res.orderId && res.orderNumber) {
      const orderSummary = {
        orderId: res.orderId,
        orderNumber: res.orderNumber,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        totalAmount: res.totalAmount || totalAmount,
        items: parsedItems.map((item) => ({
          productSku: item.productSku,
          productName: item.productName,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.price * item.quantity,
        })),
        createdAt: new Date(),
      };

      setSuccessOrder(orderSummary);
      setShowInvoiceModal(true);
    } else {
      setError(res.error || 'Gagal menyimpan pesanan.');
    }
  };

  const handleReset = () => {
    setSuccessOrder(null);
    setRawText('');
    setCustomerName('');
    setCustomerPhone('');
    setParsedItems([]);
    setHasParsed(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
            <ClipboardPaste className="w-5 h-5" />
          </div>
          Paste Order WhatsApp
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Tempel teks salinan pesanan dari chat WhatsApp, sistem otomatis membedakan produk <strong>BABY TRYSPAN</strong> (Diskon Reseller) dan <strong>PARIS JAPAN</strong> (Harga Normal).
        </p>
      </div>

      {/* Success Alert Banner */}
      {successOrder && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-900">
                Order Berhasil Disimpan & Stok Di-Hold!
              </h3>
              <p className="text-sm text-emerald-700 mt-0.5">
                Nomor Order: <strong className="font-mono">{successOrder.orderNumber}</strong> • Customer:{' '}
                <strong>{successOrder.customerName}</strong> • Total:{' '}
                <strong>{formatRupiah(successOrder.totalAmount)}</strong>
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                🔒 Stok barang telah ditahan (Reserved Stock). Stok available produk otomatis berkurang.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs"
            >
              <FileText className="w-4 h-4" /> Lihat & Kirim Invoice
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-semibold text-sm transition-colors"
            >
              Input Order Baru
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Text Input (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" /> Teks Pesanan WhatsApp
              </label>
              <span className="text-xs text-slate-400">Format fleksibel</span>
            </div>

            <textarea
              rows={9}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Contoh:\nKAK DELLA\nspark flower(4)\nblush sparky(3)\nBW76(3)`}
              className="w-full p-3.5 rounded-xl border border-slate-200 font-mono text-sm leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
            />

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-emerald-600" /> Pricelist Reseller BABY TRYSPAN
                </p>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Mix Motif Aktif
                </span>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-slate-600">
                {resellerTiers.map((t, i) => (
                  <div key={i} className={`flex justify-between py-0.5 border-b border-slate-100 ${i === 8 ? 'font-bold text-emerald-700 bg-emerald-50 px-1 rounded-sm' : ''}`}>
                    <span>{t.label.split('(')[0]}</span> <span className="font-bold text-slate-800">{formatRupiah(t.price)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 italic pt-1">
                *Hanya produk <strong>BABY TRYSPAN</strong> yang dihitung kuantitinya untuk tier harga reseller. Produk <strong>PARIS JAPAN</strong> tetap dihitung harga normalnya.
              </p>
            </div>

            <button
              type="button"
              onClick={parseWhatsAppText}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-amber-400" /> Proses & Parse Pesanan
            </button>
          </div>
        </div>

        {/* Right Column: Preview & Adjustment Table (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Preview & Validasi Pesanan</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Periksa kesesuaian produk, status tier reseller BABY TRYSPAN, dan ketersediaan stok.
                </p>
              </div>

              <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold text-xs border border-amber-200 inline-flex items-center gap-1.5 self-start sm:self-center">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Status: HOLD / KEEP STOCK
              </span>
            </div>

            {/* Reseller Tier Dynamic Status Banner */}
            {parsedItems.length > 0 && (
              <div className="space-y-2">
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-300 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex flex-col items-center justify-center font-bold shrink-0 shadow-2xs">
                      <span className="text-xs leading-none">{resellerEligibleQty}</span>
                      <span className="text-[9px] uppercase tracking-tighter">PCS</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold flex items-center gap-1.5 text-emerald-900">
                        <Tag className="w-4 h-4 text-emerald-600" /> HARGA RESELLER (BABY TRYSPAN): {activeResellerTier.label}
                      </p>
                      <p className="text-[11px] text-emerald-700">
                        Total BABY TRYSPAN: <strong>{resellerEligibleQty} pcs</strong> $\rightarrow$ Harga Satuan <strong>{formatRupiah(activeResellerTier.price)}</strong> / pcs.
                        {nonResellerQty > 0 && (
                          <span className="ml-1 text-slate-600 font-medium">
                            (Ada {nonResellerQty} pcs produk Non-Reseller / PARIS JAPAN dengan harga normal).
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {totalSavings > 0 && (
                    <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0 self-start sm:self-center shadow-2xs">
                      Hemat Reseller {formatRupiah(totalSavings)}
                    </span>
                  )}
                </div>

                {nextResellerTier && resellerEligibleQty > 0 && (
                  <p className="text-[11px] text-slate-500 italic px-1">
                    💡 Tambah <strong>{nextResellerTier.diffQty} pcs BABY TRYSPAN</strong> lagi untuk naik ke harga tier berikutnya ({formatRupiah(nextResellerTier.nextPrice)} / pcs).
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Customer Information Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Customer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: KAK DELLA"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor WhatsApp Customer (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 08123456789"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Table of Parsed Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Rincian Produk Dipesan ({parsedItems.length} Item • {totalQty} PCS)
                </span>
                <button
                  type="button"
                  onClick={handleAddNewItem}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Item Manual
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                {parsedItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    Belum ada item pesanan. Silakan tempel teks WA di sebelah kiri dan klik "Proses & Parse".
                  </div>
                ) : (
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                      <tr>
                        <th className="py-3 px-3">Produk & SKU</th>
                        <th className="py-3 px-3 text-center">Tipe Diskon</th>
                        <th className="py-3 px-3 text-center">Stok Siap</th>
                        <th className="py-3 px-3 text-right">Harga Satuan (Rp)</th>
                        <th className="py-3 px-3 text-center">Jumlah</th>
                        <th className="py-3 px-3 text-right">Subtotal</th>
                        <th className="py-3 px-2 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedItems.map((item) => {
                        const isStockLow = item.quantity > item.availableStock;
                        const isReseller = item.isResellerEligible;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            {/* Product Select / Info */}
                            <td className="py-3 px-3 min-w-[200px]">
                              {item.isMatched ? (
                                <div>
                                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono font-bold">
                                      {item.productSku}
                                    </span>
                                    <span>{item.productName}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] mt-0.5">
                                    <span className="text-slate-400">
                                      Harga Ecer: {formatRupiah(item.sellingPrice)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Teks: "{item.rawText}"
                                  </div>
                                  <select
                                    onChange={(e) => handleSelectProduct(item.id, e.target.value)}
                                    defaultValue=""
                                    className="w-full text-xs p-1.5 rounded-lg border border-amber-300 bg-amber-50/50 text-slate-700"
                                  >
                                    <option value="" disabled>
                                      -- Pilih produk yang sesuai --
                                    </option>
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.sku} - {p.name} {p.motif ? `(${p.motif})` : ''} - Ecer: Rp {p.sellingPrice.toLocaleString('id-ID')} | Stok: {p.availableStock}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>

                            {/* Reseller vs Non-Reseller Status Badge */}
                            <td className="py-3 px-3 text-center">
                              {isReseller ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  <Tag className="w-3 h-3 text-rose-600" /> Reseller Tier
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  📦 Harga Normal
                                </span>
                              )}
                            </td>

                            {/* Stok Available */}
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`px-2 py-1 rounded-md text-xs font-bold border ${
                                  item.availableStock >= item.quantity
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {item.availableStock} pcs
                              </span>
                              {isStockLow && (
                                <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                  Kurang {item.quantity - item.availableStock}
                                </p>
                              )}
                            </td>

                            {/* Harga Satuan */}
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isReseller && item.price < item.sellingPrice && (
                                  <span className="line-through text-slate-400 text-[10px]">
                                    {formatRupiah(item.sellingPrice)}
                                  </span>
                                )}
                                <input
                                  type="number"
                                  min="0"
                                  value={item.price}
                                  onChange={(e) => handlePriceChange(item.id, parseInt(e.target.value, 10) || 0)}
                                  className={`w-24 text-right px-2 py-1 rounded-lg border text-xs font-semibold ${
                                    isReseller && item.price < item.sellingPrice
                                      ? 'border-emerald-300 bg-emerald-50/60 text-emerald-800'
                                      : 'border-slate-200'
                                  }`}
                                />
                              </div>
                            </td>

                            {/* Qty with +/- buttons */}
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                                >
                                  -
                                </button>
                                <span className="px-3 py-1 font-bold text-xs text-slate-800">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            {/* Subtotal */}
                            <td className="py-3 px-3 text-right font-bold text-slate-900">
                              {formatRupiah(item.price * item.quantity)}
                            </td>

                            {/* Delete */}
                            <td className="py-3 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Total Summary Footer */}
            {parsedItems.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    Total Item: <strong>{parsedItems.length} SKU</strong> | Total Keseluruhan:{' '}
                    <strong>{totalQty} pcs</strong>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    • <strong>BABY TRYSPAN (Reseller):</strong> {resellerEligibleQty} pcs (@ {formatRupiah(activeResellerTier.price)})
                    {nonResellerQty > 0 && ` • PARIS JAPAN / Normal: ${nonResellerQty} pcs`}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">Total Tagihan</span>
                    <span className="text-xl font-bold text-slate-900">{formatRupiah(totalAmount)}</span>
                  </div>

                  <button
                    type="button"
                    disabled={submitting || parsedItems.length === 0}
                    onClick={handleSaveOrder}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Simpan Order (Keep Stock)
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Modal if order successful */}
      {successOrder && (
        <InvoiceModal
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          order={{
            id: successOrder.orderId,
            orderNumber: successOrder.orderNumber,
            customerName: successOrder.customerName,
            customerPhone: successOrder.customerPhone || null,
            status: 'HOLD',
            totalAmount: successOrder.totalAmount,
            notes: null,
            createdAt: successOrder.createdAt,
            items: successOrder.items.map((it, i) => ({
              id: `item-${i}`,
              productSku: it.productSku,
              productName: it.productName,
              price: it.price,
              quantity: it.quantity,
              subtotal: it.subtotal,
            })),
          }}
        />
      )}
    </div>
  );
}
