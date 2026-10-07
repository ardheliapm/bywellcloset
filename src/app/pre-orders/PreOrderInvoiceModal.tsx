'use client';

import React, { useState } from 'react';
import {
  X,
  FileText,
  Copy,
  Check,
  Send,
  Truck,
  Printer,
  Building,
  CheckCircle2,
  Clock,
  Layers,
  ShoppingBag,
} from 'lucide-react';
import { PreOrderRecord } from './actions';

interface PreOrderInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  preOrder: PreOrderRecord | null;
}

export default function PreOrderInvoiceModal({
  isOpen,
  onClose,
  preOrder,
}: PreOrderInvoiceModalProps) {
  const [activeTab, setActiveTab] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [copied, setCopied] = useState(false);

  // Partial shipment selection: item.id -> qtyToInclude
  const [selectedItemQuantities, setSelectedItemQuantities] = useState<Record<string, number>>({});

  // Initialize selection when preOrder changes
  React.useEffect(() => {
    if (preOrder) {
      const initial: Record<string, number> = {};
      preOrder.items.forEach((it) => {
        const readyQty = it.quantityFulfilled - it.quantityShipped;
        initial[it.id] = Math.max(0, readyQty);
      });
      setSelectedItemQuantities(initial);
      const hasReady = Object.values(initial).some((q) => q > 0);
      setActiveTab(hasReady ? 'PARTIAL' : 'FULL');
    }
  }, [preOrder]);

  if (!isOpen || !preOrder) return null;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleQtyChange = (itemId: string, qty: number, maxQty: number) => {
    setSelectedItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Math.min(qty, maxQty)),
    }));
  };

  const dateFormatted = new Date(preOrder.createdAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Calculate totals based on activeTab
  const isPartial = activeTab === 'PARTIAL';
  const partialItemsToShip = preOrder.items.filter((it) => (selectedItemQuantities[it.id] || 0) > 0);
  const partialRemainingItems = preOrder.items.filter((it) => {
    const shipQty = selectedItemQuantities[it.id] || 0;
    return it.quantityOrdered - (it.quantityShipped + shipQty) > 0;
  });

  let currentTotalNominal = 0;
  let currentTotalPcs = 0;

  if (isPartial) {
    partialItemsToShip.forEach((it) => {
      const qty = selectedItemQuantities[it.id] || 0;
      currentTotalNominal += it.price * qty;
      currentTotalPcs += qty;
    });
  } else {
    preOrder.items.forEach((it) => {
      currentTotalNominal += it.price * it.quantityOrdered;
      currentTotalPcs += it.quantityOrdered;
    });
  }

  // Generate WhatsApp Invoice Text
  const generateWhatsAppText = () => {
    let itemsText = '';

    if (isPartial) {
      itemsText += `📦 *BARANG READY DIKIRIM HARI INI:*\n`;
      if (partialItemsToShip.length === 0) {
        itemsText += `_(Belum ada item yang dipilih untuk dikirim)_\n`;
      } else {
        partialItemsToShip.forEach((it, idx) => {
          const qty = selectedItemQuantities[it.id] || 0;
          const subtotal = it.price * qty;
          itemsText += `${idx + 1}. *${it.productName}* (${it.productSku})\n   ${qty} pcs x ${formatRupiah(it.price)} = *${formatRupiah(subtotal)}*\n`;
        });
      }

      if (partialRemainingItems.length > 0) {
        itemsText += `\n⏳ *SISA BARANG PO (MENUNGGU KEDATANGAN):*\n`;
        partialRemainingItems.forEach((it) => {
          const shipQty = selectedItemQuantities[it.id] || 0;
          const sisaPcs = it.quantityOrdered - (it.quantityShipped + shipQty);
          itemsText += `• ${it.productName} (${it.productSku}): *${sisaPcs} pcs*\n`;
        });
      }
    } else {
      // Full PO Invoice
      preOrder.items.forEach((it, idx) => {
        const subtotal = it.price * it.quantityOrdered;
        const statusItem =
          it.quantityShipped >= it.quantityOrdered
            ? ' (✅ Sudah Dikirim)'
            : it.quantityFulfilled >= it.quantityOrdered
            ? ' (📦 Ready Siap Kirim)'
            : it.quantityFulfilled > 0
            ? ` (⏳ Ready ${it.quantityFulfilled}/${it.quantityOrdered} pcs)`
            : ' (⏳ Menunggu Kedatangan)';

        itemsText += `${idx + 1}. *${it.productName}* (${it.productSku})${statusItem}\n   ${it.quantityOrdered} pcs x ${formatRupiah(it.price)} = *${formatRupiah(subtotal)}*\n`;
      });
    }

    return (
`*INVOICE PRE-ORDER ${isPartial ? '(PENGIRIMAN PARSIAL) ' : ''}- BYWELL CLOSET* 🌸
==============================
No. PO: *#${preOrder.poNumber}*
Tanggal: ${dateFormatted}
Kepada: *${preOrder.customerName}*
${preOrder.customerPhone ? `No. WhatsApp: ${preOrder.customerPhone}\n` : ''}
*Rincian Pesanan:*
${itemsText}------------------------------
*Total Kuantitas: ${currentTotalPcs} pcs*
*Total Pembayaran: ${formatRupiah(currentTotalNominal)}*

*Pembayaran dapat ditransfer melalui:*
🏦 *Bank Jago*: 1057 0424 9859
a/n Ardhe Lia Putri Maharani
💜 *ShopeePay*: 081230543855
a/n Ardhe Lia Putri Maharani

Mohon kirimkan bukti transfer setelah pembayaran ya Kak.
Pesanan akan segera kami proses dan kirimkan. Terima kasih! 🙏✨`
    );
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateWhatsAppText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    let cleanPhone = preOrder.customerPhone ? preOrder.customerPhone.replace(/[^0-9]/g, '') : '';
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }
    const textEncoded = encodeURIComponent(generateWhatsAppText());
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${textEncoded}`
      : `https://wa.me/?text=${textEncoded}`;

    window.open(waUrl, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Top Bar (Not printed) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Invoice PO #{preOrder.poNumber}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500 text-white">
                  PRE-ORDER
                </span>
              </div>
              <p className="text-slate-400 text-xs">Customer: {preOrder.customerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin!' : 'Salin Teks WA'}
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" /> Buka WA
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cetak Invoice"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selection (Not printed) */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('FULL')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all border-t border-x cursor-pointer ${
              activeTab === 'FULL'
                ? 'bg-white text-indigo-700 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            📋 Invoice Lengkap (Seluruh PO)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PARTIAL')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all border-t border-x cursor-pointer ${
              activeTab === 'PARTIAL'
                ? 'bg-white text-indigo-700 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            📦 Invoice Parsial (Barang Ready Dikirim)
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 print:p-0 print:space-y-4 text-slate-800">
          {/* Partial Quantity Adjustment Box (If in Partial Mode) */}
          {activeTab === 'PARTIAL' && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3 print:hidden">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-indigo-600" /> Atur Jumlah Barang Ready yang Ditagihkan/Dikirim:
                </h4>
                <span className="text-[11px] text-indigo-700 font-semibold">Harga Tetap Harga Reseller Total</span>
              </div>

              <div className="space-y-2">
                {preOrder.items.map((it) => {
                  const readyQty = it.quantityFulfilled - it.quantityShipped;
                  const currentSendQty = selectedItemQuantities[it.id] || 0;

                  return (
                    <div
                      key={it.id}
                      className="p-2.5 bg-white rounded-lg border border-indigo-100 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="truncate flex-1">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded mr-1.5">
                          {it.productSku}
                        </span>
                        <span className="font-semibold text-slate-800">{it.productName}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Total PO: {it.quantityOrdered} pcs • Ready: <strong>{readyQty} pcs</strong> • Terkirim: {it.quantityShipped} pcs
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-500">Kirim:</span>
                        <input
                          type="number"
                          min="0"
                          max={readyQty}
                          disabled={readyQty <= 0}
                          value={currentSendQty}
                          onChange={(e) =>
                            handleQtyChange(it.id, parseInt(e.target.value, 10) || 0, readyQty)
                          }
                          className="w-14 text-center px-2 py-1 rounded border border-slate-200 font-bold text-xs focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
                        />
                        <span className="text-slate-400 text-[11px]">/ {readyQty} pcs</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Printable Invoice Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-600" /> BYWELL CLOSET
              </h1>
              <p className="text-xs text-slate-500 mt-1">Premium Hijab & Modest Fashion</p>
              <p className="text-xs text-indigo-600 font-medium">Pre-Order WhatsApp Invoice</p>
            </div>

            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">
                Pre-Order Invoice
              </span>
              <span className="font-mono text-base font-bold text-indigo-950 block mt-0.5">
                #{preOrder.poNumber}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">{dateFormatted}</span>
              <div className="mt-2">
                {preOrder.status === 'WAITING_STOCK' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Menunggu Kedatangan Barang
                  </span>
                )}
                {(preOrder.status === 'PARTIAL_READY' || preOrder.status === 'PARTIAL_SHIPPED') && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
                    Sebagian Barang Ready
                  </span>
                )}
                {preOrder.status === 'READY' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Siap Dikirim Lengkap
                  </span>
                )}
                {preOrder.status === 'SHIPPED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    SUDAH DIKIRIM
                  </span>
                )}
                {preOrder.status === 'CANCELLED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    DIBATALKAN
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Customer Meta */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-slate-400 uppercase font-semibold">Ditagihkan Kepada:</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{preOrder.customerName}</p>
              {preOrder.customerPhone && (
                <p className="text-slate-600 mt-0.5">WhatsApp: {preOrder.customerPhone}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-slate-400 uppercase font-semibold">Jenis Pesanan:</p>
              <p className="text-sm font-bold text-indigo-700 mt-0.5">
                {isPartial ? 'Pengiriman Parsial (Barang Ready)' : 'Pre-Order Lengkap'}
              </p>
              <p className="text-slate-500 mt-0.5">Diskon Tier Reseller Diterapkan</p>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">Produk & SKU</th>
                  <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                  <th className="py-2.5 px-3 text-center">Jumlah</th>
                  <th className="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(isPartial ? partialItemsToShip : preOrder.items).map((item, idx) => {
                  const qty = isPartial ? selectedItemQuantities[item.id] || 0 : item.quantityOrdered;
                  const subtotal = item.price * qty;

                  return (
                    <tr key={item.id || idx}>
                      <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{item.productName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{item.productSku}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatRupiah(item.price)}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                        {qty} pcs
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {formatRupiah(subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total Calculation */}
          <div className="flex justify-end pt-1">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total Kuantitas:</span>
                <span className="font-bold">{currentTotalPcs} pcs</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Produk:</span>
                <span>{formatRupiah(currentTotalNominal)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                <span>Total Tagihan:</span>
                <span className="text-indigo-700 text-base">{formatRupiah(currentTotalNominal)}</span>
              </div>
            </div>
          </div>

          {/* Payment Instructions */}
          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Building className="w-4 h-4 text-emerald-700" /> Informasi Rekening Pembayaran:
            </p>
            <p>• <strong>Bank Jago:</strong> 1057 0424 9859 a/n Ardhe Lia Putri Maharani</p>
            <p>• <strong>ShopeePay:</strong> 081230543855 a/n Ardhe Lia Putri Maharani</p>
            <p className="text-emerald-700 pt-1">
              *Harap sertakan nomor PO <strong>#{preOrder.poNumber}</strong> saat transfer atau konfirmasi bukti pembayaran via WhatsApp.
            </p>
          </div>

          {/* WhatsApp Raw Preview (Not printed) */}
          <div className="space-y-1.5 pt-2 print:hidden">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Teks Siap Kirim WhatsApp Customer:
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin!' : 'Salin Teks'}
              </button>
            </div>

            <textarea
              readOnly
              rows={8}
              value={generateWhatsAppText()}
              className="w-full p-3 bg-slate-950 text-slate-200 font-mono text-xs rounded-xl border border-slate-800 focus:outline-hidden select-all"
            />
          </div>
        </div>

        {/* Modal Footer (Not printed) */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Teks Berhasil Disalin' : 'Salin Format WA'}
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Send className="w-4 h-4" /> Buka WhatsApp Customer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

