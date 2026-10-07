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
} from 'lucide-react';
import { ProductItem } from '../products/actions';
import { createInboundShipment } from './inboundActions';
import SearchableProductSelect from '@/components/SearchableProductSelect';

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
}

export default function CreateInboundModal({
  isOpen,
  onClose,
  products = [],
  onCreated,
}: CreateInboundModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('Konveksi Bandung');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');

  // Paste text state
  const [rawText, setRawText] = useState(
`SJ-202610-001
Konveksi Bandung
152(50)
123(30)
SPARK FLOWER(40)
BW83(20)`
  );

  const [items, setItems] = useState<InboundFormItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto generate invoice number suggestion
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      setInvoiceNumber(`SJ-${dateStr}-${randomSuffix}`);

      // Set default expected date to 2 days later (e.g. Wednesday to Friday)
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 2);
      setExpectedDate(nextDate.toISOString().slice(0, 10));

      setError(null);
      setSuccessMsg(null);
      setNotes('');

      // Auto-parse default text
      parseTextToItems(rawText);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalExpectedPcs = items.reduce((acc, it) => acc + (Number(it.expectedQty) || 0), 0);

  // Product Matching Helper
  const findProductMatch = (query: string): ProductItem | null => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    const cleanQ = q.replace(/[^a-z0-9]/g, '');

    const exactSku = products.find(
      (p) =>
        p.sku.toLowerCase() === q ||
        (cleanQ.length >= 2 && p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQ)
    );
    if (exactSku) return exactSku;

    const exactMotif = products.find(
      (p) => p.motif && p.motif.toLowerCase().trim() === q
    );
    if (exactMotif) return exactMotif;

    const exactName = products.find((p) => p.name.toLowerCase().trim() === q);
    if (exactName) return exactName;

    return null;
  };

  const parseTextToItems = (text: string) => {
    if (!text.trim()) return;
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    let startIndex = 0;
    // Check if line 0 looks like an invoice number
    if (lines[0] && (lines[0].toUpperCase().startsWith('SJ') || lines[0].toUpperCase().startsWith('INV') || lines[0].includes('-'))) {
      setInvoiceNumber(lines[0].replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim());
      startIndex = 1;
    }

    // Check if line 1 looks like supplier name
    if (lines[startIndex] && !/\(\d+\)|\s+[-xX:]\s*\d+|\s+\d+\s*(?:pcs|pc)?$/i.test(lines[startIndex])) {
      setSupplierName(lines[startIndex].replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim());
      startIndex += 1;
    }

    const itemLines = lines.slice(startIndex);
    const parsed: InboundFormItem[] = [];

    itemLines.forEach((line, idx) => {
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

      const prod = findProductMatch(itemName);
      parsed.push({
        id: `inbound-item-${Date.now()}-${idx}`,
        productId: prod ? prod.id : null,
        productSku: prod ? prod.sku : itemName.toUpperCase(),
        productName: prod ? `${prod.name}${prod.motif ? ` - ${prod.motif}` : ''}` : itemName,
        expectedQty: qty,
      });
    });

    if (parsed.length > 0) {
      setItems(parsed);
    }
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
    setItems(updated);
  };

  const handleSelectProduct = (index: number, prod: ProductItem) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: prod.id,
      productSku: prod.sku,
      productName: `${prod.name}${prod.motif ? ` - ${prod.motif}` : ''}`,
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

    setLoading(true);

    try {
      const res = await createInboundShipment({
        invoiceNumber: invoiceNumber.trim(),
        supplierName: supplierName.trim() || 'Konveksi / Gudang',
        expectedDate: expectedDate || null,
        notes: notes.trim() || null,
        items: validItems.map((it) => ({
          productId: it.productId,
          productSku: it.productSku,
          productName: it.productName,
          expectedQty: it.expectedQty,
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
                Catat barang yang sedang dalam perjalanan dari konveksi (stok belum bertambah sampai barang fisik tiba)
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
            <ClipboardPaste className="w-3.5 h-3.5" /> 📋 Tempel Teks Surat Jalan / WA
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
            <Plus className="w-3.5 h-3.5" /> ✍️ Input Satu Per Satu
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> No. Surat Jalan / Invoice <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Contoh: SJ-202610-01"
                required
                className="w-full px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
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

          {/* TAB 1: PASTE */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-indigo-100 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ClipboardPaste className="w-4 h-4 text-indigo-600" /> Tempel Daftar Barang dari Surat Jalan / WA:
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Format: Kode Motif(Qty) atau SKU - Qty
                  </span>
                </div>

                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                  }}
                  placeholder="Contoh format:&#10;SJ-202610-001&#10;Konveksi Bandung&#10;152(50)&#10;123(30)&#10;SPARK FLOWER(40)"
                  className="w-full p-3 bg-white rounded-xl border border-slate-200 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                />

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] text-indigo-700 font-medium">
                    ✨ Klik proses untuk memperbarui daftar barang di bawah
                  </span>
                  <button
                    type="button"
                    onClick={() => parseTextToItems(rawText)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Proses Daftar Barang
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List of Items Preview / Editable Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-indigo-600" /> Rincian Barang Dikirim ({items.length} SKU • {totalExpectedPcs} Pcs)
              </h4>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Baris
              </button>
            </div>

            <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden">
              {items.map((it, idx) => (
                <div key={it.id || idx} className="p-3 flex items-center justify-between gap-3 text-xs">
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
                        className="w-16 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-center font-bold text-slate-900"
                      />
                      <span className="text-slate-500 font-medium">pcs</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      disabled={items.length <= 1}
                      className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors disabled:opacity-20 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
              placeholder="Contoh: Kiriman berisi pesanan PO customer batch 1 + lebihan 20 pcs"
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
