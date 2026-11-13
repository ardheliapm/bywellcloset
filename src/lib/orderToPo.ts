// Mengubah order HOLD biasa menjadi PO tanpa melepas stok yang sudah ditahan.
// Barang yang sudah ditahan (punya productId) langsung dianggap "siap" (quantityFulfilled = jumlah).
// Barang tanpa productId tidak pernah menahan stok, jadi mulai dari 0 (menunggu).

export interface OrderItemLike {
  productId: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
}

export function buildPoItemsFromOrder(items: OrderItemLike[]) {
  return items.map((it) => {
    const qty = Math.max(1, Math.floor(it.quantity || 1));
    const price = Math.max(0, Math.floor(it.price || 0));
    return {
      productId: it.productId,
      productSku: it.productSku,
      productName: it.productName,
      price,
      quantityOrdered: qty,
      quantityFulfilled: it.productId ? qty : 0,
      quantityShipped: 0,
      subtotal: qty * price,
    };
  });
}
