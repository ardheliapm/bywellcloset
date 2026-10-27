import type { Prisma } from '@prisma/client';
import { matchProduct } from './productMatching';

type TransactionClient = Prisma.TransactionClient;

export interface ProductReference {
  id: string;
  sku: string;
  name: string;
  motif?: string | null;
  color?: string | null;
  physicalStock: number;
  reservedStock: number;
}

export interface ItemReference {
  productId?: string | null;
  productSku?: string | null;
  productName?: string | null;
}

/**
 * Mencocokkan item Pre-Order dengan sebuah produk.
 * - Item yang sudah terhubung (productId) HARUS sama dengan produk tersebut.
 * - Item tanpa productId dicocokkan lewat aturan bersama di productMatching.ts: kode dicocokkan
 *   PERSIS ("12", "12-2", dan "122" berbeda), awalan PJ-/BT-/BS-/BW- boleh ada atau tidak.
 *   Salah ketik tidak dicocokkan otomatis.
 */
export function isProductMatchItem(
  product: { id: string; sku: string; name: string; motif?: string | null },
  item: ItemReference
): boolean {
  if (item.productId) {
    return item.productId === product.id;
  }
  return matchProduct([product], item.productSku || '', item.productName || '') !== null;
}

/**
 * Automatically allocates available physical stock of a product to waiting Pre-Orders (FIFO: oldest PO first).
 */
export async function allocateStockToWaitingPreOrders(
  tx: TransactionClient,
  product: ProductReference,
  availableQtyToAllocate: number
): Promise<{ allocatedCount: number; poNumbers: string[] }> {
  if (availableQtyToAllocate <= 0) {
    return { allocatedCount: 0, poNumbers: [] };
  }

  let remainingQty = availableQtyToAllocate;
  const fulfilledPoNumbers: string[] = [];

  // 1. Find all waiting Pre-Order items from active POs
  const waitingPoItems = await tx.preOrderItem.findMany({
    where: {
      preOrder: {
        status: { notIn: ['CANCELLED', 'SHIPPED'] },
      },
    },
    include: {
      preOrder: true,
    },
    orderBy: {
      createdAt: 'asc', // FIFO
    },
  });

  // 2. Filter strictly matching items
  const matchingItems = waitingPoItems.filter((it) => {
    if (it.quantityFulfilled >= it.quantityOrdered) return false;
    return isProductMatchItem(product, it);
  });

  // 3. Allocate stock FIFO
  for (const poItem of matchingItems) {
    if (remainingQty <= 0) break;

    const neededQty = poItem.quantityOrdered - poItem.quantityFulfilled;
    if (neededQty <= 0) continue;

    const allocateQty = Math.min(remainingQty, neededQty);
    const newFulfilled = poItem.quantityFulfilled + allocateQty;
    remainingQty -= allocateQty;

    // Update PreOrderItem
    await tx.preOrderItem.update({
      where: { id: poItem.id },
      data: {
        quantityFulfilled: newFulfilled,
        productId: product.id, // link explicitly
      },
    });

    // Increment reservedStock on product
    await tx.product.update({
      where: { id: product.id },
      data: {
        reservedStock: { increment: allocateQty },
      },
    });

    fulfilledPoNumbers.push(poItem.preOrder.poNumber);

    // 4. Check if whole PO is READY or PARTIAL_READY
    const siblingItems = await tx.preOrderItem.findMany({
      where: { preOrderId: poItem.preOrderId },
    });

    const isAllReady = siblingItems.every(
      (s) => (s.id === poItem.id ? newFulfilled : s.quantityFulfilled) >= s.quantityOrdered
    );

    await tx.preOrder.update({
      where: { id: poItem.preOrderId },
      data: {
        status: isAllReady ? 'READY' : 'PARTIAL_READY',
      },
    });
  }

  const totalAllocated = availableQtyToAllocate - remainingQty;
  return {
    allocatedCount: totalAllocated,
    poNumbers: Array.from(new Set(fulfilledPoNumbers)),
  };
}

export interface BatchAllocationItem {
  product: ProductReference;
  availableQty: number;
}

