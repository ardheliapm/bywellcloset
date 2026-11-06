'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { reconcileProductAllocation } from '@/lib/opnameAllocation';

export interface OpnameNewProduct {
  sku: string;
  name: string;
  motif?: string | null;
  color?: string | null;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice: number;
}

export interface OpnameApplyRow {
  /** Label untuk laporan hasil, mis. "Monogram Black" */
  label: string;
  /** Produk yang sudah ada di Master */
  productId?: string;
  /** ATAU produk baru yang dibuat dari hasil hitung */
  create?: OpnameNewProduct;
  countedQty: number;
}

export interface OpnameApplyResult {
  label: string;
  sku: string;
  ok: boolean;
  created?: boolean;
  before?: number;
  after?: number;
  releasedFromPo?: number;
  allocatedToPo?: number;
  holdExceedsPhysical?: boolean;
  error?: string;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Terapkan hasil hitung fisik: stok fisik produk DISET sama dengan hasil hitung.
 * - Selisih dicatat di Riwayat Stok sebagai ADJUSTMENT_IN / ADJUSTMENT_OUT dengan catatan "Stok opname <tanggal>".
 * - Tahanan stok PO disesuaikan: kalau stok fisik tidak cukup, PO terbaru kembali menunggu.
 * - Tidak mengubah Keuangan.
 * Diproses per produk (satu transaksi per produk) dan aman diulang: hasil hitung yang sama tidak membuat selisih baru.
 */
export async function applyStockOpname(payload: { rows: OpnameApplyRow[]; note?: string }) {
  const rows = payload?.rows ?? [];
  if (rows.length === 0) return { success: false, error: 'Tidak ada baris untuk diterapkan.', results: [] };
  if (rows.length > 40) return { success: false, error: 'Maksimal 40 produk per proses.', results: [] };

  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  for (const r of rows) {
    if (!Number.isInteger(r.countedQty) || r.countedQty < 0 || r.countedQty > 100000) {
      return { success: false, error: `Jumlah untuk "${r.label}" tidak valid.`, results: [] };
    }
    if (!!r.productId === !!r.create) {
      return { success: false, error: `"${r.label}" harus punya produk tujuan atau data produk baru.`, results: [] };
    }
    if (r.productId) {
      if (seenIds.has(r.productId)) return { success: false, error: `Produk "${r.label}" muncul dua kali.`, results: [] };
      seenIds.add(r.productId);
    } else if (r.create) {
      const sku = r.create.sku.trim().toUpperCase();
      if (!sku) return { success: false, error: `SKU baru untuk "${r.label}" kosong.`, results: [] };
      if (seenSkus.has(sku)) return { success: false, error: `SKU baru "${sku}" muncul dua kali.`, results: [] };
      seenSkus.add(sku);
    }
  }

  const dateLabel = todayLabel();
  const extra = payload.note?.trim() ? ` - ${payload.note.trim()}` : '';
  const results: OpnameApplyResult[] = [];

  for (const r of rows) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          let created = false;
          let product;
          if (r.create) {
            const sku = r.create.sku.trim().toUpperCase();
            const dup = await tx.product.findUnique({ where: { sku } });
            if (dup) throw new Error(`SKU "${sku}" sudah ada di Master Produk.`);
            product = await tx.product.create({
              data: {
                sku,
                name: r.create.name.trim(),
                motif: r.create.motif?.trim() || null,
                color: r.create.color?.trim() || null,
                costPrice: Math.max(0, Math.floor(r.create.costPrice || 0)),
                sellingPrice: Math.max(0, Math.floor(r.create.sellingPrice || 0)),
                wholesalePrice: Math.max(0, Math.floor(r.create.wholesalePrice || 0)),
                physicalStock: 0,
                reservedStock: 0,
              },
            });
            created = true;
          } else {
            product = await tx.product.findUnique({ where: { id: r.productId! } });
            if (!product) throw new Error('Produk tidak ditemukan di Master Produk.');
          }

          const before = product.physicalStock;
          const diff = r.countedQty - before;
          if (diff !== 0) {
            await tx.product.update({ where: { id: product.id }, data: { physicalStock: r.countedQty } });
            await tx.stockTransaction.create({
              data: {
                productId: product.id,
                type: diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
                quantity: Math.abs(diff),
                notes: `Stok opname ${dateLabel}: ${before} -> ${r.countedQty} (${diff > 0 ? `+${diff}` : diff} pcs)${extra}`,
              },
            });
          }

          const rec = await reconcileProductAllocation(tx, product.id);
          const out: OpnameApplyResult = {
            label: r.label,
            sku: product.sku,
            ok: true,
            created,
            before,
            after: r.countedQty,
            releasedFromPo: rec.releasedFromPo,
            allocatedToPo: rec.allocatedToPo,
            holdExceedsPhysical: rec.holdExceedsPhysical,
          };
          return out;
        },
        { maxWait: 15000, timeout: 30000 },
      );
      results.push(result);
    } catch (error: any) {
      console.error('Error applying stock opname:', r.label, error);
      results.push({ label: r.label, sku: r.create?.sku ?? '', ok: false, error: error?.message || 'Gagal diproses.' });
    }
  }

  revalidatePath('/products');
  revalidatePath('/pre-orders');
  revalidatePath('/orders');
  revalidatePath('/stock-history');
  revalidatePath('/stock-in');
  revalidatePath('/');

  const okCount = results.filter((x) => x.ok).length;
  return { success: okCount > 0, results, error: okCount === 0 ? 'Semua baris gagal diproses.' : undefined };
}
