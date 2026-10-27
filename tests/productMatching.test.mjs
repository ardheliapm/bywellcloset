import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCode,
  extractCode,
  matchProduct,
  suggestProducts,
  buildNewProductDraft,
  editDistance,
} from '../src/lib/productMatching.ts';

const mk = (sku, name, motif = null) => ({ id: `${sku}|${name}`, sku, name, motif, isActive: true });
const paris = (code) => mk(code, 'PARIS JAPAN');
const skuOf = (r) => (r ? r.product.sku : null);

test('kode dibandingkan persis: 12, 12-2, dan 122 adalah tiga kode berbeda', () => {
  assert.notEqual(canonicalCode('12-2'), canonicalCode('122'));
  assert.notEqual(canonicalCode('12-2'), canonicalCode('12'));
  assert.equal(canonicalCode(' pj-12-2 '), 'PJ-12-2');
  assert.equal(canonicalCode('12 2'), '12-2');
  assert.equal(canonicalCode('12_2'), '12-2');
});

test('"12-2" cocok ke produk 12-2, BUKAN ke 12 atau 122', () => {
  const list = [paris('12'), paris('122'), paris('12-2'), paris('37')];
  assert.equal(skuOf(matchProduct(list, 'PJ-12-2', 'PARIS JAPAN - 12-2')), '12-2');
  assert.equal(skuOf(matchProduct(list, '12-2', 'PARIS JAPAN')), '12-2');
});

test('"12-2" tidak ada di Master: tidak cocok ke 12 maupun 122 (tidak ada tebakan otomatis)', () => {
  const list = [paris('12'), paris('122'), paris('37')];
  assert.equal(matchProduct(list, 'PJ-12-2', 'PARIS JAPAN - 12-2'), null);
  assert.equal(matchProduct(list, '', 'paris japan 12-2'), null);
});

test('"12" tetap cocok ke produk 12 walau 12-2 dan 122 juga ada', () => {
  const list = [paris('12-2'), paris('122'), paris('12')];
  assert.equal(skuOf(matchProduct(list, 'PJ-12', 'PARIS JAPAN - 12')), '12');
  assert.equal(skuOf(matchProduct(list, '', 'PARIS JAPAN 12')), '12');
});

test('awalan kategori boleh ada atau tidak', () => {
  const list = [paris('88'), mk('BW76', 'BABY TRYSPAN')];
  assert.equal(skuOf(matchProduct(list, 'PJ-88', 'PARIS JAPAN')), '88');
  assert.equal(skuOf(matchProduct(list, 'PJ88', 'PARIS JAPAN')), '88');
  assert.equal(skuOf(matchProduct(list, '88', 'PARIS JAPAN')), '88');
  assert.equal(skuOf(matchProduct(list, 'BW-76', '')), 'BW76');
  assert.equal(skuOf(matchProduct(list, 'BW76', '')), 'BW76');
});

test('nama motif cocok persis (besar kecil huruf dan spasi tidak masalah)', () => {
  const list = [mk('BW76', 'BABY TRYSPAN', 'IRISH TULIP'), mk('BW80', 'BABY TRYSPAN', 'SPARK FLOWER')];
  for (const typed of ['IRISH TULIP', 'irish tulip', 'Irish  Tulip ', 'irish-tulip']) {
    assert.equal(skuOf(matchProduct(list, '', typed)), 'BW76', typed);
  }
});

test('salah ketik motif TIDAK cocok otomatis, tetapi muncul sebagai saran', () => {
  const list = [mk('BW76', 'BABY TRYSPAN', 'IRISH TULIP'), mk('BW80', 'BABY TRYSPAN', 'SPARK FLOWER')];
  for (const typed of ['IRISH TULLIP', 'IRISH TULIPS', 'IRIS TULIP']) {
    assert.equal(matchProduct(list, '', typed), null, typed);
    const s = suggestProducts(list, '', typed);
    assert.equal(s[0]?.product.sku, 'BW76', `saran untuk ${typed}`);
    assert.ok(!s.some((x) => x.product.sku === 'BW80'), 'SPARK FLOWER tidak boleh disarankan');
  }
});

test('saran untuk kode yang tidak ada: 12-2 menyarankan 12 dan 122 (tidak menerapkannya)', () => {
  const list = [paris('12'), paris('122'), paris('37'), paris('88')];
  const s = suggestProducts(list, 'PJ-12-2', 'PARIS JAPAN - 12-2').map((x) => x.product.sku).sort();
  assert.deepEqual(s, ['12', '122']);
});

test('saran tidak muncul untuk produk yang tidak berhubungan', () => {
  const list = [paris('37'), paris('88'), mk('BW80', 'BABY TRYSPAN', 'SPARK FLOWER')];
  assert.deepEqual(suggestProducts(list, 'PJ-12-2', 'PARIS JAPAN - 12-2'), []);
  assert.deepEqual(suggestProducts(list, '', 'KOPI HITAM'), []);
});

test('kategori dihormati: kode Paris tidak cocok ke produk Baby Tryspan dengan kode sama', () => {
  const list = [mk('88-X', 'BABY TRYSPAN', null)];
  assert.equal(matchProduct(list, 'PJ-88', 'PARIS JAPAN'), null);
});

test('produk nonaktif dipakai hanya jika tidak ada yang aktif', () => {
  const inactive = { ...paris('12'), id: 'a', isActive: false };
  assert.equal(matchProduct([inactive], '12', 'PARIS JAPAN').product.id, 'a');
  const active = { ...paris('12'), id: 'b', isActive: true };
  // SKU unik di database, tetapi nama berbeda boleh punya kode sama di kategori lain
  assert.equal(matchProduct([inactive, active], '12', 'PARIS JAPAN').product.id, 'b');
});

test('extractCode', () => {
  assert.equal(extractCode('PJ-12-2', ''), '12-2');
  assert.equal(extractCode('', 'PARIS JAPAN - 12-2'), '12-2');
  assert.equal(extractCode('', 'paris japan 12-2'), '12-2');
  assert.equal(extractCode('', 'IRISH TULIP'), 'IRISH-TULIP');
  assert.equal(extractCode('SKU-IN', 'BABY TRYSPAN - SPARK FLOWER'), 'SPARK-FLOWER');
});

test('rancangan produk baru mengikuti kebiasaan Master', () => {
  const p = buildNewProductDraft('PJ-12-2', 'PARIS JAPAN - 12-2');
  assert.equal(p.sku, '12-2');
  assert.equal(p.name, 'PARIS JAPAN');
  const m = buildNewProductDraft('', 'IRISH TULIP');
  assert.equal(m.name, 'BABY TRYSPAN');
  assert.equal(m.motif, 'IRISH TULIP');
  const b = buildNewProductDraft('BW83', '');
  assert.equal(b.sku, 'BW83');
  assert.equal(b.motif, null);
  assert.equal(buildNewProductDraft('', ''), null);
});

test('editDistance', () => {
  assert.equal(editDistance('irishtulip', 'irishtullip'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('', 'abc'), 3);
});
