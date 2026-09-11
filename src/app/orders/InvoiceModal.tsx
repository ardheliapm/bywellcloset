'use client';

import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Copy, 
  Check, 
  Send, 
  FileText, 
  ShoppingBag, 
  CheckCircle2, 
  Clock, 
  Truck,
  Building
} from 'lucide-react';

export interface OrderItemDetail {
  id: string;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  status: string; // HOLD, PAID, SHIPPED, CANCELLED
  totalAmount: number;
  notes?: string | null;
  createdAt: Date | string;
  items: OrderItemDetail[];
}

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderDetail | null;
}

export default function InvoiceModal({ isOpen, onClose, order }: InvoiceModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  // Formatting Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const orderDate = new Date(order.createdAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Generate WhatsApp Message Text
  const generateWhatsAppMessage = () => {
    let itemsText = '';
    order.items.forEach((it, index) => {
      itemsText += `${index + 1}. *${it.productName}* (${it.productSku}) - ${it.quantity} pcs x ${formatRupiah(it.price)}\n`;
    });

    return (
`*INVOICE PEMESANAN - BYWELL CLOSET* 🌸
==============================
No. Order: *#${order.orderNumber}*
Tanggal: ${orderDate}
Kepada: *${order.customerName}*

*Rincian Pesanan:*
${itemsText}------------------------------
*Total Pembayaran: ${formatRupiah(order.totalAmount)}*

*Pembayaran dapat ditransfer melalui:*
🏦 *BCA*: 1234-567-890
a/n Bywell Closet
🏦 *Mandiri*: 9876-543-210
a/n Bywell Closet

Mohon kirimkan foto/bukti transfer setelah pembayaran ya Kak.
Pesanan akan segera kami proses dan kirimkan. Terima kasih! 🙏✨`
    );
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppMessage();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDirectWhatsApp = () => {
    const text = encodeURIComponent(generateWhatsAppMessage());
    let phoneClean = order.customerPhone ? order.customerPhone.replace(/[^0-9]/g, '') : '';

    if (phoneClean.startsWith('0')) {
      phoneClean = '62' + phoneClean.slice(1);
    }

    const waUrl = phoneClean
      ? `https://wa.me/${phoneClean}?text=${text}`
      : `https://wa.me/?text=${text}`;

    window.open(waUrl, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Top Bar (Not printed) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Invoice #{order.orderNumber}</h2>
              <p className="text-slate-400 text-xs">Customer: {order.customerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
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
              onClick={handleDirectWhatsApp}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> Buka WA
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Cetak Invoice"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Body */}
        <div className="p-8 overflow-y-auto space-y-6 print:p-0 print:space-y-4 text-slate-800">
          {/* Header Brand */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-600" /> BYWELL CLOSET
              </h1>
              <p className="text-xs text-slate-500 mt-1">Premium Hijab & Modest Fashion</p>
              <p className="text-xs text-slate-400">Order WhatsApp Management</p>
            </div>

            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">
                Official Invoice
              </span>
              <span className="font-mono text-base font-bold text-slate-900 block mt-0.5">
                #{order.orderNumber}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">{orderDate}</span>
              <div className="mt-2">
                {order.status === 'HOLD' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Menunggu Pembayaran (Keep Stock)
                  </span>
                )}
                {order.status === 'PAID' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    LUNAS (Sudah Bayar)
                  </span>
                )}
                {order.status === 'SHIPPED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    SUDAH DIKIRIM
                  </span>
                )}
                {order.status === 'CANCELLED' && (
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
              <p className="text-sm font-bold text-slate-800 mt-0.5">{order.customerName}</p>
              {order.customerPhone && (
                <p className="text-slate-600 mt-0.5">WhatsApp: {order.customerPhone}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-slate-400 uppercase font-semibold">Metode Transaksi:</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">Transfer Bank</p>
              <p className="text-slate-600 mt-0.5">Konfirmasi via WhatsApp</p>
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
                {order.items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-2.5 px-3 text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{item.productName}</div>
                      <div className="text-[11px] font-mono text-slate-400">{item.productSku}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatRupiah(item.price)}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                      {item.quantity} pcs
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {formatRupiah(item.subtotal || item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total Calculation */}
          <div className="flex justify-end pt-2">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Produk:</span>
                <span>{formatRupiah(order.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Biaya Layanan / Admin:</span>
                <span>Rp 0</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                <span>Total Tagihan:</span>
                <span className="text-rose-600 text-base">{formatRupiah(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Instructions */}
          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Building className="w-4 h-4 text-emerald-700" /> Informasi Rekening Pembayaran:
            </p>
            <p>• <strong>BCA:</strong> 1234-567-890 a/n Bywell Closet</p>
            <p>• <strong>Mandiri:</strong> 9876-543-210 a/n Bywell Closet</p>
            <p className="text-emerald-700 pt-1">
              *Harap sertakan nomor order <strong>#{order.orderNumber}</strong> saat transfer atau konfirmasi bukti pembayaran.
            </p>
          </div>
        </div>

        {/* Modal Footer (Not printed) */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-400">
            Kirim invoice ini ke customer melalui WhatsApp
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-white transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
