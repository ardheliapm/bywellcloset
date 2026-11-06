import { matchProduct } from '../../lib/productMatching.ts';
import type { PreOrderRecord, PreOrderItemRecord } from './actions.ts';
import type { ProductItem } from '../products/actions.ts';

export interface LinkableItem {
  po: PreOrderRecord;
  item: PreOrderItemRecord;
}

/**
 * Item PO aktif yang belum terhubung ke produk Master dan tidak bisa dicocokkan otomatis
 * (biasanya salah ketik), sehingga tidak akan pernah kebagian stok.
 */
export function findLinkableItems(preOrders: PreOrderRecord[], products: ProductItem[]): LinkableItem[] {
  const out: LinkableItem[] = [];
  for (const po of preOrders) {
    if (po.status === 'CANCELLED' || po.status === 'SHIPPED') continue;
    for (const item of po.items) {
      if (item.productId) continue;
      if (item.quantityFulfilled > 0 || item.quantityShipped > 0) continue;
      if (item.quantityOrdered - item.quantityFulfilled <= 0) continue;
      if (matchProduct(products, item.productSku || '', item.productName || '') !== null) continue;
      out.push({ po, item });
    }
  }
  return out.sort((a, b) => new Date(a.po.createdAt).getTime() - new Date(b.po.createdAt).getTime());
}
