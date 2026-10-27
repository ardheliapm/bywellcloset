import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCode,
  extractCode,
  matchProduct,
  suggestProducts,
  buildNewProductDraft,
  editDistance,
  humanCode,
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
  assert.equal(m.sku, 'IRISH TULIP'); // nama motif disimpan di SKU dengan spasi, seperti produk lain
  assert.equal(m.motif, null);
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

test('nama motif yang tersimpan di kolom Nama (Motif kosong) tetap dikenali dan disarankan', () => {
  const byName = [mk('BW76', 'IRISH TULIP'), mk('BW80', 'SPARK FLOWER')];
  // cocok persis, dengan atau tanpa label kategori yang ditambahkan layar
  assert.equal(skuOf(matchProduct(byName, '', 'IRISH TULIP')), 'BW76');
  assert.equal(skuOf(matchProduct(byName, '', 'BABY TRYSPAN - IRISH TULIP')), 'BW76');
  assert.equal(skuOf(matchProduct(byName, '', 'irish tulip')), 'BW76');
  // salah ketik: tidak cocok otomatis, tetapi disarankan
  for (const typed of ['IRISH TULIPS', 'IRISH TULLIPS', 'IRISH TULLIP']) {
    assert.equal(matchProduct(byName, '', `BABY TRYSPAN - ${typed}`), null, typed);
    const s = suggestProducts(byName, '', `BABY TRYSPAN - ${typed}`);
    assert.equal(s[0]?.product.sku, 'BW76', `saran untuk ${typed}`);
    assert.ok(!s.some((x) => x.product.sku === 'BW80'));
  }
});

test('nama motif yang tersimpan sebagai "BABY TRYSPAN - IRISH TULIP" di kolom Nama', () => {
  const combined = [mk('BW76', 'BABY TRYSPAN - IRISH TULIP'), mk('BW80', 'BABY TRYSPAN - SPARK FLOWER')];
  assert.equal(skuOf(matchProduct(combined, '', 'BABY TRYSPAN - IRISH TULIP')), 'BW76');
  assert.equal(skuOf(matchProduct(combined, '', 'IRISH TULIP')), 'BW76');
  assert.equal(matchProduct(combined, '', 'BABY TRYSPAN - IRISH TULIPS'), null);
  assert.equal(suggestProducts(combined, '', 'BABY TRYSPAN - IRISH TULIPS')[0]?.product.sku, 'BW76');
});

test('produk yang namanya hanya kategori tidak ikut dicocokkan atau disarankan', () => {
  const junk = [mk('IRISH-TULIP', 'BABY TRYSPAN'), mk('BW80', 'BABY TRYSPAN', 'SPARK FLOWER')];
  assert.equal(matchProduct(junk, '', 'BABY TRYSPAN - KOPI HITAM'), null);
  assert.deepEqual(suggestProducts(junk, '', 'BABY TRYSPAN - KOPI HITAM'), []);
});

test('saran per kata: IRISH TULIPS mengenali "IRISH TULIP BLUE", dan saran lintas kategori diberi tanda', () => {
  const list = [
    mk('BW76', 'BABY TRYSPAN', 'IRISH TULIP BLUE'),
    mk('BW80', 'BABY TRYSPAN', 'SPARK FLOWER'),
    mk('BS-9', 'BELLA SQUARE', 'IRISH TULIP'),
  ];
  const s = suggestProducts(list, '', 'BABY TRYSPAN - IRISH TULIPS');
  const skus = s.map((x) => x.product.sku);
  assert.ok(skus.includes('BW76'), 'per kata');
  assert.ok(skus.includes('BS-9'), 'lintas kategori tetap muncul sebagai saran');
  assert.ok(!skus.includes('BW80'));
  assert.match(s.find((x) => x.product.sku === 'BS-9').reason, /kategori lain/);
  // diurutkan menurut kemiripan: yang selisih satu huruf (BS-9) lebih dulu dari yang kelebihan kata (BW76)
  assert.equal(skus[0], 'BS-9');
});

test('saran per kata tidak asal: kata umum tunggal yang pendek tidak memicu saran', () => {
  const list = [mk('BW76', 'BABY TRYSPAN', 'BLUE PEONY'), mk('BW77', 'BABY TRYSPAN', 'BLUE DAISY')];
  assert.deepEqual(suggestProducts(list, '', 'BABY TRYSPAN - BLUE'), []);
});

test('kode angka tidak disarankan dari kategori lain', () => {
  const list = [mk('BS-12', 'BELLA SQUARE'), paris('37')];
  assert.deepEqual(suggestProducts(list, 'PJ-12-2', 'PARIS JAPAN - 12-2'), []);
});

