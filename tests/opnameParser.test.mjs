import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpnameText,
  resolveOpnameRow,
  opnameCandidates,
  buildOpnameDraft,
} from '../src/lib/opnameParser.ts';

let n = 0;
const p = (sku, name, motif = null) => ({ id: `p${++n}`, sku, name, motif, isActive: true });
const paris = ['12', '12-2', '122', '85', '88', '112W', '101W'].map((c) => p(c, 'PARIS JAPAN'));
const tryspan = [
  p('ABS CREAMY', 'BABY TRYSPAN', null),
  p('ABS DUSTY', 'BABY TRYSPAN', null),
  p('ABS LEAFY', 'BABY TRYSPAN', null),
  p('ABS ROSE', 'BABY TRYSPAN', null),
  p('ABS SALMON', 'BABY TRYSPAN', null),
  p('ABS TREE', 'BABY TRYSPAN', null),
  p('AN BLUE', 'BABY TRYSPAN', null),
  p('AN CARAMEL', 'BABY TRYSPAN', null),
  p('AN CHOCO', 'BABY TRYSPAN', null),
  p('AN EARTH', 'BABY TRYSPAN', null),
  p('AN GREY', 'BABY TRYSPAN', null),
  p('AN MAROON', 'BABY TRYSPAN', null),
  p('BLURRY BROWN', 'BABY TRYSPAN', null),
  p('BLURRY GREY', 'BABY TRYSPAN', null),
  p('BLURRY PINK', 'BABY TRYSPAN', null),
  p('BLURRY YELLOW', 'BABY TRYSPAN', null),
  p('BLUSH PEONY', 'BABY TRYSPAN', null),
  p('BLUSH SPARKY', 'BABY TRYSPAN', null),
  p('BW67', 'BABY TRYSPAN', '-'),
  p('BW80', 'BABY TRYSPAN', '-'),
  p('BW83', 'BABY TRYSPAN', '-'),
  p('BW86', 'BABY TRYSPAN', '-'),
  p('BW88', 'BABY TRYSPAN', '-'),
  p('BW89', 'BABY TRYSPAN', '-'),
  p('ETHNIC GOLD', 'BABY TRYSPAN', null),
  p('ETHNIC MAHOGANY', 'BABY TRYSPAN', null),
  p('ETHNIC MAROON', 'BABY TRYSPAN', null),
  p('ETHNIC NUDE BLUE', 'BABY TRYSPAN', null),
  p('ETHNIC PINK', 'BABY TRYSPAN', null),
  p('FLORAL ABSTRACT', 'BABY TRYSPAN', null),
  p('FLORAL YELLOW', 'BABY TRYSPAN', null),
  p('GRADIENT BLUE', 'BABY TRYSPAN', null),
  p('GRADIENT BROWN', 'BABY TRYSPAN', null),
  p('GRADIENT MELON PINK', 'BABY TRYSPAN', null),
  p('GRADIENT PINK YELLOW', 'BABY TRYSPAN', null),
  p('GRADIENT SOFT LEMON', 'BABY TRYSPAN', null),
  p('IRISH TULLIP', 'BABY TRYSPAN', null),
  p('MATCHA STRAWFLORA', 'BABY TRYSPAN', null),
  p('MINI FLOWER DENIM', 'BABY TRYSPAN', null),
  p('MINI FLOWER MAHOGANY', 'BABY TRYSPAN', null),
  p('MINI FLOWER MAROON', 'BABY TRYSPAN', null),
  p('MINI FLOWER PINK', 'BABY TRYSPAN', null),
  p('MINI FLOWER SOFT BLUE', 'BABY TRYSPAN', null),
  p('MINI FLOWER YELLOW', 'BABY TRYSPAN', null),
  p('MONOGRAM BLACK', 'BABY TRYSPAN', null),
  p('MONOGRAM BUTTER YELLOW', 'BABY TRYSPAN', 'MONOGRAM'),
  p('MONOGRAM GREY', 'BABY TRYSPAN', 'MONOGRAM'),
  p('MONOGRAM NAVY', 'BABY TRYSPAN', null),
  p('MONOGRAM NUDE BLACK', 'BABY TRYSPAN', 'MONOGRAM'),
  p('MONOGRAM SAGE PINK', 'BABY TRYSPAN', 'MONOGRAM'),
  p('MONOGRAM SOFT BLUE', 'BABY TRYSPAN', 'MONOGRAM'),
  p('MONOGRAM SOFT PINK', 'BABY TRYSPAN', 'MONOGRAM'),
  p('OCEAN BLUE', 'BABY TRYSPAN', null),
  p('PINK BLOOMY', 'BABY TRYSPAN', null),
  p('PINK PAINY', 'BABY TRYSPAN', null),
  p('PURPLE PEONY', 'BABY TRYSPAN', null),
  p('SAKURA BLOOM', 'BABY TRYSPAN', null),
  p('SPARK FLOWER', 'BABY TRYSPAN', null),
  p('STRAWBERRY MATCHA', 'BABY TRYSPAN', null),
];
const products = [...paris, ...tryspan];

