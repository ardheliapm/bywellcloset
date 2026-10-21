'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Users,
  Clock,
  Phone,
  MessageCircle,
  ExternalLink,
  Loader2,
  Package,
  Layers,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { ProductItem, ProductReservationItem, getProductReservations } from './actions';

interface ReservedStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
}

export default function ReservedStockModal({
  isOpen,
  onClose,
  product,
}: ReservedStockModalProps) {
  const [loading, setLoading] = useState(false);
  const [reservations, setReservations] = useState<ProductReservationItem[]>([]);

  useEffect(() => {
    if (isOpen && product) {
      setLoading(true);
      getProductReservations(product.id)
        .then((data) => {
          setReservations(data);
        })
        .catch((err) => {
          console.error('Failed to load reservations:', err);
          setReservations([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setReservations([]);
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const totalHeldFromItems = reservations.reduce((acc, it) => acc + it.reservedQuantity, 0);
  const regularCount = reservations.filter((r) => r.type === 'REGULAR_ORDER').length;
  const regularPcs = reservations
    .filter((r) => r.type === 'REGULAR_ORDER')
    .reduce((acc, it) => acc + it.reservedQuantity, 0);

  const poCount = reservations.filter((r) => r.type === 'PRE_ORDER').length;
  const poPcs = reservations
    .filter((r) => r.type === 'PRE_ORDER')
    .reduce((acc, it) => acc + it.reservedQuantity, 0);

  const formatPhoneNumber = (phone: string | null) => {
    if (!phone) return null;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    }
    return clean;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Rincian Penahan Stok
                </h2>
                <span className="font-mono text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md">
                  {product.sku}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                {product.name}
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

        {/* Stock Snapshot Cards */}
        <div className="p-4 sm:p-6 bg-slate-50/70 border-b border-slate-200/80">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Total Ditahan
              </span>
              <span className="text-xl font-black text-amber-600 block mt-0.5">
                {product.reservedStock} <span className="text-xs font-semibold text-slate-500">pcs</span>
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Order Reguler
              </span>
              <span className="text-xl font-black text-slate-800 block mt-0.5">
                {regularPcs} <span className="text-xs font-semibold text-slate-500">pcs</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium">({regularCount} order)</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Pre-Order (PO)
              </span>
              <span className="text-xl font-black text-indigo-700 block mt-0.5">
                {poPcs} <span className="text-xs font-semibold text-slate-500">pcs</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium">({poCount} PO)</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-7 h-7 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Memuat data pemegang stok...</p>
            </div>
          ) : reservations.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Tidak Ada Penahan Aktif</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Semua stok untuk produk ini saat ini bebas atau order penahan sebelumnya telah selesai / dibatalkan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
                <span>Daftar Customer yang Menahan ({reservations.length}):</span>
                <span>Total: {totalHeldFromItems} pcs</span>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                {reservations.map((res) => {
                  const isPo = res.type === 'PRE_ORDER';
                  const waNumber = formatPhoneNumber(res.customerPhone);

                  return (
                    <div
                      key={res.id}
                      className="p-3.5 sm:p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Left: Customer & Contact */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">
                            {res.customerName}
                          </span>

                          {isPo ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Clock className="w-2.5 h-2.5" /> Pre-Order (PO)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <ShoppingBag className="w-2.5 h-2.5" /> Order Reguler
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span className="font-mono font-semibold text-slate-700">
                            #{res.referenceNumber}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(res.orderDate).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          {res.customerPhone ? (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-slate-600">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {res.customerPhone}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>•</span>
                              <span className="text-slate-300 italic text-[11px]">Tanpa no. WA</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Quantity & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Status & Quantity */}
                        <div className="text-right">
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-black text-xs">
                            {res.reservedQuantity} pcs
                          </div>
                          <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                            {isPo
                              ? res.status === 'READY'
                                ? 'Siap Kirim Full'
                                : 'Sebagian Ready'
                              : 'HOLD (Menunggu Bayar)'}
                          </div>
                        </div>

                        {/* WhatsApp Button */}
                        {waNumber ? (
                          <a
                            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                              `Halo Kak ${res.customerName}, konfirmasi pesanan #${res.referenceNumber} untuk produk ${product.name} (${product.sku}).`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                            title="Chat WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Chat WA</span>
                          </a>
                        ) : null}

                        {/* Navigation link */}
                        <Link
                          href={isPo ? '/pre-orders' : '/orders'}
                          onClick={onClose}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title={isPo ? 'Buka Menu Pre-Order' : 'Buka Menu Daftar Order'}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            * Stok fisik akan resmi berkurang saat order / PO ditandai <strong>Kirim</strong> atau <strong>Bayar</strong>.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
