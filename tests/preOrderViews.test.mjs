import test from 'node:test';
import assert from 'node:assert/strict';
import { findLinkableItems } from '../src/app/pre-orders/linkableItems.ts';
import { buildPickingList } from '../src/app/pre-orders/pickingList.ts';

const products = [
  { id: 'p1', sku: 'GRADIENT BLUE', name: 'BABY TRYSPAN', motif: 'GRADIENT', isActive: true },
  { id: 'p2', sku: 'ABS TREE', name: 'BABY TRYSPAN', motif: 'ABS', isActive: true },
  { id: 'p3', sku: '12-2', name: 'PARIS JAPAN', motif: null, isActive: true },
];
let n = 0;
const item = (o) => ({ id: `i${++n}`, preOrderId: 'x', productId: null, productSku: '', productName: '', price: 0, quantityOrdered: 1, quantityFulfilled: 0, quantityShipped: 0, subtotal: 0, createdAt: new Date(), updatedAt: new Date(), ...o });
const po = (o) => ({ id: `po${++n}`, poNumber: `${n}`, customerName: 'A', customerPhone: null, status: 'WAITING_STOCK', totalAmount: 0, paymentStatus: 'UNPAID', paidAt: null, shippedAt: null, notes: null, createdAt: new Date(2026, 9, n), updatedAt: new Date(), items: [], ...o });

test('findLinkableItems: hanya item aktif, belum terhubung, tidak bisa dicocokkan otomatis', () => {
  const pos = [
    po({ customerName: 'A', items: [item({ productSku: 'ABS THREE', productName: 'ABS THREE' })] }), // salah ketik -> perlu tautan
    po({ customerName: 'B', items: [item({ productSku: 'GRADIENT BLUE', productName: 'GRADIENT BLUE' })] }), // cocok persis -> tidak
    po({ customerName: 'C', items: [item({ productSku: '12-2', productName: 'PARIS JAPAN' })] }), // cocok kode -> tidak
    po({ customerName: 'D', items: [item({ productId: 'p1', productSku: 'xx', productName: 'xx' })] }), // sudah terhubung -> tidak
    po({ customerName: 'E', status: 'CANCELLED', items: [item({ productSku: 'ZZZ SALAH', productName: 'ZZZ SALAH' })] }), // batal -> tidak
    po({ customerName: 'F', items: [item({ productSku: 'GRADIANT BLUE', productName: 'GRADIANT BLUE', quantityFulfilled: 1 })] }), // sudah siap -> tidak
  ];
  const out = findLinkableItems(pos, products);
  assert.deepEqual(out.map((x) => x.po.customerName), ['A']);
});

test('buildPickingList: kelompok per customer, siap vs menunggu, PO selesai/batal tidak ikut, catatan terbawa', () => {
  const pos = [
    po({ customerName: 'Sinta', notes: 'produksi, OTW tgl 12', items: [
      item({ productSku: 'ABS TREE', productName: 'ABS TREE', productId: 'p2', quantityOrdered: 3, quantityFulfilled: 2, quantityShipped: 0 }),
      item({ productSku: '12-2', productName: 'PARIS JAPAN', quantityOrdered: 1 }),
    ] }),
    po({ customerName: ' sinta ', items: [item({ productSku: 'GRADIENT BLUE', productName: 'GRADIENT BLUE', quantityOrdered: 2, quantityFulfilled: 2 })] }),
    po({ customerName: 'Budi', status: 'SHIPPED', items: [item({ quantityOrdered: 1, quantityFulfilled: 1, quantityShipped: 1 })] }),
    po({ customerName: 'Rina', status: 'CANCELLED', items: [item({ quantityOrdered: 1 })] }),
    po({ customerName: 'Dewi', items: [item({ productSku: 'X', productName: 'X', quantityOrdered: 2, quantityFulfilled: 2, quantityShipped: 2 })] }),
  ];
  const list = buildPickingList(pos);
  assert.deepEqual(list.map((c) => c.customer), ['Sinta']);
  const s = list[0];
  assert.equal(s.readyTotal, 4); // 2 + 2
  assert.equal(s.waitingTotal, 2); // 1 (ABS) + 1 (12-2)
  assert.equal(s.lines.length, 3);
  assert.equal(s.notes.length, 1);
  assert.match(s.notes[0], /OTW tgl 12/);
});
