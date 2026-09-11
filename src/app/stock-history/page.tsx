import React from 'react';
import { History } from 'lucide-react';

export default function StockHistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Riwayat Mutasi Stok</h1>
        <p className="text-slate-500 text-sm mt-0.5">Jurnal audit transaksi mutasi keluar-masuk dan pelepasan stok ditahan</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-500 mx-auto flex items-center justify-center">
          <History className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">Halaman Riwayat Stok</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1">
            Log audit real-time yang mencatat setiap perubahan stok fisik maupun stok ditahan (Reserved) yang terjadi dari aksi stok masuk, order baru, verifikasi bayar, atau pembatalan.
          </p>
        </div>
        <div className="pt-2">
          <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
            Status: Kerangka Halaman Siap
          </span>
        </div>
      </div>
    </div>
  );
}
