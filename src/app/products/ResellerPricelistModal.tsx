'use client';

import React, { useState, useEffect } from 'react';
import { X, Tag, Save, CheckCircle2, RotateCcw } from 'lucide-react';

export interface ResellerTierConfig {
  minQty: number;
  maxQty: number | null;
  price: number;
  label: string;
}

export const DEFAULT_RESELLER_TIERS: ResellerTierConfig[] = [
  { minQty: 0, maxQty: 5, price: 42000, label: '0 - 5 PCS (Eceran)' },
  { minQty: 6, maxQty: 10, price: 39000, label: '6 - 10 PCS' },
  { minQty: 11, maxQty: 19, price: 36000, label: '11 - 19 PCS' },
  { minQty: 20, maxQty: 49, price: 32500, label: '20 - 49 PCS' },
  { minQty: 50, maxQty: 99, price: 31000, label: '50 - 99 PCS' },
  { minQty: 100, maxQty: 199, price: 30000, label: '100 - 199 PCS' },
  { minQty: 200, maxQty: 500, price: 28500, label: '200 - 500 PCS' },
  { minQty: 501, maxQty: 999, price: 27500, label: '501 - 999 PCS' },
  { minQty: 1000, maxQty: null, price: 26000, label: '> 1000 PCS' },
];

interface ResellerPricelistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ResellerPricelistModal({ isOpen, onClose }: ResellerPricelistModalProps) {
  const [tiers, setTiers] = useState<ResellerTierConfig[]>(DEFAULT_RESELLER_TIERS);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bywell_reseller_tiers');
      if (stored) {
        try {
          setTiers(JSON.parse(stored));
        } catch (e) {
          setTiers(DEFAULT_RESELLER_TIERS);
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePriceChange = (index: number, newPrice: number) => {
    setTiers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], price: Math.max(0, newPrice) };
      return updated;
    });
  };

  const handleSave = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bywell_reseller_tiers', JSON.stringify(tiers));
      // Dispatch custom event to notify other components (e.g. PasteOrderClient)
      window.dispatchEvent(new Event('bywell_pricelist_updated'));
    }
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const handleResetDefault = () => {
    const confirmReset = window.confirm('Kembalikan tabel pricelist reseller ke pengaturan default standar?');
    if (confirmReset) {
      setTiers(DEFAULT_RESELLER_TIERS);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('bywell_reseller_tiers');
        window.dispatchEvent(new Event('bywell_pricelist_updated'));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Pengaturan Pricelist Reseller</h2>
              <p className="text-slate-400 text-xs">Kelola tabel harga grosir bertingkat (Bebas Mix Motif)</p>
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

        {/* Success Alert */}
        {savedSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Pricelist Reseller berhasil diperbarui! Semua perhitungan order otomatis menggunakan harga baru.</span>
          </div>
        )}

        {/* Body: Tiers Table */}
        <div className="p-6 overflow-y-auto space-y-3">
          <p className="text-xs text-slate-500">
            Ubah nominal harga pada kolom di bawah ini. Perubahan harga akan <strong>otomatis berlaku</strong> untuk semua penempelan pesanan WhatsApp baru.
          </p>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Rentang Kuantitas (PCS)</th>
                  <th className="py-2.5 px-3 text-right">Harga Satuan (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tiers.map((tier, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {tier.label}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 font-semibold">Rp</span>
                        <input
                          type="number"
                          min="0"
                          value={tier.price}
                          onChange={(e) => handlePriceChange(idx, parseInt(e.target.value, 10) || 0)}
                          className="w-28 text-right px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefault}
            className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Standard
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-4 h-4" /> Simpan Pricelist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
