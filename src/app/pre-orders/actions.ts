'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { isProductMatchItem } from '@/lib/preOrderFulfillment';
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

          // Strictly match product by ID or exact SKU/motif
          const prod = allActiveProducts.find((p) => isProductMatchItem(p, it));

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

            if (isProductMatchItem(prod, item)) {
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

// 7. Update Full Pre-Order Details (Edit Customer, Quantities, Prices, Add/Remove Items, Sync Stock)
export interface EditPreOrderItemInput {
  id?: string;
  productId?: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantityOrdered: number;
}

export interface UpdatePreOrderPayload {
  poId: string;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  items: EditPreOrderItemInput[];
}

export async function updatePreOrderDetails(payload: UpdatePreOrderPayload) {
  try {
    const { poId, customerName, customerPhone, notes, items } = payload;

    if (!customerName || !customerName.trim()) {
      return { success: false, error: 'Nama customer wajib diisi.' };
    }

    if (!items || items.length === 0) {
      return { success: false, error: 'Pre-Order harus memiliki minimal 1 produk.' };
    }

    const po = await prisma.preOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    if (!po) {
      return { success: false, error: 'Data Pre-Order tidak ditemukan.' };
    }

    if (po.status === 'SHIPPED') {
      return {
        success: false,
        error: 'Pre-Order yang sudah dikirim semua (SHIPPED) tidak dapat diedit lagi.',
      };
    }

    if (po.status === 'CANCELLED') {
      return {
        success: false,
        error: 'Pre-Order yang sudah dibatalkan (CANCELLED) tidak dapat diedit.',
      };
    }

    const cleanItems = items
      .filter((it) => (it.productSku?.trim() || it.productName?.trim()) && Number(it.quantityOrdered) > 0)
      .map((it) => ({
        id: it.id,
        productId: it.productId || null,
        productSku: (it.productSku || it.productName || 'PO-ITEM').trim().toUpperCase(),
        productName: (it.productName || it.productSku || 'Produk PO').trim(),
        price: Math.max(0, Math.floor(Number(it.price) || 0)),
        quantityOrdered: Math.max(1, Math.floor(Number(it.quantityOrdered) || 1)),
      }));

    if (cleanItems.length === 0) {
      return { success: false, error: 'Minimal harus ada 1 produk yang valid dalam PO.' };
    }

    await prisma.$transaction(
      async (tx) => {
        const allActiveProducts = await tx.product.findMany({
          where: { isActive: true },
        });

        const keptItemIds = cleanItems.map((c) => c.id).filter(Boolean) as string[];

        // 1. Release reserved stock for removed items
        for (const oldIt of po.items) {
          if (!keptItemIds.includes(oldIt.id)) {
            const heldQty = oldIt.quantityFulfilled - oldIt.quantityShipped;
            if (heldQty > 0 && oldIt.productId) {
              await tx.product.update({
                where: { id: oldIt.productId },
                data: {
                  reservedStock: { decrement: heldQty },
                },
              });
            }
          }
        }

        // Delete removed items
        await tx.preOrderItem.deleteMany({
          where: {
            preOrderId: poId,
            ...(keptItemIds.length > 0 ? { id: { notIn: keptItemIds } } : {}),
          },
        });

        let totalAmount = 0;
        let totalPcsOrdered = 0;
        let totalPcsFulfilled = 0;
        let totalPcsShipped = 0;

        // 2. Upsert items & adjust stock
        for (const it of cleanItems) {
          const existingItem = it.id ? po.items.find((old) => old.id === it.id) : null;
          const matchedProd = allActiveProducts.find((p) => isProductMatchItem(p, it));
          const prodId = matchedProd ? matchedProd.id : it.productId || null;

          let fulfilled = existingItem ? existingItem.quantityFulfilled : 0;
          const shipped = existingItem ? existingItem.quantityShipped : 0;

          // If ordered qty decreased below fulfilled qty, release excess held stock
          if (it.quantityOrdered < fulfilled) {
            const excess = fulfilled - it.quantityOrdered;
            const canReduce = Math.min(excess, fulfilled - shipped);
            if (canReduce > 0 && prodId) {
              await tx.product.update({
                where: { id: prodId },
                data: {
                  reservedStock: { decrement: canReduce },
                },
              });
              if (matchedProd) matchedProd.reservedStock -= canReduce;
            }
            fulfilled = Math.max(shipped, it.quantityOrdered);
          } else if (it.quantityOrdered > fulfilled && matchedProd) {
            // If ordered qty increased, check if available stock can fulfill additional needed
            const availableNow = Math.max(0, matchedProd.physicalStock - matchedProd.reservedStock);
            if (availableNow > 0) {
              const needed = it.quantityOrdered - fulfilled;
              const alloc = Math.min(needed, availableNow);
              if (alloc > 0) {
                fulfilled += alloc;
                await tx.product.update({
                  where: { id: matchedProd.id },
                  data: {
                    reservedStock: { increment: alloc },
                  },
                });
                matchedProd.reservedStock += alloc;
              }
            }
          }

          const subtotal = Math.floor(it.price * it.quantityOrdered);
          totalAmount += subtotal;
          totalPcsOrdered += it.quantityOrdered;
          totalPcsFulfilled += fulfilled;
          totalPcsShipped += shipped;

          if (existingItem) {
            await tx.preOrderItem.update({
              where: { id: existingItem.id },
              data: {
                productId: prodId,
                productSku: it.productSku,
                productName: it.productName,
                price: it.price,
                quantityOrdered: it.quantityOrdered,
                quantityFulfilled: fulfilled,
                quantityShipped: shipped,
                subtotal,
              },
            });
          } else {
            // New item added during edit
            let initialFulfilled = 0;
            if (matchedProd) {
              const availableNow = Math.max(0, matchedProd.physicalStock - matchedProd.reservedStock);
              if (availableNow > 0) {
                initialFulfilled = Math.min(it.quantityOrdered, availableNow);
                await tx.product.update({
                  where: { id: matchedProd.id },
                  data: {
                    reservedStock: { increment: initialFulfilled },
                  },
                });
                matchedProd.reservedStock += initialFulfilled;
              }
            }

            totalPcsFulfilled += initialFulfilled;

            await tx.preOrderItem.create({
              data: {
                preOrderId: poId,
                productId: prodId,
                productSku: it.productSku,
                productName: it.productName,
                price: it.price,
                quantityOrdered: it.quantityOrdered,
                quantityFulfilled: initialFulfilled,
                quantityShipped: 0,
                subtotal,
              },
            });
          }
        }

        // 3. Determine new PO status
        let nextStatus = 'WAITING_STOCK';
        if (totalPcsShipped >= totalPcsOrdered && totalPcsOrdered > 0) {
          nextStatus = 'SHIPPED';
        } else if (totalPcsFulfilled >= totalPcsOrdered && totalPcsOrdered > 0) {
          nextStatus = 'READY';
        } else if (totalPcsFulfilled > 0 || totalPcsShipped > 0) {
          nextStatus = totalPcsShipped > 0 ? 'PARTIAL_SHIPPED' : 'PARTIAL_READY';
        }

        await tx.preOrder.update({
          where: { id: poId },
          data: {
            customerName: customerName.trim(),
            customerPhone: customerPhone ? customerPhone.trim() : null,
            notes: notes ? notes.trim() : null,
            totalAmount,
            status: nextStatus,
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/stock-in');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    console.error('Error updating pre-order:', error);
    return { success: false, error: error.message || 'Gagal menyimpan perubahan Pre-Order' };
  }
}

export interface AddPreOrderItemInput {
  productId?: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantityOrdered: number;
}

export async function addItemsToPreOrder(
  preOrderId: string,
  newItems: AddPreOrderItemInput[]
) {
  try {
    if (!newItems || newItems.length === 0) {
      return { success: false, error: 'Belum ada item yang ditambahkan.' };
    }

    const po = await prisma.preOrder.findUnique({
      where: { id: preOrderId },
      include: { items: true },
    });

    if (!po) {
      return { success: false, error: 'Data Pre-Order tidak ditemukan.' };
    }

    if (po.status === 'SHIPPED') {
      return {
        success: false,
        error: 'Pre-Order yang sudah dikirim semua (SHIPPED) tidak dapat ditambah item lagi.',
      };
    }

    if (po.status === 'CANCELLED') {
      return {
        success: false,
        error: 'Pre-Order yang sudah dibatalkan tidak dapat ditambah item.',
      };
    }

    const cleanItems = newItems
      .filter((it) => (it.productSku?.trim() || it.productName?.trim()) && Number(it.quantityOrdered) > 0)
      .map((it) => ({
        productId: it.productId || null,
        productSku: (it.productSku || it.productName || 'PO-ITEM').trim().toUpperCase(),
        productName: (it.productName || it.productSku || 'Produk PO').trim(),
        price: Math.max(0, Math.floor(Number(it.price) || 0)),
        quantityOrdered: Math.max(1, Math.floor(Number(it.quantityOrdered) || 1)),
      }));

    if (cleanItems.length === 0) {
      return { success: false, error: 'Minimal harus ada 1 produk yang valid untuk ditambahkan.' };
    }

    await prisma.$transaction(
      async (tx) => {
        const allActiveProducts = await tx.product.findMany({
          where: { isActive: true },
        });

        let additionalAmount = 0;
        let totalPcsOrdered = po.items.reduce((acc, it) => acc + it.quantityOrdered, 0);
        let totalPcsFulfilled = po.items.reduce((acc, it) => acc + it.quantityFulfilled, 0);
        let totalPcsShipped = po.items.reduce((acc, it) => acc + it.quantityShipped, 0);

        for (const it of cleanItems) {
          const matchedProd = allActiveProducts.find((p) =>
            isProductMatchItem(p, { productSku: it.productSku, productName: it.productName })
          );
          const prodId = matchedProd ? matchedProd.id : it.productId || null;

          // Check if available stock in warehouse can fulfill now
          let initialFulfilled = 0;
          if (matchedProd) {
            const availableNow = Math.max(0, matchedProd.physicalStock - matchedProd.reservedStock);
            if (availableNow > 0) {
              initialFulfilled = Math.min(it.quantityOrdered, availableNow);
              await tx.product.update({
                where: { id: matchedProd.id },
                data: {
                  reservedStock: { increment: initialFulfilled },
                },
              });
              matchedProd.reservedStock += initialFulfilled;
            }
          }

          const subtotal = Math.floor(it.price * it.quantityOrdered);
          additionalAmount += subtotal;
          totalPcsOrdered += it.quantityOrdered;
          totalPcsFulfilled += initialFulfilled;

          await tx.preOrderItem.create({
            data: {
              preOrderId,
              productId: prodId,
              productSku: it.productSku,
              productName: it.productName,
              price: it.price,
              quantityOrdered: it.quantityOrdered,
              quantityFulfilled: initialFulfilled,
              quantityShipped: 0,
              subtotal,
            },
          });
        }

        const newTotalAmount = po.totalAmount + additionalAmount;

        // Determine new PO status
        let nextStatus = 'WAITING_STOCK';
        if (totalPcsShipped >= totalPcsOrdered && totalPcsOrdered > 0) {
          nextStatus = 'SHIPPED';
        } else if (totalPcsFulfilled >= totalPcsOrdered && totalPcsOrdered > 0) {
          nextStatus = 'READY';
        } else if (totalPcsFulfilled > 0 || totalPcsShipped > 0) {
          nextStatus = totalPcsShipped > 0 ? 'PARTIAL_SHIPPED' : 'PARTIAL_READY';
        }

        await tx.preOrder.update({
          where: { id: preOrderId },
          data: {
            totalAmount: newTotalAmount,
            status: nextStatus,
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/stock-in');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    console.error('Error adding items to pre-order:', error);
    return { success: false, error: error.message || 'Gagal menambahkan item ke Pre-Order' };
  }
}



