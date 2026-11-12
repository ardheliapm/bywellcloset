import { matchProduct, suggestProducts } from './productMatching.ts';

export interface PreviewProduct {
  id: string;
  sku: string;
  name: string;
  motif?: string | null;
  color?: string | null;
  isActive?: boolean;
  physicalStock: number;
  reservedStock: number;
}

export interface PreviewInputItem {
  id: string;
  productId: string | null;
  productSku: string;
  productName: string;
  quantityOrdered: number;
}

export interface PreviewLine<P extends PreviewProduct = PreviewProduct> {
  itemId: string;
  /** Teks yang diketik/ditempel pengguna */
  typed: string;
  quantity: number;
  /** Produk Master yang dituju, null kalau tidak dikenali */
  product: P | null;
  /** Saran produk mirip, hanya diisi kalau product null */
  suggestions: P[];
  /** Stok bebas produk saat ini (fisik dikurangi tahan) */
  free: number;
  /** Berapa pcs yang langsung disisihkan begitu PO disimpan */
  ready: number;
  /** Berapa pcs yang masih menunggu stok */
  waiting: number;
}

/**
 * Pratinjau sebelum PO disimpan: tiap baris menunjukkan produk Master yang dituju, stok bebasnya,
 * dan berapa pcs yang langsung siap. Produk yang sama di beberapa baris berbagi stok bebas yang sama.
 * Baris yang tidak dikenali diberi saran produk mirip (hanya saran, tidak pernah dipakai otomatis).
 */
export function buildPoPreview<P extends PreviewProduct>(items: PreviewInputItem[], products: P[]): PreviewLine<P>[] {
  const active = products.filter((p) => p.isActive !== false);
  const remaining = new Map<string, number>();
  const lines: PreviewLine<P>[] = [];

  for (const it of items) {
    const qty = Math.max(0, Number(it.quantityOrdered) || 0);
    const typed = (it.productSku || it.productName || '').trim();

    let product: P | null = null;
    if (it.productId) product = products.find((p) => p.id === it.productId) ?? null;
    if (!product) product = matchProduct(active, it.productSku || '', it.productName || '')?.product ?? null;

    if (!product) {
      const suggestions = suggestProducts(active, it.productSku || '', it.productName || '', 3).map((s) => s.product);
      lines.push({ itemId: it.id, typed, quantity: qty, product: null, suggestions, free: 0, ready: 0, waiting: qty });
      continue;
    }

    if (!remaining.has(product.id)) remaining.set(product.id, Math.max(0, product.physicalStock - product.reservedStock));
    const free = remaining.get(product.id)!;
    const ready = Math.min(qty, free);
    remaining.set(product.id, free - ready);
    lines.push({ itemId: it.id, typed, quantity: qty, product, suggestions: [], free, ready, waiting: qty - ready });
  }
  return lines;
}
