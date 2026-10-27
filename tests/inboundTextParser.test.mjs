import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInboundLine, parseInboundText } from '../src/lib/inboundTextParser.ts';

const one = (line) => {
  const r = parseInboundLine(line);
  return r ? `${r.name}|${r.qty}` : null;
};

test('kode dengan tanda "-" tidak terpotong: 12-2 tetap 12-2', () => {
  assert.equal(one('12-2(50)'), '12-2|50');
  assert.equal(one('12-2 (50)'), '12-2|50');
  assert.equal(one('paris japan 12-2 (50)'), 'paris japan 12-2|50');
  assert.equal(one('12-2 50'), '12-2|50');
  assert.equal(one('12-2 50 pcs'), '12-2|50');
  assert.equal(one('12-2 x 50'), '12-2|50');
  assert.equal(one('37-1(20)'), '37-1|20');
  assert.equal(one('PJ-12-2 = 30'), 'PJ-12-2|30');
});

test('tanpa jumlah: kode utuh dan jumlah bawaan 1 (ditandai qtyGiven=false)', () => {
  const r = parseInboundLine('paris japan 12-2');
  assert.equal(r.name, 'paris japan 12-2');
  assert.equal(r.qty, 1);
  assert.equal(r.qtyGiven, false);
  assert.equal(parseInboundLine('12-2').name, '12-2');
  assert.equal(parseInboundLine('37-1').name, '37-1');
});

test('format lama tetap jalan', () => {
  assert.equal(one('152(50)'), '152|50');
  assert.equal(one('123(30)'), '123|30');
  assert.equal(one('SPARK FLOWER(40)'), 'SPARK FLOWER|40');
  assert.equal(one('BW83(20)'), 'BW83|20');
  assert.equal(one('152 - 50'), '152|50');
  assert.equal(one('152: 50'), '152|50');
  assert.equal(one('152 = 50'), '152|50');
  assert.equal(one('152x50'), '152|50');
  assert.equal(one('152 x 50'), '152|50');
  assert.equal(one('IRISH TULIP 40'), 'IRISH TULIP|40');
  assert.equal(one('SPARK FLOWER 40 pcs'), 'SPARK FLOWER|40');
});

test('nomor urut dan butir dibuang, tetapi bukan bagian dari kode', () => {
  assert.equal(one('1. 12-2(50)'), '12-2|50');
  assert.equal(one('2) 152(30)'), '152|30');
  assert.equal(one('- 12-2 (50)'), '12-2|50');
  assert.equal(one('• SPARK FLOWER (40)'), 'SPARK FLOWER|40');
});

test('kata berakhiran x tidak dipotong: "Mix 40" tetap Mix', () => {
  assert.equal(one('Mix 40'), 'Mix|40');
});

test('baris total dan judul diabaikan', () => {
  assert.equal(parseInboundLine('Total 130'), null);
  assert.equal(parseInboundLine('Jumlah: 130'), null);
  assert.equal(parseInboundLine('   '), null);
});

test('baris pertama berisi kode ber-"-" TIDAK dianggap nomor invoice', () => {
  const r = parseInboundText('12-2 50\n37-1 20');
  assert.equal(r.invoiceNumber, null);
  assert.deepEqual(r.items.map((i) => `${i.name}|${i.qty}`), ['12-2|50', '37-1|20']);
});

test('nomor invoice dan pemasok dikenali, item sesudahnya utuh', () => {
  const r = parseInboundText('SJ-20261027-01\nKonveksi Bandung\npj-12-2(50)\nIRISH TULIP (40)\nTotal 90');
  assert.equal(r.invoiceNumber, 'SJ-20261027-01');
  assert.equal(r.supplierName, 'Konveksi Bandung');
  assert.deepEqual(r.items.map((i) => `${i.name}|${i.qty}`), ['pj-12-2|50', 'IRISH TULIP|40']);
});

test('baris berisi angka tidak salah dikira nama pemasok', () => {
  const r = parseInboundText('paris japan 12-2\nirish tulip 40');
  assert.equal(r.supplierName, null);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].name, 'paris japan 12-2');
});

test('teks kosong', () => {
  assert.deepEqual(parseInboundText(''), { invoiceNumber: null, supplierName: null, items: [] });
});
