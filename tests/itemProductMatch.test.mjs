import test from 'node:test';
import assert from 'node:assert/strict';
import { findProductForItem } from '../src/lib/productMatching.ts';

const abs = { id: 'abs', sku: 'ABS CREAMY', name: 'BABY TRYSPAN', motif: null, isActive: true };
const polka = { id: 'polka', sku: 'POLKA RED', name: 'BABY TRYSPAN', motif: 'POLKA', isActive: true };
const blurry = { id: 'blurry', sku: 'BLURRY YELLOW', name: 'BABY TRYSPAN', motif: 'BLURRY', isActive: true };

test('SKU persis menang walau produk tanpa motif ada lebih dulu di daftar', () => {
  const list = [abs, polka, blurry];
  assert.equal(findProductForItem(list, { productSku: 'POLKA RED', productName: 'BABY TRYSPAN' })?.id, 'polka');
  assert.equal(findProductForItem(list, { productSku: 'BLURRY YELLOW', productName: 'BABY TRYSPAN' })?.id, 'blurry');
});

test('nama kategori saja tidak boleh cocok ke produk acak', () => {
  assert.equal(findProductForItem([abs], { productSku: 'POLKA RED', productName: 'BABY TRYSPAN' }), null);
});

test('SKU yang benar-benar ada tetap ketemu', () => {
  assert.equal(findProductForItem([abs, polka], { productSku: 'ABS CREAMY', productName: 'BABY TRYSPAN' })?.id, 'abs');
});
