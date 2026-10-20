'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Lock,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  LayoutDashboard,
  Wallet,
} from 'lucide-react';
import { verifyFinancePassword } from './actions';

export default function FinanceLockScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    const res = await verifyFinancePassword(password);

    if (res.success) {
      router.refresh();
    } else {
      setLoading(false);
      setError(res.error || 'Password salah. Akses ditolak.');
      setShake(true);
      setTimeout(() => {
        setShake(false);
      }, 500);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div
        className={`w-full max-w-md bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 transition-transform ${
          shake ? 'animate-bounce' : ''
        }`}
      >
        {/* Top Icon & Badges */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/70 mb-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Area Terproteksi • Khusus Owner
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              Akses Halaman Omset Terkunci
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              Halaman ini memuat laporan omset, HPP, margin laba, dan data finansial toko. Silakan masukkan password keamanan untuk mengakses.
            </p>
          </div>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Password Akses Keuangan
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                required
                disabled={loading}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Masukkan password..."
                className={`w-full pl-10 pr-11 py-3 rounded-xl border text-sm font-medium transition-all focus:outline-hidden ${
                  error
                    ? 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-200 text-slate-800 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
                title={showPassword ? 'Sembunyikan Password' : 'Lihat Password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Memverifikasi Password...
              </>
            ) : (
              <>
                Buka Halaman Omset <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Navigation */}
        <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1.5 transition-colors py-1"
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> Kembali ke Dashboard
          </Link>
          <p className="text-[11px] text-slate-400">
            Sesi aman akan aktif selama Anda membukanya dan dapat dikunci kembali kapan saja.
          </p>
        </div>
      </div>
    </div>
  );
}
