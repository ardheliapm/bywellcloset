'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  findProductMasterType,
  calculateProductPrice,
  DEFAULT_PRODUCT_TYPES,
} from '@/lib/productTypes';

export interface PreOrderItemRecord {
  id: string;
  preOrderId: string;
  productId: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantityOrdered: number;
  quantityFulfilled: number;
  quantityShipped: number;
  subtotal: number;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    sku: string;
    name: string;
    physicalStock: number;
    reservedStock: number;
  } | null;
}

export interface PreOrderRecord {
  id: string;
  poNumber: string;
  customerName: string;
  customerPhone: string | null;
  status: string; // WAITING_STOCK, PARTIAL_READY, READY, PARTIAL_SHIPPED, SHIPPED, CANCELLED
  totalAmount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: PreOrderItemRecord[];
}

export interface CreatePreOrderItemInput {
  productId?: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantityOrdered: number;
}

export interface CreatePreOrderPayload {
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  items: CreatePreOrderItemInput[];
}

// 1. Fetch All Pre-Orders
export async function getPreOrders(): Promise<PreOrderRecord[]> {
  try {
    const pos = await prisma.preOrder.findMany({
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                physicalStock: true,
                reservedStock: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return pos;
  } catch (error) {
    console.error('Error fetching pre-orders:', error);
    return [];
  }
}

// 2. Create Pre-Order (with locked total-quantity reseller pricing & initial stock check)
export async function createPreOrder(payload: CreatePreOrderPayload) {
  try {
    const { customerName, customerPhone, notes, items } = payload;

    if (!customerName || !customerName.trim()) {
      return { success: false, error: 'Nama customer wajib diisi.' };
    }

    if (!items || items.length === 0) {
      return { success: false, error: 'Minimal harus ada 1 produk dalam PO.' };
    }

    // Generate PO Number: PO-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const poNumber = `PO-${dateStr}-${randomSuffix}`;

    const cleanItems = items
      .filter((it) => (it.productSku?.trim() || it.productName?.trim()) && Number(it.quantityOrdered) > 0)
      .map((it) => {
        const pSku = (it.productSku || it.productName || 'PO-ITEM').trim().toUpperCase();
        const pName = (it.productName || it.productSku || 'Produk PO').trim();
        return {
          productId: it.productId || null,
          productSku: pSku,
          productName: pName,
          price: Math.max(0, Math.floor(Number(it.price) || 0)),
          quantityOrdered: Math.max(1, Math.floor(Number(it.quantityOrdered) || 1)),
        };
      });

    if (cleanItems.length === 0) {
      return { success: false, error: 'Minimal harus ada 1 produk yang valid dalam PO.' };
    }

    const result = await prisma.$transaction(
      async (tx) => {
        let totalAmount = 0;
        let totalOrderedPcs = 0;
        let totalFulfilledPcs = 0;

        // Fetch all active products to match by ID, SKU, or Name
        const allActiveProducts = await tx.product.findMany({
          where: { isActive: true },
        });

        const preparedItems = [];

        for (const it of cleanItems) {
          let fulfilledNow = 0;
          let matchedProdId = it.productId;

          const itCleanSku = (it.productSku || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const itName = (it.productName || '').toLowerCase().trim();

          // Match product by ID, SKU, clean SKU, or motif/name
          const prod = allActiveProducts.find((p) => {
            if (matchedProdId && p.id === matchedProdId) return true;
            const pSku = p.sku.toLowerCase();
            const pCleanSku = pSku.replace(/[^a-z0-9]/g, '');
            if (pSku === it.productSku.toLowerCase() || (itCleanSku.length >= 2 && pCleanSku === itCleanSku)) {
              return true;
            }
            if (p.motif && itName.includes(p.motif.toLowerCase().trim())) {
              return true;
            }
            if (itName.includes(pSku) || (itCleanSku.length >= 3 && itName.replace(/[^a-z0-9]/g, '').includes(itCleanSku))) {
              return true;
            }
            return false;
          });

          if (prod) {
            matchedProdId = prod.id;
            const availableNow = Math.max(0, prod.physicalStock - prod.reservedStock);
            if (availableNow > 0) {
              fulfilledNow = Math.min(it.quantityOrdered, availableNow);
              // Hold that stock for this PO
              await tx.product.update({
                where: { id: prod.id },
                data: {
                  reservedStock: { increment: fulfilledNow },
                },
              });
              // Update local state in object for subsequent items of same product
              prod.reservedStock += fulfilledNow;
            }
          }

          const subtotal = Math.floor(it.price * it.quantityOrdered);
          totalAmount += subtotal;
          totalOrderedPcs += it.quantityOrdered;
          totalFulfilledPcs += fulfilledNow;

          preparedItems.push({
            productId: matchedProdId,
            productSku: it.productSku,
            productName: it.productName,
            price: it.price,
            quantityOrdered: it.quantityOrdered,
            quantityFulfilled: fulfilledNow,
            quantityShipped: 0,
            subtotal,
          });
        }

        // Determine initial status
        let status = 'WAITING_STOCK';
        if (totalFulfilledPcs === totalOrderedPcs && totalOrderedPcs > 0) {
          status = 'READY';
        } else if (totalFulfilledPcs > 0) {
          status = 'PARTIAL_READY';
        }

        const newPo = await tx.preOrder.create({
          data: {
            poNumber,
            customerName: customerName.trim(),
            customerPhone: customerPhone ? customerPhone.trim() : null,
            status,
            totalAmount,
            notes: notes ? notes.trim() : null,
            items: {
              create: preparedItems,
            },
          },
        });

        return newPo;
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/stock-in');
    revalidatePath('/products');
    revalidatePath('/');

    return { success: true, poNumber: result.poNumber };
  } catch (error: any) {
    console.error('Error creating pre-order:', error);
    return { success: false, error: error.message || 'Gagal mencatat Pre-Order' };
  }
}

// 3. Ship Items from Pre-Order (Supports Partial Shipment with locked reseller price)
export interface ShipItemInput {
  itemId: string;
  quantityToShip: number;
}

export async function shipPreOrderItems(
  poId: string,
  shipments: ShipItemInput[],
  shippingNotes?: string
) {
  try {
    const po = await prisma.preOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    if (!po) {
      return { success: false, error: 'Data Pre-Order tidak ditemukan.' };
    }

    if (po.status === 'CANCELLED') {
      return { success: false, error: 'Pre-Order ini sudah dibatalkan.' };
    }

    if (po.status === 'SHIPPED') {
      return { success: false, error: 'Semua barang dalam PO ini sudah dikirim.' };
    }

    const validShipments = shipments.filter((s) => s.quantityToShip > 0);
    if (validShipments.length === 0) {
      return { success: false, error: 'Pilih minimal 1 pcs barang yang ready untuk dikirim.' };
    }

    await prisma.$transaction(
      async (tx) => {
        let shipmentTotalAmount = 0;
        let totalPcsShippedNow = 0;

        for (const ship of validShipments) {
          const item = po.items.find((it) => it.id === ship.itemId);
          if (!item) continue;

          const maxShippable = item.quantityFulfilled - item.quantityShipped;
          const qtyToShip = Math.min(ship.quantityToShip, maxShippable);

          if (qtyToShip <= 0) continue;

          const updatedShipped = item.quantityShipped + qtyToShip;
          totalPcsShippedNow += qtyToShip;
          shipmentTotalAmount += item.price * qtyToShip;

          // 1. Update PreOrderItem
          await tx.preOrderItem.update({
            where: { id: item.id },
            data: {
              quantityShipped: updatedShipped,
            },
          });

          // 2. Reduce physicalStock & reservedStock in Product
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                physicalStock: { decrement: qtyToShip },
                reservedStock: { decrement: qtyToShip },
              },
            });

            // Log stock transaction
            await tx.stockTransaction.create({
              data: {
                productId: item.productId,
                type: 'ADJUSTMENT_OUT',
                quantity: qtyToShip,
                notes: `Pengiriman PO #${po.poNumber} (${po.customerName})`,
              },
            });
          }
        }

        // 3. Check overall PO fulfillment & shipment status
        const allUpdatedItems = await tx.preOrderItem.findMany({
          where: { preOrderId: poId },
        });

        const isAllFullyShipped = allUpdatedItems.every(
          (it) => it.quantityShipped >= it.quantityOrdered
        );

        const isAllReady = allUpdatedItems.every(
          (it) => it.quantityFulfilled >= it.quantityOrdered
        );

        const hasSomeFulfilled = allUpdatedItems.some((it) => it.quantityFulfilled > 0);
        const hasSomeShipped = allUpdatedItems.some((it) => it.quantityShipped > 0);

        let nextStatus = po.status;
        if (isAllFullyShipped) {
          nextStatus = 'SHIPPED';
        } else if (hasSomeShipped) {
          nextStatus = isAllReady ? 'READY' : 'PARTIAL_READY';
        } else if (isAllReady) {
          nextStatus = 'READY';
        } else if (hasSomeFulfilled) {
          nextStatus = 'PARTIAL_READY';
        }

        await tx.preOrder.update({
          where: { id: poId },
          data: {
            status: nextStatus,
          },
        });

        // 4. Record Finance Income Transaction for this shipment
        if (shipmentTotalAmount > 0) {
          await tx.financeTransaction.create({
            data: {
              type: 'INCOME',
              category: 'SALES',
              amount: shipmentTotalAmount,
              description: `Pengiriman PO #${po.poNumber} (${po.customerName}) - ${totalPcsShippedNow} pcs${shippingNotes ? ` [${shippingNotes}]` : ''}`,
              referenceId: po.poNumber,
            },
          });
        }
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    console.error('Error shipping pre-order items:', error);
    return { success: false, error: error.message || 'Gagal memproses pengiriman PO' };
  }
}

// 4. Cancel Pre-Order (Release any reserved stock back to warehouse)
export async function cancelPreOrder(poId: string) {
  try {
    const po = await prisma.preOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    if (!po) {
      return { success: false, error: 'Pre-Order tidak ditemukan.' };
    }

    if (po.status === 'CANCELLED') {
      return { success: false, error: 'Pre-Order sudah dibatalkan sebelumnya.' };
    }

    if (po.status === 'SHIPPED') {
      return { success: false, error: 'PO yang sudah dikirim semua tidak dapat dibatalkan.' };
    }

    await prisma.$transaction(
      async (tx) => {
        // Release any fulfilled but not yet shipped stock
        for (const it of po.items) {
          const heldQty = it.quantityFulfilled - it.quantityShipped;
          if (heldQty > 0 && it.productId) {
            await tx.product.update({
              where: { id: it.productId },
              data: {
                reservedStock: { decrement: heldQty },
              },
            });
          }
        }

        await tx.preOrder.update({
          where: { id: poId },
          data: {
            status: 'CANCELLED',
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    console.error('Error cancelling pre-order:', error);
    return { success: false, error: error.message || 'Gagal membatalkan Pre-Order' };
  }
}

// 5. Delete Pre-Order (Permanently, only if CANCELLED)
export async function deletePreOrder(poId: string) {
  try {
    const po = await prisma.preOrder.findUnique({
      where: { id: poId },
    });

    if (!po) {
      return { success: false, error: 'Pre-Order tidak ditemukan.' };
    }

    if (po.status !== 'CANCELLED') {
      return {
        success: false,
        error: 'Hanya Pre-Order berstatus Dibatalkan (CANCELLED) yang dapat dihapus permanen.',
      };
    }

    await prisma.preOrder.delete({
      where: { id: poId },
    });

    revalidatePath('/pre-orders');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting pre-order:', error);
    return { success: false, error: error.message || 'Gagal menghapus Pre-Order' };
  }
}

// 6. Reconcile All Waiting Pre-Orders against Available Warehouse Stock
export async function reconcileAllWaitingPreOrders() {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
    });

    let totalAllocated = 0;

    await prisma.$transaction(
      async (tx) => {
        for (const prod of products) {
          const available = prod.physicalStock - prod.reservedStock;
          if (available <= 0) continue;

          const cleanSku = prod.sku.toLowerCase().replace(/[^a-z0-9]/g, '');

          // Find waiting items for this product
          const waitingItems = await tx.preOrderItem.findMany({
            where: {
              preOrder: {
                status: { in: ['WAITING_STOCK', 'PARTIAL_READY'] },
              },
            },
            include: { preOrder: true },
            orderBy: { createdAt: 'asc' },
          });

          let remainingAvailable = available;

          for (const item of waitingItems) {
            if (remainingAvailable <= 0) break;
            if (item.quantityFulfilled >= item.quantityOrdered) continue;

            const itSku = (item.productSku || '').trim().toLowerCase();
            const itCleanSku = itSku.replace(/[^a-z0-9]/g, '');
            const itName = (item.productName || '').trim().toLowerCase();

            const isMatch =
              item.productId === prod.id ||
              itSku === prod.sku.toLowerCase() ||
              (cleanSku.length >= 2 && itCleanSku === cleanSku) ||
              itName.includes(prod.sku.toLowerCase()) ||
              (cleanSku.length >= 3 && itName.replace(/[^a-z0-9]/g, '').includes(cleanSku)) ||
              (prod.motif && itName.includes(prod.motif.toLowerCase().trim()));

            if (isMatch) {
              const needed = item.quantityOrdered - item.quantityFulfilled;
              const alloc = Math.min(remainingAvailable, needed);
              const newFulfilled = item.quantityFulfilled + alloc;
              remainingAvailable -= alloc;
              totalAllocated += alloc;

              await tx.preOrderItem.update({
                where: { id: item.id },
                data: {
                  quantityFulfilled: newFulfilled,
                  productId: prod.id,
                },
              });

              await tx.product.update({
                where: { id: prod.id },
                data: {
                  reservedStock: { increment: alloc },
                },
              });

              // Check sibling items
              const siblingItems = await tx.preOrderItem.findMany({
                where: { preOrderId: item.preOrderId },
              });

              const isAllReady = siblingItems.every(
                (s) => (s.id === item.id ? newFulfilled : s.quantityFulfilled) >= s.quantityOrdered
              );

              await tx.preOrder.update({
                where: { id: item.preOrderId },
                data: {
                  status: isAllReady ? 'READY' : 'PARTIAL_READY',
                },
              });
            }
          }
        }
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/stock-in');
    revalidatePath('/');

    return { success: true, totalAllocated };
  } catch (error: any) {
    console.error('Error reconciling pre-orders:', error);
    return { success: false, error: error.message || 'Gagal merekonsiliasi antrean PO' };
  }
}

