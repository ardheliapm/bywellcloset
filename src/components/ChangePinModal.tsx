'use client';

import React, { useState } from 'react';
import { X, KeyRound, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { changePin } from '@/app/pin/actions';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePinModal({ isOpen, onClose }: ChangePinModalProps) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      setError('PIN baru harus terdiri dari 6 digit angka.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('Konfirmasi PIN baru tidak sesuai.');
      return;
    }

    setLoading(true);
    const res = await changePin(oldPin, newPin);
    setLoading(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setOldPin('');
        setNewPin('');
        setConfirmPin('');
        onClose();
      }, 1500);
    } else {
      setError(res.error || 'Gagal mengubah PIN.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-rose-500 to-pink-600 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/20 backdrop-blur-md">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Ubah PIN Keamanan</h3>
              <p className="text-xs text-rose-100">Ganti 6 digit PIN akses aplikasi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {success ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">PIN Berhasil Diperbarui!</p>
                <p className="text-xs text-emerald-700">Gunakan PIN baru ini saat membuka aplikasi.</p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* PIN Lama */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN Lama Saat Ini (Default: 123456)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 Digit PIN Lama"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-mono tracking-widest text-center text-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              {/* PIN Baru */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN Baru (6 Digit Angka)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 Digit PIN Baru"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-mono tracking-widest text-center text-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              {/* Konfirmasi PIN Baru */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ulangi PIN Baru
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ulangi 6 Digit PIN Baru"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-mono tracking-widest text-center text-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading || oldPin.length === 0 || newPin.length !== 6 || confirmPin.length !== 6}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-xs shadow-md shadow-rose-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    'Simpan PIN Baru'
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
