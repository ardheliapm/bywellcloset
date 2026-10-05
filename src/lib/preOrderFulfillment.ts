import { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

interface ProductReference {
  id: string;
  sku: string;
  name: string;
  motif?: string | null;
  color?: string | null;
  physicalStock: number;
  reservedStock: number;
}

/**
 * Automatically allocates available physical stock of a product to waiting Pre-Orders (FIFO: oldest PO first).
 * Matches by product ID, SKU (exact & clean alphanumeric, e.g. "BW81" === "bw-81"), motif, or product name.
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
  const cleanSku = product.sku.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Find all waiting Pre-Order items that might match this product
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

  // 2. Filter matching items
  const matchingItems = waitingPoItems.filter((it) => {
    // Already fulfilled?
    if (it.quantityFulfilled >= it.quantityOrdered) return false;

    // Explicit product ID match
    if (it.productId && it.productId === product.id) return true;

    // Exact SKU match (case-insensitive)
    const itSku = (it.productSku || '').trim().toLowerCase();
    const itCleanSku = itSku.replace(/[^a-z0-9]/g, '');
    if (itSku === product.sku.toLowerCase() || (cleanSku.length >= 2 && itCleanSku === cleanSku)) {
      return true;
    }

    // Name / Motif match in item's productSku or productName
    const itName = (it.productName || '').trim().toLowerCase();
    if (
      itName.includes(product.sku.toLowerCase()) ||
      (product.motif && itName.includes(product.motif.toLowerCase().trim())) ||
      (cleanSku.length >= 3 && itName.replace(/[^a-z0-9]/g, '').includes(cleanSku))
    ) {
      return true;
    }

    // Product motif equals item name/sku
    if (product.motif) {
      const pMotifClean = product.motif.toLowerCase().trim();
      if (itSku === pMotifClean || itName === pMotifClean) return true;
    }

    return false;
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
