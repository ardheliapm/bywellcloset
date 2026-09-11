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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Sistem Manajemen Stok & Pemrosesan Order WhatsApp</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPasswordModalOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            title="Ubah Password Akun"
          >
            <KeyRound className="w-4 h-4 text-rose-500" /> Ubah Password
          </button>

          <div className="h-6 w-px bg-slate-200"></div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm border border-rose-200">
              <UserCheck className="w-5 h-5" />
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
