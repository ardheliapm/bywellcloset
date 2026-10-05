import { Prisma } from '@prisma/client';

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
 * Strict, accurate matching between a product and a PO item.
 * Prevents false positives between different motifs/SKUs.
 */
export function isProductMatchItem(
  product: { id: string; sku: string; name: string; motif?: string | null },
  item: ItemReference
): boolean {
  if (item.productId && item.productId === product.id) return true;

  const pSku = (product.sku || '').trim().toLowerCase();
  const pCleanSku = pSku.replace(/[^a-z0-9]/g, '');

  const itSku = (item.productSku || '').trim().toLowerCase();
  const itCleanSku = itSku.replace(/[^a-z0-9]/g, '');

  const itName = (item.productName || '').trim().toLowerCase();
  const pMotif = (product.motif || '').trim().toLowerCase();

  // 1. Exact SKU match (e.g. "BW81" === "BW81")
  if (itSku && pSku && itSku === pSku) return true;

  // 2. Clean alphanumeric SKU exact match (e.g. "BW-81" === "bw81")
  if (itCleanSku && pCleanSku && pCleanSku.length >= 2 && itCleanSku === pCleanSku) return true;

  // 3. Exact Motif match (e.g. "SPARK FLOWER" === "SPARK FLOWER")
  if (pMotif && (itSku === pMotif || itName === pMotif)) return true;

  // 4. Exact combined name & motif
  const pFullName = `${product.name} ${product.motif || ''}`.trim().toLowerCase();
  if (pFullName && (itName === pFullName || itSku === pFullName)) return true;

  // 5. If item name contains product SKU as an exact token/word (e.g. "BABY TRYSPAN BW81")
  if (pSku.length >= 3 && (itName === pSku || itName.includes(` ${pSku}`) || itName.includes(`${pSku} `) || itName.startsWith(`${pSku}-`))) {
    return true;
  }

  return false;
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

  // 1. Find all waiting Pre-Order items
  const waitingPoItems = await tx.preOrderItem.findMany({
    where: {
      preOrder: {
        status: { in: ['WAITING_STOCK', 'PARTIAL_READY'] },
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
