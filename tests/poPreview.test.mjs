import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPoPreview } from '../src/lib/poPreview.ts';

const P = (id, sku, motif, phys, res, name = 'BABY TRYSPAN') => ({ id, sku, name, motif, physicalStock: phys, reservedStock: res, isActive: true });
const products = [
  P('1', 'GRADIENT MELON PINK', 'GRADIENT', 7, 4),
  P('2', 'GRADIENT SOFT LEMON', 'GRADIENT', 2, 2),
  P('3', 'ABS LEAFY', 'ABS', 1, 0),
  P('4', '12-2', null, 5, 0, 'PARIS JAPAN'),
];
const it = (id, sku, qty, productId = null) => ({ id, productId, productSku: sku, productName: sku, quantityOrdered: qty });

test('produk dikenali: stok bebas = fisik - tahan, langsung siap sebanyak stok bebas', () => {
  const [l] = buildPoPreview([it('a', 'GRADIENT MELON PINK', 5)], products);
  assert.equal(l.product.id, '1');
  assert.equal(l.free, 3);
  assert.equal(l.ready, 3);
  assert.equal(l.waiting, 2);
});

test('stok habis: semua menunggu', () => {
  const [l] = buildPoPreview([it('a', 'GRADIENT SOFT LEMON', 2)], products);
  assert.equal(l.free, 0);
  assert.equal(l.ready, 0);
  assert.equal(l.waiting, 2);
});

test('produk yang sama di dua baris berbagi stok bebas', () => {
  const lines = buildPoPreview([it('a', 'ABS LEAFY', 1), it('b', 'ABS LEAFY', 1)], products);
  assert.equal(lines[0].ready, 1);
  assert.equal(lines[1].ready, 0);
  assert.equal(lines[1].waiting, 1);
});

test('nama salah ketik tidak dikenali, ada saran, dan tidak dianggap siap', () => {
  const [l] = buildPoPreview([it('a', 'GRADIENT SOFT LEMMON', 2)], products);
  assert.equal(l.product, null);
  assert.equal(l.ready, 0);
  assert.equal(l.waiting, 2);
  assert.ok(l.suggestions.some((s) => s.sku === 'GRADIENT SOFT LEMON'), JSON.stringify(l.suggestions.map((s) => s.sku)));
});

test('productId yang sudah dipilih dipakai apa adanya', () => {
  const [l] = buildPoPreview([{ id: 'a', productId: '3', productSku: 'apa saja', productName: 'apa saja', quantityOrdered: 1 }], products);
  assert.equal(l.product.sku, 'ABS LEAFY');
  assert.equal(l.ready, 1);
});

test('kode Paris Japan dikenali persis; 12-2 berbeda dari 122', () => {
  const [a] = buildPoPreview([it('a', '12-2', 2)], products);
  assert.equal(a.product.id, '4');
  const [b] = buildPoPreview([it('b', '122', 2)], products);
  assert.equal(b.product, null);
});