const LIST = `Nama\tMotif\tSisa stok\nBlack\tMonogram\t0\nNude Black\tMonogram\t1\nGrey\tMonogram\t2\nNavy\tMonogram\t\nSage - Pink\tMonogram\t2\nSoft Blue\tMonogram\t\nSoft Pink\tMonogram\t\nButter Yellow\tMonogram\t2\nPink Painy\tOwn\t0\nStrawberry Matcha\tOwn\t5\nSakura Bloom\tOwn\t0\nPink Bloomy\tOwn\t4\nBlush Peony\tOwn\t0\nBlush Sparky\tOwn\t0\nSpark Flower\tOwn\t3\nFloral Yellow\tFloral Abstract\t3\nIrish Tullip\tFloral Abstract\t5\nMatcha Strawflora\tFloral Abstract\t0\nFloral Abstract\tFloral Abstract\t4\nPurple peony\tOwn\t2\nOcean Blue\tOwn\t2\nEarth\tAN\t\nGrey\tAN\t4\nMaroon\tAN\t\nBlue\tAN\t8\nBlack\tAN\t\nCaramel\tAN\t\nChoco\tAN\t\nSalmon\tABS\t0\nTree\tABS\t0\nLeafy\tABS\t0\nDusty\tABS\t0\nRose\tABS\t0\nCreamy\tABS\t0\nMahogany\tGRA\t0\nBlue\tGRA\t6\nMelon pink\tGRA\t9\nSoft lemon\tGRA\t4\nPink yellow\tGRA\t1\nRed\tPolka\t1\nBrown\tPolka\t4\nPink\tPolka\t2\nBlue\tPolka\t1\nNude\tPolka\t1\nSage\tPolka\t2\nBrown\tBlurry\t1\nGrey\tBlurry\t0\nPink\tBlurry\t0\nYellow\tBlurry\t5\nMahogany\tEthnic\t0\nPink\tEthnic\t2\nGold\tEthnic\t3\nNude blue\tEthnic\t0\nMaroon\tEthnic\t0\nMahogany\tMini flower\t2\nDenim\tMini flower\t0\nPink\tMini flower\t1\nMaroon\tMini flower\t3\nNude yellow\tMini flower\t1\nSoft blue\tMini flower\t3\nMocca\tGarden\t4\nSky\tGarden\t0`;

test('daftar asli: judul kolom dilewati, 62 baris terbaca, jumlah kosong = null', () => {
  const rows = parseOpnameText(LIST);
  assert.equal(rows.length, 62);
  assert.equal(rows.filter((r) => r.error).length, 0);
  const navy = rows.find((r) => r.rawName === 'Navy');
  assert.equal(navy.qty, null);
  const black = rows.find((r) => r.rawName === 'Black' && r.rawCollection === 'Monogram');
  assert.equal(black.qty, 0);
  assert.equal(rows.find((r) => r.rawName === 'Blue' && r.rawCollection === 'AN').qty, 8);
});

test('daftar asli: 51 baris cocok persis dengan Master, 11 belum ada', () => {
  const rows = parseOpnameText(LIST);
  const resolved = rows.map((r) => ({ r, m: resolveOpnameRow(products, r) }));
  const missing = resolved.filter((x) => !x.m.product).map((x) => `${x.r.rawCollection} ${x.r.rawName}`);
  assert.equal(resolved.filter((x) => x.m.product).length, 51);
  assert.deepEqual(
    missing.sort(),
    ['AN Black', 'GRA Mahogany', 'Garden Mocca', 'Garden Sky', 'Mini flower Nude yellow', 'Polka Blue', 'Polka Brown', 'Polka Nude', 'Polka Pink', 'Polka Red', 'Polka Sage'].sort(),
  );
});

test('pemetaan koleksi: GRA->GRADIENT, Own/Floral Abstract tanpa awalan, nama berstrip', () => {
  const find = (name, coll) => resolveOpnameRow(products, { line: 1, rawName: name, rawCollection: coll, qty: 1 }).product?.sku;
  assert.equal(find('Melon pink', 'GRA'), 'GRADIENT MELON PINK');
  assert.equal(find('Blue', 'GRA'), 'GRADIENT BLUE');
  assert.equal(find('Blue', 'AN'), 'AN BLUE');
  assert.equal(find('Tree', 'ABS'), 'ABS TREE');
  assert.equal(find('Sage - Pink', 'Monogram'), 'MONOGRAM SAGE PINK');
  assert.equal(find('Irish Tullip', 'Floral Abstract'), 'IRISH TULLIP');
  assert.equal(find('Floral Abstract', 'Floral Abstract'), 'FLORAL ABSTRACT');
  assert.equal(find('Blush Peony', 'Own'), 'BLUSH PEONY');
  assert.equal(find('Purple peony', 'Own'), 'PURPLE PEONY');
  assert.equal(find('Nude blue', 'Ethnic'), 'ETHNIC NUDE BLUE');
});

