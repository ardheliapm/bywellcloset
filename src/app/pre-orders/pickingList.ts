import type { PreOrderRecord } from './actions.ts';

export interface PickingLine {
  poNumber: string;
  sku: string;
  name: string;
  /** Sudah siap/disisihkan, belum dikirim */
  ready: number;
  /** Masih menunggu stok (produksi / barang datang) */
  waiting: number;
}

export interface PickingCustomer {
  customer: string;
  phone: string | null;
  notes: string[];
  lines: PickingLine[];
  readyTotal: number;
  waitingTotal: number;
}

/** Daftar sisih per customer dari PO aktif: berapa yang sudah disisihkan dan berapa yang masih menunggu. */
export function buildPickingList(preOrders: PreOrderRecord[]): PickingCustomer[] {
  const byCustomer = new Map<string, PickingCustomer>();
  const active = preOrders
    .filter((po) => po.status !== 'CANCELLED' && po.status !== 'SHIPPED')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const po of active) {
    const lines: PickingLine[] = [];
    for (const it of po.items) {
      const ready = Math.max(0, it.quantityFulfilled - it.quantityShipped);
      const waiting = Math.max(0, it.quantityOrdered - it.quantityFulfilled);
      if (ready === 0 && waiting === 0) continue;
      lines.push({
        poNumber: po.poNumber,
        sku: it.product?.sku || it.productSku,
        name: it.productName,
        ready,
        waiting,
      });
    }
    if (lines.length === 0) continue;

    const key = po.customerName.trim().toLowerCase();
    let c = byCustomer.get(key);
    if (!c) {
      c = { customer: po.customerName.trim(), phone: po.customerPhone, notes: [], lines: [], readyTotal: 0, waitingTotal: 0 };
      byCustomer.set(key, c);
    }
    if (!c.phone && po.customerPhone) c.phone = po.customerPhone;
    if (po.notes && po.notes.trim()) c.notes.push(`#${po.poNumber}: ${po.notes.trim()}`);
    for (const l of lines) {
      c.lines.push(l);
      c.readyTotal += l.ready;
      c.waitingTotal += l.waiting;
    }
  }
  return [...byCustomer.values()].sort((a, b) => a.customer.localeCompare(b.customer, 'id'));
}
