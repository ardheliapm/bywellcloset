/**
 * Hitungan pembayaran PO. Murni (tanpa database) supaya mudah dites.
 *
 * - paidAmount = jumlah yang sudah dibayar (bisa dicicil berkali-kali).
 * - PO lama yang ditandai PAID tapi paidAmount-nya 0 dianggap sudah dibayar penuh (data sebelum fitur ini).
 */
export interface PaymentFields {
  totalAmount: number;
  paymentStatus: string;
  paidAmount?: number | null;
}

export function paidOf(po: PaymentFields): number {
  const paid = Math.max(0, Math.floor(po.paidAmount ?? 0));
  if (paid === 0 && po.paymentStatus === 'PAID') return Math.max(0, po.totalAmount);
  return paid;
}

export function remainingOf(po: PaymentFields): number {
  return Math.max(0, po.totalAmount - paidOf(po));
}

export function isFullyPaid(po: PaymentFields): boolean {
  if (po.totalAmount <= 0) return po.paymentStatus === 'PAID';
  return remainingOf(po) === 0;
}

/** Nilai barang yang sudah siap (belum dikirim) dikurangi yang sudah dibayar: dasar tombol "lunasi bagian yang siap". */
export function readyRemaining(
  po: PaymentFields,
  items: { price: number; quantityFulfilled: number; quantityShipped: number }[],
): number {
  const readyValue = items.reduce((sum, it) => sum + it.price * Math.max(0, it.quantityFulfilled - it.quantityShipped), 0);
  const shippedValue = items.reduce((sum, it) => sum + it.price * Math.max(0, it.quantityShipped), 0);
  return Math.min(remainingOf(po), Math.max(0, readyValue + shippedValue - paidOf(po)));
}