test('nama yang sama di koleksi berbeda tidak tertukar', () => {
  const find = (name, coll) => resolveOpnameRow(products, { line: 1, rawName: name, rawCollection: coll, qty: 1 }).product?.sku;
  assert.equal(find('Pink', 'Ethnic'), 'ETHNIC PINK');
  assert.equal(find('Pink', 'Blurry'), 'BLURRY PINK');
  assert.equal(find('Pink', 'Mini flower'), 'MINI FLOWER PINK');
  assert.equal(find('Grey', 'AN'), 'AN GREY');
  assert.equal(find('Grey', 'Monogram'), 'MONOGRAM GREY');
  assert.equal(find('Grey', 'Blurry'), 'BLURRY GREY');
  // Polka belum ada: TIDAK boleh nyasar ke "POLKA"-lain atau ke warna yang sama di koleksi lain
  assert.equal(find('Pink', 'Polka'), undefined);
  assert.equal(find('Red', 'Polka'), undefined);
});

test('Mini flower Nude yellow: tidak otomatis dipilih, MINI FLOWER YELLOW muncul sebagai saran', () => {
  const m = resolveOpnameRow(products, { line: 1, rawName: 'Nude yellow', rawCollection: 'Mini flower', qty: 1 });
  assert.equal(m.product, null);
  assert.ok(m.suggestions.some((s) => s.product.sku === 'MINI FLOWER YELLOW'), JSON.stringify(m.suggestions.map((s) => s.product.sku)));
});

test('Paris Japan: 12, 12-2, dan 122 berbeda; PJ- boleh ada', () => {
  const sku = (text) => resolveOpnameRow(products, parseOpnameText(text)[0]).product?.sku;
  assert.equal(sku('12-2\t5'), '12-2');
  assert.equal(sku('12\t5'), '12');
  assert.equal(sku('122\t5'), '122');
  assert.equal(sku('PJ-88\t2'), '88');
  assert.equal(sku('112w = 3'), '112W');
  assert.equal(sku('13-2\t1'), undefined);
});

test('format jumlah dan pemisah', () => {
  const r = (t) => parseOpnameText(t)[0];
  assert.deepEqual([r('12-2 = 5').rawName, r('12-2 = 5').qty], ['12-2', 5]);
  assert.equal(r('BLUSH PEONY: 3').qty, 3);
  assert.equal(r('85;4').qty, 4);
  assert.equal(r('85,4').qty, 4);
  assert.equal(r('Navy\tMonogram').qty, null);
  assert.equal(r('Navy\tMonogram').rawCollection, 'Monogram');
  assert.match(r('Navy\tMonogram\tbanyak').error, /tidak terbaca/);
  assert.equal(parseOpnameText('\n\n').length, 0);
});

test('kandidat SKU dan rancangan produk baru mengikuti gaya Master', () => {
  assert.deepEqual(opnameCandidates({ rawName: 'Melon pink', rawCollection: 'GRA' }), ['GRADIENT MELON PINK', 'MELON PINK']);
  assert.deepEqual(opnameCandidates({ rawName: 'Irish Tullip', rawCollection: 'Floral Abstract' }), ['IRISH TULLIP']);
  const polka = buildOpnameDraft({ rawName: 'Red', rawCollection: 'Polka' });
  assert.equal(polka.sku, 'POLKA RED');
  assert.equal(polka.name, 'BABY TRYSPAN');
  assert.equal(polka.motif, 'POLKA');
  assert.equal(polka.color, 'RED');
  const garden = buildOpnameDraft({ rawName: 'Mocca', rawCollection: 'Garden' });
  assert.equal(garden.sku, 'GARDEN MOCCA');
  const pj = buildOpnameDraft({ rawName: '13-2', rawCollection: '' });
  assert.equal(pj.sku, '13-2');
  assert.equal(pj.name, 'PARIS JAPAN');
  const own = buildOpnameDraft({ rawName: 'Sunny Day', rawCollection: 'Own' });
  assert.equal(own.sku, 'SUNNY DAY');
  assert.equal(own.name, 'BABY TRYSPAN');
  assert.equal(own.motif, null);
});