test('kasus nyata: produk lama "BABY TRYSPAN" dengan SKU "IRISH TULLIP" (motif kosong)', () => {
  const junk = mk('IRISH TULLIP', 'BABY TRYSPAN');
  const list = [junk, mk('BW80', 'BABY TRYSPAN', 'SPARK FLOWER')];
  // ketikan persis sama dengan SKU-nya: cocok
  assert.equal(skuOf(matchProduct(list, '', 'BABY TRYSPAN - IRISH TULLIP')), 'IRISH TULLIP');
  // ejaan lain: tidak cocok otomatis, tetapi disarankan
  for (const typed of ['IRISH TULIPS', 'IRISH TULIP', 'IRISH TULLIPS']) {
    assert.equal(matchProduct(list, '', `BABY TRYSPAN - ${typed}`), null, typed);
    const s = suggestProducts(list, '', `BABY TRYSPAN - ${typed}`);
    assert.equal(s[0]?.product.sku, 'IRISH TULLIP', `saran untuk ${typed}`);
    assert.ok(!s.some((x) => x.product.sku === 'BW80'));
  }
});

test('SKU berupa kode pendek tidak dianggap nama (tidak menimbulkan saran palsu)', () => {
  const list = [mk('BW83', 'BABY TRYSPAN'), mk('118W', 'BABY TRYSPAN')];
  assert.deepEqual(suggestProducts(list, '', 'BABY TRYSPAN - BW84'), []);
  assert.equal(skuOf(matchProduct(list, 'BW83', '')), 'BW83');
});

test('produk baru mengikuti kebiasaan Master (SKU = nama motif berspasi)', () => {
  for (const [rawSku, rawName] of [['', 'BABY TRYSPAN - IRISH TULIPS'], ['IRISH TULIPS', 'BABY TRYSPAN - IRISH TULIPS'], ['IRISH-TULIPS', 'BABY TRYSPAN - IRISH TULIPS']]) {
    const d = buildNewProductDraft(rawSku, rawName);
    assert.equal(d.sku, 'IRISH TULIPS', `${rawSku}|${rawName}`);
    assert.equal(d.name, 'BABY TRYSPAN');
    assert.equal(d.motif, null);
    assert.equal(d.costPrice, 25000);
    assert.equal(d.sellingPrice, 42000);
  }
  assert.equal(buildNewProductDraft('', 'BABY TRYSPAN - MINI FLOWER NUDE YELLOW').sku, 'MINI FLOWER NUDE YELLOW');
  // kode tetap kode
  assert.equal(buildNewProductDraft('BW83', 'BABY TRYSPAN').sku, 'BW83');
  assert.equal(buildNewProductDraft('', 'PARIS JAPAN - 12-2').sku, '12-2');
  assert.equal(humanCode('IRISH-TULIPS'), 'IRISH TULIPS');
  assert.equal(humanCode('12-2'), '12-2');
  assert.equal(humanCode('118W'), '118W');
});

test('produk yang dibuat dengan gaya baru dikenali lagi saat dicatat ulang (tidak membuat kembar)', () => {
  const d = buildNewProductDraft('', 'BABY TRYSPAN - IRISH TULIPS');
  const created = { id: 'x', sku: d.sku, name: d.name, motif: d.motif, isActive: true };
  assert.equal(matchProduct([created], '', 'BABY TRYSPAN - IRISH TULIPS')?.product.sku, 'IRISH TULIPS');
  assert.equal(matchProduct([created], '', 'IRISH TULIPS')?.product.sku, 'IRISH TULIPS');
  assert.equal(matchProduct([created], '', 'irish tulips')?.product.sku, 'IRISH TULIPS');
});

test('kata umum yang cuma kebetulan termuat tidak memicu saran ke semua produk sejenis', () => {
  const list = [
    { id: '1', sku: 'MONOGRAM SOFT BLUE', name: 'BABY TRYSPAN', motif: 'MONOGRAM', isActive: true },
    { id: '2', sku: 'MONOGRAM SAGE PINK', name: 'BABY TRYSPAN', motif: 'MONOGRAM', isActive: true },
    { id: '3', sku: 'MONOGRAM SOFT PINK', name: 'BABY TRYSPAN', motif: 'MONOGRAM', isActive: true },
  ];
  const skus = suggestProducts(list, '', 'BABY TRYSPAN - monogram pink', 5).map((x) => x.product.sku).sort();
  assert.deepEqual(skus, ['MONOGRAM SAGE PINK', 'MONOGRAM SOFT PINK']);
});
