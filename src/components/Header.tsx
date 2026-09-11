'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, UserCheck, KeyRound } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

const titleMap: Record<string, string> = {
  '/': 'Dashboard Overview',
  '/products': 'Master Batch & Produk',
  '/stock-in': 'Stok Masuk (Stock In)',
  '/paste-order': 'Paste Order WhatsApp',
  '/orders': 'Daftar Order Pelanggan',
  '/stock-history': 'Riwayat Mutasi Stok',
};

export default function Header() {
  const pathname = usePathname();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  if (pathname === '/login') return null;

  const title = titleMap[pathname] || 'Bywell Closet Inventory';

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 lg:top-0 z-30 px-3.5 py-3 sm:px-6 sm:py-4 flex items-center justify-between shadow-xs">
        <div className="min-w-0 pr-2">
          <h2 className="text-base sm:text-xl font-bold text-slate-800 tracking-tight truncate">{title}</h2>
          <p className="hidden sm:block text-xs text-slate-500 mt-0.5">Sistem Manajemen Stok & Pemrosesan Order WhatsApp</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsPasswordModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            title="Ubah Password Akun"
          >
            <KeyRound className="w-4 h-4 text-rose-500" />
            <span className="hidden sm:inline">Ubah Password</span>
          </button>

          <div className="h-5 sm:h-6 w-px bg-slate-200"></div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs sm:text-sm border border-rose-200">
              <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-semibold text-slate-800 leading-tight">Admin Bywell</p>
              <p className="text-xs text-slate-400">Kasir / Admin Stok</p>
            </div>
          </div>
        </div>
      </header>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
}
