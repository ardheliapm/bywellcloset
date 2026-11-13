import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPoItemsFromOrder } from '../src/lib/orderToPo.ts';

test('item yang sudah ditahan jadi siap penuh', () => {
  const r = buildPoItemsFromOrder([{ productId: 'p1', productSku: 'A', productName: 'A', price: 42000, quantity: 3 }]);
  assert.equal(r[0].quantityFulfilled, 3);
  assert.equal(r[0].subtotal, 126000);
  assert.equal(r[0].quantityFulfilled, r[0].quantityOrdered);
});

test('item tanpa produk tidak dianggap siap', () => {
  const r = buildPoItemsFromOrder([
    { productId: 'p1', productSku: 'A', productName: 'A', price: 1000, quantity: 2 },
    { productId: null, productSku: 'B', productName: 'B', price: 1000, quantity: 1 },
  ]);
  assert.equal(r[1].quantityFulfilled, 0);
  assert.equal(r[0].quantityFulfilled, r[0].quantityOrdered);
  assert.ok(r[1].quantityFulfilled < r[1].quantityOrdered);
});
