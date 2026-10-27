'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Plus,
  Trash2,
  FileText,
  Calendar,
  Building2,
  Package,
  ClipboardPaste,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Truck,
  Layers,
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { createInboundShipment } from './inboundActions';
import SearchableProductSelect from '@/components/SearchableProductSelect';
import { parseInboundText } from '@/lib/inboundTextParser';
import { extractCode, matchProduct, suggestProducts } from '@/lib/productMatching';

const CATEGORY_WORDS = /\b(paris|jepang|japan|bella|tryspan)\b/i;

interface CreateInboundModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  onCreated?: () => void;
}

interface InboundFormItem {
  id: string;
  productId: string | null;
  productSku: string;
  productName: string;
  expectedQty: number;
  /** false = jumlah tidak tertulis di teks yang ditempel, dipakai nilai bawaan 1 */
  qtyGiven?: boolean;
  /** Pengguna menekan "Buat produk baru" untuk kode yang belum ada di Master */
  createNew?: boolean;
}

export default function CreateInboundModal({
  isOpen,
  onClose,
  products = [],
  onCreated,
}: CreateInboundModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab State: 'paste' or 'manual'
  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');
  const [invoiceCategory, setInvoiceCategory] = useState<string>('BABY TRYSPAN'); // 'BABY TRYSPAN' | 'PARIS JAPAN' | 'BELLA SQUARE' | 'MIX'
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('Konveksi Bandung');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');

  // Paste text state
  const [rawText, setRawText] = useState('');

  const [items, setItems] = useState<InboundFormItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto generate invoice number suggestion
  useEffect(() => {
    if (isOpen) {
      setActiveTab('paste');
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const timeSuffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-${Math.floor(10 + Math.random() * 90)}`;
      const autoNumber = `SJ-${year}${month}${day}-${timeSuffix}`;
      setInvoiceNumber(autoNumber);

      // Set default expected date to 2 days later
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 2);
      setExpectedDate(nextDate.toISOString().slice(0, 10));

      setError(null);
      setSuccessMsg(null);
      setNotes('');

      // Mulai dari kosong setiap kali dibuka, supaya data contoh atau sisa catatan sebelumnya
      // tidak ikut tersimpan sebagai barang kiriman.
      setRawText('');
      setItems([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalExpectedPcs = items.reduce((acc, it) => acc + (Number(it.expectedQty) || 0), 0);
  const unresolvedCount = items.filter(
    (it) => (it.productSku?.trim() || it.productName?.trim()) && !it.productId && !it.createNew
  ).length;

  // Susun teks menjadi nama lengkap untuk pencocokan, mis. kategori "PARIS JAPAN" + "12-2"
  const buildRawName = (itemName: string, category: string): string => {
    if (category === 'MIX' || CATEGORY_WORDS.test(itemName)) return itemName;
    return `${category} - ${itemName}`;
  };

  const displayNameFor = (prod: ProductItem) =>
    `${prod.name} - ${prod.motif ? prod.motif : prod.sku}`;

  // Cocokkan teks dengan produk di Master. Kode dicocokkan PERSIS; salah ketik hanya jadi saran.
  const resolveByText = (itemName: string, category: string) => {
    const rawName = buildRawName(itemName, category);
    const product = matchProduct(products, '', rawName)?.product ?? null;
    return { rawName, product, code: extractCode('', rawName) };
  };

  // Parser untuk Copas WhatsApp / Teks / Surat Jalan
  const parseTextToItems = (text: string, currentCategory: string = invoiceCategory) => {
    const parsed = parseInboundText(text);
    if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
    if (parsed.supplierName) setSupplierName(parsed.supplierName);

    const next: InboundFormItem[] = parsed.items.map((line, idx) => {
      const { rawName, product, code } = resolveByText(line.name, currentCategory);
      return {
        id: `inbound-item-${Date.now()}-${idx}`,
        productId: product ? product.id : null,
        productSku: product ? product.sku : code,
        productName: product ? displayNameFor(product) : rawName,
        expectedQty: line.qty,
        qtyGiven: line.qtyGiven,
        createNew: false,
      };
    });

    if (next.length > 0) {
      setItems(next);
    }
  };

  const handlePickSuggestion = (index: number, prod: ProductItem) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: prod.id,
      productSku: prod.sku,
      productName: displayNameFor(prod),
      createNew: false,
    };
    setItems(updated);
  };

  const handleCreateNew = (index: number, value: boolean) => {
    const updated = [...items];
    updated[index] = { ...updated[index], productId: null, createNew: value };
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
        expectedQty: 10,
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof InboundFormItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'productName') {
      // Teks diubah: cocokkan ulang, dan batalkan konfirmasi "buat produk baru" sebelumnya
      const { product, code } = resolveByText(String(value), invoiceCategory);
      updated[index].productId = product ? product.id : null;
      updated[index].productSku = product ? product.sku : code;
      updated[index].createNew = false;
    }
    if (field === 'expectedQty') {
      updated[index].qtyGiven = true;
    }
    setItems(updated);
  };

  const handleSelectProduct = (index: number, prod: ProductItem) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: prod.id,
      productSku: prod.sku,
      productName: `${prod.name}${prod.motif ? ` - ${prod.motif}` : ''}`,
      createNew: false,
    };
    setItems(updated);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!invoiceNumber.trim()) {
      setError('Nomor Surat Jalan / Invoice wajib diisi.');
      return;
    }

    const validItems = items.filter(
      (it) => (it.productSku?.trim() || it.productName?.trim()) && Number(it.expectedQty) > 0
    );

    if (validItems.length === 0) {
      setError('Minimal harus ada 1 barang dalam Surat Jalan.');
      return;
    }

    const unresolved = validItems.filter((it) => !it.productId && !it.createNew);
    if (unresolved.length > 0) {
      setError(
        `Masih ada ${unresolved.length} kode yang belum jelas (ditandai kuning). Pilih produk yang sesuai atau tekan "Buat produk baru" untuk tiap kode.`
      );
      return;
    }

    setLoading(true);

    try {
      const res = await createInboundShipment({
        invoiceNumber: invoiceNumber.trim(),
        supplierName: supplierName.trim() || 'Konveksi Bandung',
        expectedDate: expectedDate || null,
        attachmentUrl: null,
        attachmentType: null,
        notes: notes.trim() || null,
        items: validItems.map((it) => ({
          productId: it.productId,
          productSku: it.productSku,
          productName: it.productName,
          expectedQty: it.expectedQty,
          createNew: !!it.createNew,
        })),
      });

      if (res.success) {
        setSuccessMsg(`Surat Jalan #${res.invoiceNumber} berhasil dicatat! Status: Dalam Pengiriman.`);
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
        setError(res.error || 'Gagal menyimpan Surat Jalan.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Terjadi kesalahan sistem saat menyimpan.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Catat Surat Jalan / Invoice Kiriman Gudang</h2>
              <p className="text-slate-400 text-xs">
                Catat barang yang sedang dalam perjalanan dari konveksi (stok bertambah saat barang fisik diverifikasi tiba)
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-t border-x flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'paste'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" /> 📋 Paste Chat / Copas Teks Kode
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-t border-x flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
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
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Invoice Info Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" /> Kategori Kain
              </label>
              <select
                value={invoiceCategory}
                onChange={(e) => {
                  const newCat = e.target.value;
                  setInvoiceCategory(newCat);
                  parseTextToItems(rawText, newCat);
                }}
                className="w-full px-3 py-1.5 bg-white rounded-lg border border-indigo-200 text-xs font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="BABY TRYSPAN">BABY TRYSPAN</option>
                <option value="PARIS JAPAN">PARIS JAPAN / JEPANG</option>
                <option value="BELLA SQUARE">BELLA SQUARE</option>
                <option value="MIX">CAMPURAN (MIX)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-indigo-600" /> No. Surat Jalan</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.2 rounded">✨ Otomatis</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Otomatis dibuat sistem"
                required
                className="w-full px-3 py-1.5 bg-slate-50 hover:bg-white focus:bg-white rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" /> Pengirim / Konveksi
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Contoh: Konveksi Bandung"
                className="w-full px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Estimasi Sampai
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* TAB: PASTE TEXT */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-indigo-100 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ClipboardPaste className="w-4 h-4 text-indigo-600" /> Tempel Daftar Kode & Kuantitas Surat Jalan:
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Format: Kode(Qty) atau Kode - Qty
                  </span>
                </div>

                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                  }}
                  placeholder="Contoh format:&#10;SJ-202610-001&#10;Konveksi Bandung&#10;88(50)&#10;12-2(30)&#10;SPARK FLOWER(40)&#10;BW83(20)"
                  className="w-full p-3 bg-white rounded-xl border border-slate-200 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                />

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] text-indigo-700 font-medium">
                    ✨ Klik tombol di samping untuk memproses kode teks di atas
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      parseTextToItems(rawText, invoiceCategory);
                      setSuccessMsg('Daftar barang berhasil diproses!');
                      setTimeout(() => setSuccessMsg(null), 2500);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Proses Daftar Kode
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List of Items Preview / Editable Table (ALWAYS VISIBLE & EDITABLE) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-indigo-600" /> Rincian Barang Kiriman ({items.length} SKU • {totalExpectedPcs} Pcs){unresolvedCount > 0 ? ` • ${unresolvedCount} belum jelas` : ''}
              </h4>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Baris Manual
              </button>
            </div>

            <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden max-h-[300px] overflow-y-auto">
              {items.map((it, idx) => (
                <div key={it.id || idx} className="p-3 space-y-1.5 text-xs hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-mono font-bold text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 shrink-0">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={it.productName}
                        onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                        placeholder="Nama Motif / SKU"
                        className="font-semibold text-slate-800 bg-transparent hover:bg-slate-50 focus:bg-white px-2 py-1 rounded border border-transparent focus:border-slate-300 w-full"
                      />
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 text-[11px]">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          value={it.expectedQty}
                          onChange={(e) => handleItemChange(idx, 'expectedQty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-16 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-center font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-slate-500 font-medium">pcs</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        disabled={items.length <= 1}
                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors disabled:opacity-20 cursor-pointer"
                        title="Hapus baris"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Status pencocokan: terhubung / akan dibuat baru / belum jelas */}
                  {it.productId ? (
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 pl-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Terhubung ke produk: {it.productSku}
                    </div>
                  ) : it.createNew ? (
                    <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200 text-xs text-indigo-900 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        Produk baru akan dibuat dengan kode <strong>{it.productSku}</strong> saat disimpan.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCreateNew(idx, false)}
                        className="px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[10px] cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="p-2 bg-amber-50 rounded-lg border border-amber-300 text-xs text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          Kode <strong>{it.productSku || '?'}</strong> belum ada di Master Produk.
                        </span>
                      </div>
                      {(() => {
                        const suggestions = suggestProducts(products, '', it.productName);
                        return suggestions.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 pl-5">
                            <span className="text-amber-800">Salah ketik? Mirip dengan:</span>
                            {suggestions.map((sg) => (
                              <button
                                key={sg.product.id}
                                type="button"
                                onClick={() => handlePickSuggestion(idx, sg.product as ProductItem)}
                                title={sg.reason}
                                className="px-2 py-1 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] cursor-pointer shadow-2xs"
                              >
                                Pakai {sg.product.sku}
                                {sg.product.motif ? ` (${sg.product.motif})` : ''}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="pl-5 text-amber-800">
                            Tidak ada produk yang mirip di Master. Cek ejaan, atau buat sebagai produk baru.
                          </div>
                        );
                      })()}
                      <div className="pl-5">
                        <button
                          type="button"
                          onClick={() => handleCreateNew(idx, true)}
                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] cursor-pointer shadow-2xs"
                        >
                          + Buat produk baru ({it.productSku})
                        </button>
                      </div>
                    </div>
                  )}

                  {it.qtyGiven === false && (
                    <div className="text-[11px] text-slate-500 pl-1">
                      Jumlah tidak tertulis di teks, dipakai 1 pcs. Cek dan ubah kalau perlu.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Pengiriman (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Kiriman berisi pesanan PO customer batch 1 + restok gudang"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs">
            <span className="text-slate-500">Total Barang Dikirim: </span>
            <strong className="text-slate-900 font-mono text-sm">{totalExpectedPcs} pcs</strong>
          </div>

          <div className="flex items-center gap-2">
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
                  <Truck className="w-4 h-4" /> Simpan Surat Jalan ({totalExpectedPcs} Pcs)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
