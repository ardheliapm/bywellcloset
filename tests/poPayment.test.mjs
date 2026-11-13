import test from 'node:test';
import assert from 'node:assert/strict';
import { paidOf, remainingOf, isFullyPaid, readyRemaining } from '../src/lib/poPayment.ts';

test('PO baru belum bayar', () => {
  const po = { totalAmount: 252000, paymentStatus: 'UNPAID', paidAmount: 0 };
  assert.equal(paidOf(po), 0);
  assert.equal(remainingOf(po), 252000);
  assert.equal(isFullyPaid(po), false);
});

test('cicilan: dibayar 84.000 dari 252.000', () => {
  const po = { totalAmount: 252000, paymentStatus: 'UNPAID', paidAmount: 84000 };
  assert.equal(paidOf(po), 84000);
  assert.equal(remainingOf(po), 168000);
  assert.equal(isFullyPaid(po), false);
});

test('PO lama berstatus PAID tanpa paidAmount dianggap lunas', () => {
  const po = { totalAmount: 100000, paymentStatus: 'PAID', paidAmount: 0 };
  assert.equal(paidOf(po), 100000);
  assert.equal(isFullyPaid(po), true);
});

test('dibayar lebih dari total: sisa tidak negatif', () => {
  const po = { totalAmount: 100000, paymentStatus: 'PAID', paidAmount: 120000 };
  assert.equal(remainingOf(po), 0);
  assert.equal(isFullyPaid(po), true);
});

test('lunasi bagian yang siap: nilai siap 126.000, sudah bayar 84.000 -> 42.000', () => {
  const po = { totalAmount: 252000, paymentStatus: 'UNPAID', paidAmount: 84000 };
  const items = [
    { price: 42000, quantityFulfilled: 1, quantityShipped: 0 },
    { price: 42000, quantityFulfilled: 1, quantityShipped: 0 },
    { price: 42000, quantityFulfilled: 1, quantityShipped: 0 },
    { price: 42000, quantityFulfilled: 0, quantityShipped: 0 },
  ];
  assert.equal(readyRemaining(po, items), 42000);
});

test('bagian siap sudah terbayar: 0', () => {
  const po = { totalAmount: 252000, paymentStatus: 'UNPAID', paidAmount: 126000 };
  const items = [{ price: 42000, quantityFulfilled: 3, quantityShipped: 0 }];
  assert.equal(readyRemaining(po, items), 0);
});
