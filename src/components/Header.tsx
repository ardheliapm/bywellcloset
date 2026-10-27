'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { UserCheck, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import ChangePinModal from '@/components/ChangePinModal';
import { lockApp } from '@/app/pin/actions';

const titleMap: Record<string, string> = {
  '/': 'Dashboard Overview',
  '/products': 'Master Batch & Produk',
  '/stock-in': 'Stok Masuk (Stock In)',
  '/paste-order': 'Paste Order WhatsApp',
  '/orders': 'Daftar Order Pelanggan',
  '/pre-orders': 'Pre-Order (PO) & Antrean Kedatangan',
  '/motif-analysis': 'Analisis & Performa Motif',
  '/finance': 'Keuangan & Laba Rugi',
  '/stock-history': 'Riwayat Mutasi Stok',
};

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  if (pathname === '/pin' || pathname === '/login') return null;

  const title = titleMap[pathname] || 'Bywell Closet Inventory';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 lg:top-0 z-30 px-3.5 py-3 sm:px-6 sm:py-4 flex items-center justify-between shadow-xs">
      <div className="min-w-0 pr-2">
        <h2 className="text-base sm:text-xl font-bold text-slate-800 tracking-tight truncate">{title}</h2>
        <p className="hidden sm:block text-xs text-slate-500 mt-0.5">Sistem Manajemen Stok & Pemrosesan Order WhatsApp</p>
      </div>

      <div className="relative flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 sm:gap-3 rounded-xl px-1 py-1 hover:bg-slate-50 cursor-pointer"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs sm:text-sm border border-rose-200">
            <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-semibold text-slate-800 leading-tight">Bywell Closet</p>
            <p className="text-xs text-slate-400">Kasir / Admin</p>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>

        {menuOpen && (
          <>
            {/* Lapisan transparan: klik di luar menu untuk menutup */}
            <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-white border border-slate-200 shadow-lg py-1 z-10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setPinModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-slate-400" /> Ganti PIN
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  lockApp();
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Kunci Aplikasi
              </button>
            </div>
          </>
        )}
      </div>

      {/* Dirender ke body supaya tampil di atas sidebar (urutan layer z-index berbeda) */}
      {pinModalOpen &&
        createPortal(
          <ChangePinModal isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} />,
          document.body,
        )}
    </header>
  );
}
