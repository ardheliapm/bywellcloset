import { timingSafeEqual } from 'node:crypto';

// PIN darurat: diatur lewat environment variable RECOVERY_PIN di Vercel.
// Dipakai hanya jika PIN admin lupa. Setelah berhasil masuk, hapus variabelnya.
//
// Aturan: harus tepat 6 angka dan tidak boleh 123456 (terlalu mudah ditebak).

export function getRecoveryPin(): string | null {
  const pin = process.env.RECOVERY_PIN?.trim();
  if (!pin || !/^\d{6}$/.test(pin) || pin === '123456') return null;
  return pin;
}

/** True jika input sama persis dengan RECOVERY_PIN (dibandingkan dengan waktu-konstan). */
export function matchesRecoveryPin(input: string): boolean {
  const recovery = getRecoveryPin();
  const candidate = input.trim();
  if (!recovery || candidate.length !== recovery.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(recovery));
}
