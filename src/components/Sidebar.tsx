'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ClipboardPaste,
  ShoppingBag,
  History,
  Menu,
  X,
  Sparkles,
  Box,
  PieChart,
  Wallet,
  LogOut,
} from 'lucide-react';
import { logoutUser } from '@/app/login/actions';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Produk', href: '/products', icon: Package },
  { name: 'Stok Masuk', href: '/stock-in', icon: ArrowDownToLine },
  { name: 'Paste Order', href: '/paste-order', icon: ClipboardPaste },
  { name: 'Daftar Order', href: '/orders', icon: ShoppingBag },
  { name: 'Kemasan Ziplock', href: '/packaging', icon: Box },
  { name: 'Performa Motif', href: '/motif-analysis', icon: PieChart },
  { name: 'Keuangan & Profit', href: '/finance', icon: Wallet },
  { name: 'Riwayat Stok', href: '/stock-history', icon: History },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === '/login') return null;

  return (
    <>
      {/* Mobile Bar Header */}
      <div className="lg:hidden w-full flex items-center justify-between px-4 py-3 bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-sm">
            BC
          </div>
          <span className="font-bold text-lg tracking-tight">Bywell Closet</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white focus:outline-none"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-md shadow-rose-500/20 group-hover:scale-105 transition-transform">
              BC
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight leading-none group-hover:text-rose-400 transition-colors">
                Bywell Closet
              </h1>
              <p className="text-xs text-rose-400 font-medium mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Inventory MVP
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Menu Utama
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-rose-500 text-white font-semibold shadow-lg shadow-rose-500/25'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Info & Logout */}
        <div className="p-4 border-t border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={() => logoutUser()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-600/20 text-slate-300 hover:text-rose-400 border border-slate-700/60 font-semibold text-xs transition-colors"
          >
            <LogOut className="w-4 h-4" /> Keluar (Logout)
          </button>
          <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              <p className="font-medium text-slate-300">Status Sistem</p>
              <p className="text-emerald-400 flex items-center gap-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Terkunci & Aman
              </p>
            </div>
            <span className="px-2 py-1 rounded bg-slate-700 text-slate-300 font-mono text-[10px]">
              v1.0
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
