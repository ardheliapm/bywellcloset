'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Sparkles, Delete, AlertCircle, Loader2, Eye, EyeOff, ArrowRight, RotateCcw } from 'lucide-react';
import { verifyPin, resetPinToDefault } from './actions';

const PIN_LENGTH = 6;

export default function PinClient() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const triggerSubmit = async (pinValue: string) => {
    if (pinValue.length !== PIN_LENGTH || loading) return;

    setLoading(true);
    setError(null);

    const res = await verifyPin(pinValue);

    if (res.success) {
      router.push('/');
      router.refresh();
    } else {
      setLoading(false);
      setError(res.error || 'PIN yang Anda masukkan salah.');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin('');
        inputRef.current?.focus();
      }, 500);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(rawVal);
    setError(null);

    if (rawVal.length === PIN_LENGTH) {
      triggerSubmit(rawVal);
    }
  };

  const handleKeypadNumber = (num: string) => {
    if (loading || pin.length >= PIN_LENGTH) return;
    const newPin = pin + num;
    setPin(newPin);
    setError(null);

    if (newPin.length === PIN_LENGTH) {
      triggerSubmit(newPin);
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    if (loading) return;
    setPin('');
    setError(null);
    inputRef.current?.focus();
  };

  const handleUseDefaultPin = async () => {
    setPin('123456');
    setError(null);
    await resetPinToDefault();
    triggerSubmit('123456');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === PIN_LENGTH) {
      triggerSubmit(pin);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Neon Orbs */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-pink-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-slate-900/95 border border-slate-800 backdrop-blur-xl rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5 relative z-10">
        {/* Brand Logo & Title */}
        <div className="text-center space-y-1.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-500 mx-auto flex items-center justify-center font-black text-2xl text-white shadow-lg shadow-rose-500/30 mb-2">
            BC
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Bywell Closet</h1>
          <p className="text-xs text-rose-400 font-medium flex items-center justify-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Masukkan PIN Keamanan
          </p>
        </div>

        {/* Form with Visible Text/Password Box & Dots */}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={handleInputChange}
              disabled={loading}
              placeholder="••••••"
              autoFocus
              className={`w-full py-3.5 px-4 pr-12 rounded-2xl bg-slate-950 border text-center font-mono text-2xl tracking-[0.4em] font-bold text-white placeholder-slate-600 focus:outline-hidden transition-all ${
                shake
                  ? 'border-rose-500 ring-2 ring-rose-500/40 animate-bounce'
                  : 'border-slate-800 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30'
              }`}
            />
            {/* Toggle show/hide PIN */}
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors cursor-pointer"
              title={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center items-center gap-3 py-1">
            {Array.from({ length: PIN_LENGTH }).map((_, idx) => {
              const isFilled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                    isFilled
                      ? 'bg-rose-500 scale-125 shadow-md shadow-rose-500/50'
                      : 'bg-slate-800 border border-slate-700'
                  }`}
                />
              );
            })}
          </div>

          {/* Error Message or Status */}
          <div className="min-h-[26px] flex items-center justify-center">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-rose-400 text-xs font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memverifikasi PIN...</span>
              </div>
            ) : error ? (
              <div className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center gap-1.5 text-center">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 text-center">
                Ketik langsung dari keyboard atau tekan angka di bawah
              </p>
            )}
          </div>

          {/* Onscreen Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={loading}
                onClick={() => handleKeypadNumber(digit)}
                className="h-13 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-rose-500 active:text-white text-white font-bold text-2xl border border-slate-700/60 shadow-xs transition-all flex items-center justify-center disabled:opacity-40 cursor-pointer"
              >
                {digit}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleClear}
              className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-rose-400 font-semibold text-xs border border-slate-800 transition-all flex items-center justify-center disabled:opacity-30 cursor-pointer"
            >
              HAPUS
            </button>

            {/* Zero Button */}
            <button
              type="button"
              disabled={loading}
              onClick={() => handleKeypadNumber('0')}
              className="h-13 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-rose-500 active:text-white text-white font-bold text-2xl border border-slate-700/60 shadow-xs transition-all flex items-center justify-center disabled:opacity-40 cursor-pointer"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleBackspace}
              className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-rose-400 font-semibold text-sm border border-slate-800 transition-all flex items-center justify-center disabled:opacity-30 cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading || pin.length !== PIN_LENGTH}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold text-sm shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer mt-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Memverifikasi...
              </>
            ) : (
              <>
                Masuk Ke Aplikasi <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Hint with 1-Click Reset / Auto-fill */}
        <div className="pt-2 border-t border-slate-800/80 text-center space-y-2">
          <p className="text-[11px] text-slate-400">
            PIN Bawaan Default: <span className="font-mono text-rose-400 font-bold tracking-wider">123456</span>
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={handleUseDefaultPin}
            className="text-[11px] text-rose-400 hover:text-rose-300 underline font-semibold flex items-center justify-center gap-1 mx-auto cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Masuk dengan PIN Default (123456)
          </button>
        </div>
      </div>
    </div>
  );
}
