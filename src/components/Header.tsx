'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserCheck } from 'lucide-react';

const titleMap: Record<string, string> = {
  '/': 'Dashboard Overview',
  '/products': 'Master Batch & Produk',
  '/stock-in': 'Stok Masuk (Stock In)',
  '/paste-order': 'Paste Order WhatsApp',
  '/orders': 'Daftar Order Pelanggan',
  '/motif-analysis': 'Analisis & Performa Motif',
  '/finance': 'Keuangan & Laba Rugi',
  '/stock-history': 'Riwayat Mutasi Stok',
};

export default function Header() {
  const pathname = usePathname();

  if (pathname === '/pin' || pathname === '/login') return null;

  const title = titleMap[pathname] || 'Bywell Closet Inventory';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 lg:top-0 z-30 px-3.5 py-3 sm:px-6 sm:py-4 flex items-center justify-between shadow-xs">
      <div className="min-w-0 pr-2">
        <h2 className="text-base sm:text-xl font-bold text-slate-800 tracking-tight truncate">{title}</h2>
        <p className="hidden sm:block text-xs text-slate-500 mt-0.5">Sistem Manajemen Stok & Pemrosesan Order WhatsApp</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs sm:text-sm border border-rose-200">
            <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-semibold text-slate-800 leading-tight">Bywell Closet</p>
            <p className="text-xs text-slate-400">Kasir / Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
