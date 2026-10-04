'use client';

import React, { useState } from 'react';
import {
  X,
  FileText,
  Copy,
  Check,
  Share2,
  ExternalLink,
  Package,
  Layers,
  Sparkles,
  ShoppingBag,
  Send,
  Truck,
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
  const [activeTab, setActiveTab] = useState<'FULL' | 'PARTIAL'>('PARTIAL');
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
      // If none are ready, default to full
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

  // Generate WhatsApp Invoice Text
  const generateWhatsAppText = () => {
    const isPartial = activeTab === 'PARTIAL';
    const dateFormatted = new Date(preOrder.createdAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let itemsText = '';
    let totalNominal = 0;
    let totalPcs = 0;

    if (isPartial) {
      const itemsToShip = preOrder.items.filter((it) => (selectedItemQuantities[it.id] || 0) > 0);
      const remainingItems = preOrder.items.filter((it) => {
        const shipQty = selectedItemQuantities[it.id] || 0;
        return it.quantityOrdered - (it.quantityShipped + shipQty) > 0;
      });

      itemsText += `📦 *BARANG READY DIKIRIM HARI INI:*\n`;
      if (itemsToShip.length === 0) {
        itemsText += `_(Belum ada item yang dipilih untuk dikirim)_\n`;
      } else {
        itemsToShip.forEach((it, idx) => {
          const qty = selectedItemQuantities[it.id] || 0;
          const subtotal = it.price * qty;
          totalNominal += subtotal;
          totalPcs += qty;
          itemsText += `${idx + 1}. *${it.productSku}* - ${it.productName}\n   ${qty} pcs x ${formatRupiah(it.price)} = *${formatRupiah(subtotal)}*\n`;
        });
      }

      if (remainingItems.length > 0) {
        itemsText += `\n⏳ *SISA BARANG PRE-ORDER (MENUNGGU KEDATANGAN):*\n`;
        remainingItems.forEach((it) => {
          const shipQty = selectedItemQuantities[it.id] || 0;
          const sisaPcs = it.quantityOrdered - (it.quantityShipped + shipQty);
          itemsText += `• ${it.productSku} - ${it.productName}: *${sisaPcs} pcs* (Harga tetap ${formatRupiah(it.price)})\n`;
        });
      }
    } else {
      // Full PO Invoice
      preOrder.items.forEach((it, idx) => {
        const subtotal = it.price * it.quantityOrdered;
        totalNominal += subtotal;
        totalPcs += it.quantityOrdered;
        const statusItem =
          it.quantityShipped >= it.quantityOrdered
            ? ' (✅ Sudah Dikirim)'
            : it.quantityFulfilled >= it.quantityOrdered
            ? ' (📦 Ready Siap Kirim)'
            : it.quantityFulfilled > 0
            ? ` (⏳ Ready ${it.quantityFulfilled}/${it.quantityOrdered} pcs)`
            : ' (⏳ Menunggu Kedatangan)';

        itemsText += `${idx + 1}. *${it.productSku}* - ${it.productName}${statusItem}\n   ${it.quantityOrdered} pcs x ${formatRupiah(it.price)} = *${formatRupiah(subtotal)}*\n`;
      });
    }

    return `*INVOICE PRE-ORDER ${isPartial ? '(PENGIRIMAN PARSIAL)' : ''} BYWELL CLOSET*
────────────────────────
*No. PO:* #${preOrder.poNumber}
*Tanggal:* ${dateFormatted}
*Customer:* ${preOrder.customerName}
${preOrder.customerPhone ? `*No. WA:* ${preOrder.customerPhone}\n` : ''}────────────────────────
*RINCIAN PESANAN:*
${itemsText}
────────────────────────
*TOTAL KUANTITAS:* ${totalPcs} pcs
*TOTAL TAGIHAN:* *${formatRupiah(totalNominal)}*
────────────────────────
_Catatan: Harga satuan dihitung dengan diskon reseller total seluruh pesanan PO._

Terima kasih atas pesanan Pre-Order Anda di *Bywell Closet*! 🙏✨`;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateWhatsAppText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    if (!preOrder.customerPhone) return;
    const cleanPhone = preOrder.customerPhone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    const textEncoded = encodeURIComponent(generateWhatsAppText());
    window.open(`https://wa.me/${formattedPhone}?text=${textEncoded}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Invoice & WhatsApp PO #{preOrder.poNumber}</h2>
              <p className="text-slate-400 text-xs">
                Pilihan invoice lengkap atau cetak surat jalan / invoice khusus barang yang ready dikirim duluan
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
            onClick={() => setActiveTab('PARTIAL')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all border-t border-x ${
              activeTab === 'PARTIAL'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            📦 Invoice Parsial (Barang Ready Dikirim Sekarang)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('FULL')}
            className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all border-t border-x ${
              activeTab === 'FULL'
                ? 'bg-white text-indigo-600 border-slate-200 shadow-2xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            📋 Invoice Lengkap (Seluruh PO)
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {activeTab === 'PARTIAL' && (
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-indigo-600" /> Atur Jumlah Barang Ready yang Dikirim:
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

          {/* WhatsApp Text Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Teks Siap Kirim WhatsApp:
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Salin Teks
                  </>
                )}
              </button>
            </div>

            <textarea
              readOnly
              rows={10}
              value={generateWhatsAppText()}
              className="w-full p-3.5 bg-slate-950 text-slate-200 font-mono text-xs rounded-xl border border-slate-800 focus:outline-none select-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
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
              {copied ? 'Teks Berhasil Disalin' : 'Salin Invoice'}
            </button>

            {preOrder.customerPhone && (
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Send className="w-4 h-4" /> Buka WhatsApp Customer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
