import React from 'react';
import { Package, ShoppingBag, Clock, DollarSign, ArrowUpRight } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Banner Welcome */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-rose-500/10 to-transparent pointer-events-none" />
        <h2 className="text-2xl font-bold tracking-tight">Selamat Datang di Bywell Closet Inventory</h2>
        <p className="text-rose-200 text-sm mt-1 max-w-xl">
          Sistem manajemen stok otomatis terintegrasi untuk pencatatan order WhatsApp, penanganan stok hold, dan pemrosesan invoice.
        </p>
      </div>

      {/* Overview Stat Cards Placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Produk</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">0 SKU</p>
            <span className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">Master produk aktif</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Menunggu Bayar</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">0 Order</p>
            <span className="text-xs text-amber-600/80 mt-1 inline-flex items-center gap-1">Stok hold aktif</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Dibayar</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">0 Order</p>
            <span className="text-xs text-emerald-600/80 mt-1 inline-flex items-center gap-1">Lunas & terverifikasi</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Omset</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">Rp 0</p>
            <span className="text-xs text-rose-600/80 mt-1 inline-flex items-center gap-1">Penjualan terverifikasi</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Content Placeholder Area */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 mx-auto flex items-center justify-center">
          <ArrowUpRight className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Kerangka Halaman Dashboard Siap</h3>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Fitur analitik, grafik stok fisik vs ditahan, serta aktivitas transaksi terbaru siap dikembangkan pada tahap selanjutnya.
        </p>
      </div>
    </div>
  );
}
