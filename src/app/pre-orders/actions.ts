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

    const cleanItems = items.map((it) => ({
      productId: it.productId || null,
      productSku: it.productSku.trim().toUpperCase(),
      productName: it.productName.trim(),
      price: Math.max(0, Number(it.price) || 0),
      quantityOrdered: Math.max(1, Number(it.quantityOrdered) || 1),
    }));

    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      let totalOrderedPcs = 0;
      let totalFulfilledPcs = 0;

      const preparedItems = [];

      for (const it of cleanItems) {
        let fulfilledNow = 0;

        // Check if there is existing available stock in warehouse right now
        if (it.productId) {
          const prod = await tx.product.findUnique({
            where: { id: it.productId },
          });

          if (prod) {
            const availableNow = Math.max(0, prod.physicalStock - prod.reservedStock);
            if (availableNow > 0) {
              fulfilledNow = Math.min(it.quantityOrdered, availableNow);
              // Hold that stock for this PO
              await tx.product.update({
                where: { id: it.productId },
                data: {
                  reservedStock: { increment: fulfilledNow },
                },
              });
            }
          }
        }

        const subtotal = it.price * it.quantityOrdered;
        totalAmount += subtotal;
        totalOrderedPcs += it.quantityOrdered;
        totalFulfilledPcs += fulfilledNow;

        preparedItems.push({
          productId: it.productId,
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
    });

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

    await prisma.$transaction(async (tx) => {
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
    });

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

    await prisma.$transaction(async (tx) => {
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
    });

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
