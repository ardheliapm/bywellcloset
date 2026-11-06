import type { Prisma } from '@prisma/client';
import { allocateStockToWaitingPreOrders } from './preOrderFulfillment';

type TransactionClient = Prisma.TransactionClient;

export interface ReconcileResult {
  /** Stok yang ditahan order HOLD (tidak bisa dilepas otomatis) */
  holdReserved: number;
  /** Jumlah pcs yang dikembalikan ke antrean PO karena stok fisik tidak cukup */
  releasedFromPo: number;
  /** Jumlah pcs yang baru dialokasikan ke PO yang menunggu */
  allocatedToPo: number;
  /** true bila order HOLD saja sudah menahan lebih banyak dari stok fisik */
  holdExceedsPhysical: boolean;
}

/** Status PO yang benar berdasarkan jumlah pesan / siap / kirim (sama dengan Sinkronkan Alokasi). */
export function poStatusFromQuantities(
  items: { quantityOrdered: number; quantityFulfilled: number; quantityShipped: number }[],
): string {
  const ordered = items.reduce((a, it) => a + it.quantityOrdered, 0);
  const fulfilled = items.reduce((a, it) => a + it.quantityFulfilled, 0);
  const shipped = items.reduce((a, it) => a + it.quantityShipped, 0);
  if (ordered > 0 && shipped >= ordered) return 'SHIPPED';
  if (ordered > 0 && fulfilled >= ordered) return 'READY';
  if (fulfilled > 0 || shipped > 0) return shipped > 0 ? 'PARTIAL_SHIPPED' : 'PARTIAL_READY';
  return 'WAITING_STOCK';
}

/**
 * Setelah stok fisik sebuah produk berubah (stok opname), samakan penahanan stok dengan kenyataan:
 * 1. Stok yang ditahan untuk PO tidak boleh melebihi stok fisik. Kalau berlebih, PO yang paling
 *    baru dikembalikan menunggu lebih dulu (PO terlama tetap terlayani).
 * 2. Kalau stok fisik lebih besar dari tahanan, sisanya dibagikan ke PO yang menunggu (terlama dulu).
 * Order HOLD tidak diubah, hanya dilaporkan.
 */
export async function reconcileProductAllocation(
  tx: TransactionClient,
  productId: string,
): Promise<ReconcileResult> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });

  const hold = await tx.orderItem.aggregate({
    _sum: { quantity: true },
    where: { productId, order: { status: 'HOLD' } },
  });
  const holdReserved = hold._sum.quantity ?? 0;

  const poItems = await tx.preOrderItem.findMany({
    where: { productId, preOrder: { status: { notIn: ['CANCELLED', 'SHIPPED'] } } },
    orderBy: { createdAt: 'asc' },
  });

  let budget = Math.max(0, product.physicalStock - holdReserved);
  let keptPoHeld = 0;
  let releasedFromPo = 0;
  const touchedPoIds = new Set<string>();

  for (const it of poItems) {
    const held = Math.max(0, it.quantityFulfilled - it.quantityShipped);
    const keep = Math.min(held, budget);
    budget -= keep;
    keptPoHeld += keep;
    if (keep < held) {
      await tx.preOrderItem.update({
        where: { id: it.id },
        data: { quantityFulfilled: it.quantityShipped + keep },
      });
      releasedFromPo += held - keep;
      touchedPoIds.add(it.preOrderId);
    }
  }

  const reserved = holdReserved + keptPoHeld;
  await tx.product.update({ where: { id: productId }, data: { reservedStock: reserved } });

  for (const poId of touchedPoIds) {
    const items = await tx.preOrderItem.findMany({ where: { preOrderId: poId } });
    await tx.preOrder.update({ where: { id: poId }, data: { status: poStatusFromQuantities(items) } });
  }

  let allocatedToPo = 0;
  const available = product.physicalStock - reserved;
  if (available > 0) {
    const res = await allocateStockToWaitingPreOrders(
      tx,
      { ...product, reservedStock: reserved },
      available,
    );
    allocatedToPo = res.allocatedCount;
  }

  return {
    holdReserved,
    releasedFromPo,
    allocatedToPo,
    holdExceedsPhysical: holdReserved > product.physicalStock,
  };
}
