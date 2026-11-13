'use server';

import { paidOf, remainingOf } from '@/lib/poPayment';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { isProductMatchItem, allocateStockToWaitingPreOrders } from '@/lib/preOrderFulfillment';
import { reconcileProductAllocation, poStatusFromQuantities } from '@/lib/opnameAllocation';
import { buildPoItemsFromOrder } from '@/lib/orderToPo';
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
  paymentStatus: string; // UNPAID, PAID
  paidAmount: number; // jumlah yang sudah dibayar (bisa dicicil)
  paidAt: Date | null;
  shippedAt: Date | null;
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
          let matchedProdId: string | null = null;

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
          nextStatus = 'PARTIAL_SHIPPED';
        } else if (isAllReady) {
          nextStatus = 'READY';
        } else if (hasSomeFulfilled) {
          nextStatus = 'PARTIAL_READY';
        }

        // Pembayaran dicatat terpisah lewat "Catat pembayaran" (bisa dicicil). Pengiriman tidak lagi
        // menandai PO lunas otomatis.
        await tx.preOrder.update({
          where: { id: poId },
          data: {
            status: nextStatus,
            ...(isAllFullyShipped ? { shippedAt: new Date() } : {}),
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/orders');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    console.error('Error shipping pre-order items:', error);
    return { success: false, error: error.message || 'Gagal memproses pengiriman PO' };
  }
}

// 4. Catat pembayaran PO. Bisa dicicil berkali-kali; PO baru berstatus PAID kalau total terpenuhi.
// Tiap pembayaran dicatat sebagai pemasukan di Laporan Keuangan (referenceId = nomor PO).
export async function markPreOrderAsPaid(poId: string, paymentNotes?: string, customAmount?: number) {
  try {
    const po = await prisma.preOrder.findUnique({
      where: { id: poId },
    });

    if (!po) {
      return { success: false, error: 'Data Pre-Order tidak ditemukan.' };
    }

    if (po.status === 'CANCELLED') {
      return { success: false, error: 'Pre-Order ini sudah dibatalkan.' };
    }

    const remaining = remainingOf(po);
    if (remaining <= 0) {
      return { success: false, error: 'Pre-Order ini sudah lunas.' };
    }

    const payAmount =
      customAmount !== undefined && Number.isFinite(customAmount) ? Math.floor(customAmount) : remaining;
    if (payAmount <= 0) {
      return { success: false, error: 'Jumlah pembayaran harus lebih dari 0.' };
    }
    if (payAmount > remaining) {
      return { success: false, error: `Jumlah melebihi sisa tagihan (Rp ${remaining.toLocaleString('id-ID')}).` };
    }

    const newPaid = paidOf(po) + payAmount;
    const fullyPaid = newPaid >= po.totalAmount;

    await prisma.$transaction(
      async (tx) => {
        await tx.preOrder.update({
          where: { id: poId },
          data: {
            paidAmount: newPaid,
            paymentStatus: fullyPaid ? 'PAID' : 'UNPAID',
            ...(fullyPaid ? { paidAt: new Date() } : {}),
          },
        });

        await tx.financeTransaction.create({
          data: {
            type: 'INCOME',
            category: 'SALES',
            amount: payAmount,
            description: `Pembayaran ${fullyPaid ? 'Pelunasan' : 'Sebagian'} Pre-Order #${po.poNumber} (${po.customerName})${paymentNotes ? ` [${paymentNotes}]` : ''}`,
            referenceId: po.poNumber,
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/orders');
    revalidatePath('/finance');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    console.error('Error recording pre-order payment:', error);
    return { success: false, error: error.message || 'Gagal mencatat pembayaran.' };
  }
}

// 4b. Selesaikan PO yang sudah terkirim di dunia nyata tapi masih "nyangkut" di sistem
// (misalnya karena nama/SKU item tidak terdeteksi sehingga tidak pernah ready).
// - TIDAK mencatat pemasukan ke Keuangan dan TIDAK mengubah status pembayaran.
// - Item yang sudah ready tapi belum dikirim: stok dikurangi seperti pengiriman biasa.
// - Item yang belum ready: tidak menyentuh stok sama sekali (barang keluar dari luar sistem,
//   selisihnya dibereskan lewat hitung fisik / stok opname).
export async function settlePreOrdersAsShipped(poIds: string[]) {
  const ids = Array.from(new Set((poIds || []).filter((id) => typeof id === 'string' && id)));
  if (ids.length === 0) {
    return { success: false, error: 'Pilih minimal 1 Pre-Order.' };
  }
  if (ids.length > 200) {
    return { success: false, error: 'Maksimal 200 Pre-Order sekaligus.' };
  }

  let settled = 0;
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const poId of ids) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const po = await tx.preOrder.findUnique({
            where: { id: poId },
            include: { items: true },
          });

          if (!po) return { ok: false as const, label: poId };
          if (po.status === 'CANCELLED' || po.status === 'SHIPPED') {
            return { ok: false as const, label: `#${po.poNumber}` };
          }

          for (const it of po.items) {
            const heldQty = Math.max(0, it.quantityFulfilled - it.quantityShipped);

            if (heldQty > 0 && it.productId) {
              await tx.product.update({
                where: { id: it.productId },
                data: {
                  physicalStock: { decrement: heldQty },
                  reservedStock: { decrement: heldQty },
                },
              });

              await tx.stockTransaction.create({
                data: {
                  productId: it.productId,
                  type: 'ADJUSTMENT_OUT',
                  quantity: heldQty,
                  notes: `Pengiriman PO #${po.poNumber} (${po.customerName}) - diselesaikan manual`,
                },
              });
            }

            await tx.preOrderItem.update({
              where: { id: it.id },
              data: {
                quantityFulfilled: Math.max(it.quantityFulfilled, it.quantityOrdered),
                quantityShipped: Math.max(it.quantityShipped, it.quantityOrdered),
              },
            });
          }

          await tx.preOrder.update({
            where: { id: poId },
            data: {
              status: 'SHIPPED',
              shippedAt: new Date(),
            },
          });

          return { ok: true as const, label: `#${po.poNumber}` };
        },
        { maxWait: 15000, timeout: 30000 }
      );

      if (result.ok) settled += 1;
      else skipped.push(result.label);
    } catch (error: any) {
      console.error('Error settling pre-order:', poId, error);
      failed.push(poId);
    }
  }

  revalidatePath('/pre-orders');
  revalidatePath('/products');
  revalidatePath('/orders');
  revalidatePath('/');

  if (settled === 0) {
    return {
      success: false,
      error:
        failed.length > 0
          ? 'Gagal menyelesaikan Pre-Order. Coba lagi beberapa saat.'
          : 'Tidak ada Pre-Order yang bisa diselesaikan (sudah dikirim atau dibatalkan).',
      settled,
      skipped,
      failed,
    };
  }

  return { success: true, settled, skipped, failed };
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
          // Tautan dari form hanya dipercaya kalau produknya memang cocok dengan kode yang diketik
          const prodId = matchedProd ? matchedProd.id : null;

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
            paidAmount: paidOf(po),
            paymentStatus: paidOf(po) >= totalAmount ? 'PAID' : 'UNPAID',
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

        // Pembayaran yang sudah masuk dikunci dulu (PO lama berstatus PAID dianggap lunas sebelum total naik),
        // lalu status bayar dihitung ulang terhadap total baru.
        const paidNow = paidOf(po);
        await tx.preOrder.update({
          where: { id: preOrderId },
          data: {
            totalAmount: newTotalAmount,
            status: nextStatus,
            paidAmount: paidNow,
            paymentStatus: paidNow >= newTotalAmount ? 'PAID' : 'UNPAID',
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

// 7. Audit & Resync all Product Reserved Stocks and Pre-Order Allocations
// Dibuat dengan query massal (bukan per produk) supaya tidak kena batas waktu transaksi.
export async function resyncAllPreOrderStock() {
  try {
    const report: string[] = [];
    let allocatedTotal = 0;

    await prisma.$transaction(
      async (tx) => {
        const [products, holdItems, activePoItems] = await Promise.all([
          tx.product.findMany(),
          tx.orderItem.findMany({
            where: { productId: { not: null }, order: { status: 'HOLD' } },
            select: { productId: true, quantity: true },
          }),
          tx.preOrderItem.findMany({
            where: { productId: { not: null }, preOrder: { status: { notIn: ['CANCELLED', 'SHIPPED'] } } },
            select: { productId: true, quantityFulfilled: true, quantityShipped: true },
          }),
        ]);

        // 0. Perbaiki item PO yang salah tautan produk (belum menahan stok, jadi aman dipindah)
        const activeProducts = products.filter((p) => p.isActive);
        const unfulfilled = await tx.preOrderItem.findMany({
          where: {
            quantityFulfilled: 0,
            quantityShipped: 0,
            preOrder: { status: { notIn: ['CANCELLED', 'SHIPPED'] } },
          },
        });
        for (const it of unfulfilled) {
          const strict = activeProducts.find((p) =>
            isProductMatchItem(p, { productSku: it.productSku, productName: it.productName })
          );
          if (strict && it.productId !== strict.id) {
            await tx.preOrderItem.update({ where: { id: it.id }, data: { productId: strict.id } });
            report.push(`Diperbaiki: ${it.productSku} dihubungkan ke produk "${strict.sku}".`);
          } else if (!strict && it.productId) {
            const linked = products.find((p) => p.id === it.productId);
            if (linked && !isProductMatchItem(linked, { productSku: it.productSku, productName: it.productName })) {
              await tx.preOrderItem.update({ where: { id: it.id }, data: { productId: null } });
              report.push(`Diperbaiki: ${it.productSku} dilepas dari produk "${linked.sku}" yang tidak cocok.`);
            }
          }
        }

        // 1. Hitung ulang stok tahan sebenarnya per produk
        const held = new Map<string, number>();
        for (const it of holdItems) {
          held.set(it.productId!, (held.get(it.productId!) || 0) + it.quantity);
        }
        for (const it of activePoItems) {
          held.set(
            it.productId!,
            (held.get(it.productId!) || 0) + Math.max(0, it.quantityFulfilled - it.quantityShipped)
          );
        }

        const withStock: typeof products = [];
        for (const p of products) {
          const trueReserved = held.get(p.id) || 0;
          if (p.reservedStock !== trueReserved) {
            await tx.product.update({ where: { id: p.id }, data: { reservedStock: trueReserved } });
            p.reservedStock = trueReserved;
          }
          if (p.physicalStock - p.reservedStock > 0) withStock.push(p);
        }

        // 2. Bagikan stok bebas ke item PO yang menunggu (hanya produk yang punya stok bebas)
        for (const p of withStock) {
          const avail = Math.max(0, p.physicalStock - p.reservedStock);
          const res = await allocateStockToWaitingPreOrders(tx, p, avail);
          allocatedTotal += res.allocatedCount;
          if (res.allocatedCount > 0) {
            report.push(`${p.sku}: +${res.allocatedCount} pcs untuk ${res.poNumbers.join(', ')}`);
          }
        }

        // 3. Hitung ulang status semua PO
        const allPos = await tx.preOrder.findMany({
          where: { status: { notIn: ['CANCELLED'] } },
          include: { items: true },
        });

        for (const po of allPos) {
          const correctStatus = poStatusFromQuantities(po.items);
          if (po.status !== correctStatus) {
            await tx.preOrder.update({ where: { id: po.id }, data: { status: correctStatus } });
          }
        }

        // 4. Laporan: item yang masih menunggu padahal ada produk cocok dengan stok bebas
        const productById = new Map(products.map((p) => [p.id, p]));
        for (const po of allPos) {
          if (po.status === 'SHIPPED') continue;
          for (const it of po.items) {
            if (it.quantityFulfilled >= it.quantityOrdered) continue;
            const linked = it.productId ? productById.get(it.productId) : null;
            const strict = products.find((p) => p.isActive && isProductMatchItem(p, { productSku: it.productSku, productName: it.productName }));
            if (strict && strict.physicalStock - strict.reservedStock > 0 && linked && linked.id !== strict.id) {
              report.push(
                `PERHATIAN ${po.poNumber} / ${it.productSku}: item terhubung ke produk "${linked.sku}", padahal kodenya cocok dengan "${strict.sku}" yang punya stok bebas ${strict.physicalStock - strict.reservedStock}. Hubungkan ulang.`
              );
            } else if (!linked && !strict) {
              report.push(`${po.poNumber} / ${it.productSku}: tidak ada produk di Master yang cocok persis.`);
            }
          }
        }
      },
      { maxWait: 20000, timeout: 60000 }
    );

    revalidatePath('/pre-orders');
    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/stock-in');
    revalidatePath('/');

    return { success: true, allocatedTotal, report };
  } catch (error: any) {
    console.error('Error resyncing pre-order stock:', error);
    return { success: false, error: error.message || 'Gagal menyinkronkan stok Pre-Order' };
  }
}

// 12. Tautkan item PO yang belum terhubung (nama/kode salah ketik) ke produk di Master
export interface LinkPreOrderItemInput {
  itemId: string;
  productId: string;
}

export interface LinkPreOrderItemResult {
  itemId: string;
  ok: boolean;
  sku?: string;
  allocated?: number;
  error?: string;
}

/**
 * Menghubungkan item PO ke produk Master. SKU/nama item disamakan dengan produk, lalu stok bebas
 * produk itu dibagikan ke antrean PO (terlama dulu) lewat rekonsiliasi yang sama dengan Stok Opname.
 * Hanya untuk item PO aktif yang belum punya stok siap / belum dikirim. Tidak mengubah Keuangan.
 */
export async function linkPreOrderItemsToProducts(links: LinkPreOrderItemInput[]) {
  if (!links || links.length === 0) return { success: false, error: 'Tidak ada item yang dipilih.', results: [] as LinkPreOrderItemResult[] };
  if (links.length > 30) return { success: false, error: 'Maksimal 30 item per proses.', results: [] as LinkPreOrderItemResult[] };
  const seen = new Set<string>();
  for (const l of links) {
    if (!l.itemId || !l.productId) return { success: false, error: 'Data tautan tidak lengkap.', results: [] as LinkPreOrderItemResult[] };
    if (seen.has(l.itemId)) return { success: false, error: 'Ada item yang dipilih dua kali.', results: [] as LinkPreOrderItemResult[] };
    seen.add(l.itemId);
  }

  const results: LinkPreOrderItemResult[] = [];
  for (const l of links) {
    try {
      const out = await prisma.$transaction(
        async (tx) => {
          const item = await tx.preOrderItem.findUnique({ where: { id: l.itemId }, include: { preOrder: true } });
          if (!item) throw new Error('Item PO tidak ditemukan.');
          if (item.preOrder.status === 'CANCELLED' || item.preOrder.status === 'SHIPPED') {
            throw new Error(`PO #${item.preOrder.poNumber} sudah ${item.preOrder.status === 'SHIPPED' ? 'selesai dikirim' : 'dibatalkan'}.`);
          }
          if (item.quantityFulfilled > 0 || item.quantityShipped > 0) {
            throw new Error('Item ini sudah punya stok siap/terkirim, ubah lewat Edit PO.');
          }
          const product = await tx.product.findUnique({ where: { id: l.productId } });
          if (!product) throw new Error('Produk tujuan tidak ditemukan di Master.');

          await tx.preOrderItem.update({
            where: { id: item.id },
            data: { productId: product.id, productSku: product.sku, productName: product.name },
          });

          const rec = await reconcileProductAllocation(tx, product.id);
          return { sku: product.sku, allocated: rec.allocatedToPo };
        },
        { maxWait: 15000, timeout: 30000 },
      );
      results.push({ itemId: l.itemId, ok: true, sku: out.sku, allocated: out.allocated });
    } catch (error: any) {
      console.error('Error linking pre-order item:', l.itemId, error);
      results.push({ itemId: l.itemId, ok: false, error: error?.message || 'Gagal menautkan.' });
    }
  }

  revalidatePath('/pre-orders');
  revalidatePath('/products');
  revalidatePath('/');

  const okCount = results.filter((r) => r.ok).length;
  return { success: okCount > 0, results, error: okCount === 0 ? 'Semua item gagal ditautkan.' : undefined };
}


// Ubah order HOLD biasa menjadi PO supaya bisa ditambah barang yang harus menunggu stok.
// Stok yang sudah ditahan TETAP ditahan (tidak dilepas lalu ditahan ulang). Nomor & tanggal order dipertahankan.
export async function convertOrderToPreOrder(orderId: string) {
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) throw new Error('Order tidak ditemukan.');
        if (order.status !== 'HOLD') {
          throw new Error(`Hanya order berstatus HOLD yang bisa diubah jadi PO. Status saat ini: ${order.status}`);
        }
        const existing = await tx.preOrder.findUnique({ where: { poNumber: order.orderNumber } });
        if (existing) throw new Error('Nomor order ini sudah dipakai PO lain.');

        const poItems = buildPoItemsFromOrder(order.items);
        const totalAmount = poItems.reduce((a, it) => a + it.subtotal, 0);

        const po = await tx.preOrder.create({
          data: {
            poNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            status: poStatusFromQuantities(poItems),
            totalAmount,
            notes: order.notes,
            createdAt: order.createdAt,
            items: { create: poItems },
          },
        });
        // Hapus order lama; stok tahanan tidak disentuh karena kini dipegang PO.
        await tx.order.delete({ where: { id: order.id } });
        return po;
      },
      { maxWait: 15000, timeout: 30000 }
    );

    revalidatePath('/orders');
    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, poId: result.id };
  } catch (error: any) {
    console.error('Error converting order to PO:', error);
    return { success: false, error: error.message || 'Gagal mengubah order menjadi PO' };
  }
}
