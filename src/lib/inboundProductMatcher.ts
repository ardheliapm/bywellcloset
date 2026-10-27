import type { Prisma, Product } from '@prisma/client';
import { buildNewProductDraft, matchProduct, type NewProductDraft } from './productMatching';

/**
 * Menentukan produk Master Data untuk sebuah barang di Surat Jalan.
 *
 * Aturan pencocokan ada di productMatching.ts (kode dicocokkan persis; salah ketik hanya jadi saran).
 * Berbeda dengan versi lama, produk baru TIDAK PERNAH dibuat diam-diam di sini. Produk baru hanya
 * dibuat lewat createProductFromDraft() setelah pengguna menekan "Buat produk baru".
 */

/** Cari produk yang persis cocok; null kalau tidak ada. */
export function findInboundProductMatch(
  products: Product[],
  rawSku: string,
  rawName: string
): Product | null {
  return matchProduct(products, rawSku, rawName)?.product ?? null;
}

/**
 * Buat produk baru dari rancangan yang sudah dikonfirmasi pengguna. SKU diperiksa lagi di sisi
 * server supaya tidak pernah menimbulkan duplikat; kalau SKU sudah ada, produk yang ada dipakai.
 */
export async function createProductFromDraft(
  tx: Prisma.TransactionClient,
  products: Product[],
  draft: NewProductDraft
): Promise<{ product: Product; created: boolean }> {
  const existing = products.find((p) => p.sku.toUpperCase() === draft.sku.toUpperCase());
  if (existing) {
    if (!existing.isActive) {
      const reactivated = await tx.product.update({ where: { id: existing.id }, data: { isActive: true } });
      return { product: reactivated, created: false };
    }
    return { product: existing, created: false };
  }

  const created = await tx.product.create({
    data: {
      sku: draft.sku,
      name: draft.name,
      motif: draft.motif,
      color: null,
      costPrice: draft.costPrice,
      sellingPrice: draft.sellingPrice,
      wholesalePrice: draft.wholesalePrice,
      physicalStock: 0,
      reservedStock: 0,
      isActive: true,
    },
  });
  products.push(created);
  return { product: created, created: true };
}

export { buildNewProductDraft };