export interface BatchAllocationResult {
  allocationsByProductId: Map<string, { allocatedCount: number; poNumbers: string[] }>;
  totalAllocatedCount: number;
  poFulfillmentNotes: string[];
}

/**
 * High-performance batch allocation of stock to waiting Pre-Orders (FIFO).
 * Fetches all waiting pre-orders and items in 1 single query instead of N queries,
 * and updates pre-orders only once per affected pre-order.
 */
export async function allocateStockToWaitingPreOrdersBatch(
  tx: TransactionClient,
  itemsToAllocate: BatchAllocationItem[]
): Promise<BatchAllocationResult> {
  const result: BatchAllocationResult = {
    allocationsByProductId: new Map(),
    totalAllocatedCount: 0,
    poFulfillmentNotes: [],
  };

  const validItems = itemsToAllocate.filter((it) => it.availableQty > 0);
  if (validItems.length === 0) {
    return result;
  }

  // 1. Fetch ALL waiting Pre-Orders and their items in ONE query
  const waitingPreOrders = await tx.preOrder.findMany({
    where: {
      status: { notIn: ['CANCELLED', 'SHIPPED'] },
    },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: {
      createdAt: 'asc', // FIFO
    },
  });

  if (waitingPreOrders.length === 0) {
    return result;
  }

  const affectedPreOrderIds = new Set<string>();
  const modifiedPoItems = new Map<string, { id: string; quantityFulfilled: number; productId: string }>();

  for (const alloc of validItems) {
    let remainingQty = alloc.availableQty;
    const fulfilledPoNumbers: string[] = [];

    for (const po of waitingPreOrders) {
      if (remainingQty <= 0) break;

      for (const poItem of po.items) {
        if (remainingQty <= 0) break;
        if (poItem.quantityFulfilled >= poItem.quantityOrdered) continue;

        if (isProductMatchItem(alloc.product, poItem)) {
          const neededQty = poItem.quantityOrdered - poItem.quantityFulfilled;
          if (neededQty <= 0) continue;

          const allocateQty = Math.min(remainingQty, neededQty);
          poItem.quantityFulfilled += allocateQty;
          poItem.productId = alloc.product.id;
          remainingQty -= allocateQty;

          modifiedPoItems.set(poItem.id, {
            id: poItem.id,
            quantityFulfilled: poItem.quantityFulfilled,
            productId: alloc.product.id,
          });

          affectedPreOrderIds.add(po.id);
          fulfilledPoNumbers.push(po.poNumber);
        }
      }
    }

    const totalAllocatedForProduct = alloc.availableQty - remainingQty;
    const uniquePoNumbers = Array.from(new Set(fulfilledPoNumbers));

    result.allocationsByProductId.set(alloc.product.id, {
      allocatedCount: totalAllocatedForProduct,
      poNumbers: uniquePoNumbers,
    });

    result.totalAllocatedCount += totalAllocatedForProduct;

    if (totalAllocatedForProduct > 0) {
      result.poFulfillmentNotes.push(
        `+${totalAllocatedForProduct} pcs untuk PO #${uniquePoNumbers.join(', #')}`
      );
    }
  }

  // 2. Persist modified PreOrderItems
  for (const itemUpd of modifiedPoItems.values()) {
    await tx.preOrderItem.update({
      where: { id: itemUpd.id },
      data: {
        quantityFulfilled: itemUpd.quantityFulfilled,
        productId: itemUpd.productId,
      },
    });
  }

  // 3. Update status of affected Pre-Orders
  for (const po of waitingPreOrders) {
    if (!affectedPreOrderIds.has(po.id)) continue;

    const isAllReady = po.items.every(
      (it) => it.quantityFulfilled >= it.quantityOrdered
    );
    const targetStatus = isAllReady ? 'READY' : 'PARTIAL_READY';

    if (po.status !== targetStatus) {
      await tx.preOrder.update({
        where: { id: po.id },
        data: { status: targetStatus },
      });
      po.status = targetStatus;
    }
  }

  return result;
}

