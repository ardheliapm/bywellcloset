'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  status: string; // HOLD, PAID, SHIPPED, CANCELLED
  totalAmount: number;
  notes: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRecord[];
}

export async function getOrders(): Promise<OrderRecord[]> {
  try {
    const orders = await prisma.order.findMany({
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

// 1. Mark Order as Paid (Potong stok fisik resmi & lepas hold stock)
export async function markOrderAsPaid(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status !== 'HOLD') {
      return { success: false, error: `Order tidak dalam status HOLD (status saat ini: ${order.status})` };
    }

    // Run transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update Order status to PAID
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      let totalHijabQty = 0;

      // 2. Reduce physicalStock and release reservedStock
      for (const item of order.items) {
        totalHijabQty += item.quantity;
        if (item.productId) {
          const prod = await tx.product.findUnique({
            where: { id: item.productId },
            select: { costPrice: true },
          });

          if (prod) {
            // Snapshot costPrice
            await tx.orderItem.update({
              where: { id: item.id },
              data: { costPrice: prod.costPrice || 0 },
            });
          }

          await tx.product.update({
            where: { id: item.productId },
            data: {
              physicalStock: { decrement: item.quantity },
              reservedStock: { decrement: item.quantity },
            },
          });

          // Log to stock_transactions
          await tx.stockTransaction.create({
            data: {
              productId: item.productId,
              type: 'ADJUSTMENT_OUT',
              quantity: item.quantity,
              notes: `Penjualan Order #${order.orderNumber} (${order.customerName})`,
            },
          });
        }
      }

      // 3. Record Finance Income Transaction
      await tx.financeTransaction.create({
        data: {
          type: 'INCOME',
          category: 'SALES',
          amount: order.totalAmount,
          description: `Penjualan Lunas Order #${order.orderNumber} (${order.customerName})`,
          referenceId: order.orderNumber,
        },
      });
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error marking order as paid:', error);
    return { success: false, error: error.message || 'Gagal mengubah status pesanan ke PAID' };
  }
}

// 2. Mark Order as Shipped
export async function markOrderAsShipped(orderId: string) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        shippedAt: new Date(),
      },
    });

    revalidatePath('/orders');
    return { success: true };
  } catch (error: any) {
    console.error('Error marking order as shipped:', error);
    return { success: false, error: error.message || 'Gagal mengubah status pesanan ke SHIPPED' };
  }
}

// 3. Cancel Order (Lepas stok hold jika sebelumnya HOLD)
export async function cancelOrder(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status === 'CANCELLED') {
      return { success: false, error: 'Order sudah dibatalkan sebelumnya' };
    }

    await prisma.$transaction(async (tx) => {
      // If was HOLD, release reserved stock
      if (order.status === 'HOLD') {
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                reservedStock: { decrement: item.quantity },
              },
            });
          }
        }
      } else if (order.status === 'PAID' || order.status === 'SHIPPED') {
        // If was PAID or SHIPPED, restore physical stock
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                physicalStock: { increment: item.quantity },
              },
            });

            await tx.stockTransaction.create({
              data: {
                productId: item.productId,
                type: 'ADJUSTMENT_IN',
                quantity: item.quantity,
                notes: `Pembatalan Order #${order.orderNumber} (${order.customerName})`,
              },
            });
          }
        }
      }

      // Update status
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
        },
      });
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error cancelling order:', error);
    return { success: false, error: error.message || 'Gagal membatalkan pesanan' };
  }
}

// 4. Delete Order (Hapus order secara permanen, syarat: status harus CANCELLED)
export async function deleteOrder(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status !== 'CANCELLED') {
      return {
        success: false,
        error: 'Hanya pesanan yang berstatus Dibatalkan (CANCELLED) yang dapat dihapus dari sistem.',
      };
    }

    // Delete order (OrderItems cascade delete automatically)
    await prisma.order.delete({
      where: { id: orderId },
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting order:', error);
    return { success: false, error: error.message || 'Gagal menghapus pesanan' };
  }
}

// 5. Add Items to an existing HOLD order
export interface AddItemInput {
  productId?: string;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
}

export async function addItemsToOrder(
  orderId: string,
  items: AddItemInput[],
  newResellerUnitPrice?: number
) {
  try {
    if (!items || items.length === 0) {
      return { success: false, error: 'Minimal 1 produk harus ditambahkan' };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status !== 'HOLD') {
      return {
        success: false,
        error: `Hanya order berstatus HOLD yang bisa ditambah item. Status saat ini: ${order.status}`,
      };
    }

    // Merge incoming new items by SKU / productId first
    const incomingMap = new Map<string, AddItemInput>();
    for (const it of items) {
      const sku = it.productSku.trim().toUpperCase();
      const key = it.productId || sku;
      const q = Math.max(1, Number(it.quantity) || 1);
      const p = Math.max(0, Number(it.price) || 0);

      if (incomingMap.has(key)) {
        const exist = incomingMap.get(key)!;
        exist.quantity += q;
        exist.price = p;
      } else {
        incomingMap.set(key, {
          productId: it.productId,
          productSku: sku,
          productName: it.productName.trim(),
          price: p,
          quantity: q,
        });
      }
    }

    const mergedIncomingItems = Array.from(incomingMap.values());

    await prisma.$transaction(async (tx) => {
      // Map of existing items by productId / SKU
      const existingItemsMap = new Map<string, typeof order.items[0]>();
      for (const ex of order.items) {
        const key = ex.productId || ex.productSku.trim().toUpperCase();
        existingItemsMap.set(key, ex);
      }

      // 1. Process incoming items: either update existing or create new
      const processedExistingIds = new Set<string>();

      for (const item of mergedIncomingItems) {
        const sku = item.productSku.trim().toUpperCase();
        const key = item.productId || sku;
        const q = Math.max(1, Number(item.quantity) || 1);
        const p = Math.max(0, Number(item.price) || 0);

        const existingItem = existingItemsMap.get(key);

        if (existingItem) {
          // Merge with existing item
          processedExistingIds.add(existingItem.id);
          const updatedQty = existingItem.quantity + q;
          const updatedPrice = p > 0 ? p : existingItem.price;

          await tx.orderItem.update({
            where: { id: existingItem.id },
            data: {
              price: updatedPrice,
              quantity: updatedQty,
              subtotal: updatedQty * updatedPrice,
            },
          });
        } else {
          // Create new OrderItem
          await tx.orderItem.create({
            data: {
              orderId,
              productId: item.productId || null,
              productSku: sku,
              productName: item.productName.trim(),
              price: p,
              quantity: q,
              subtotal: p * q,
            },
          });
        }

        // Increment reservedStock
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              reservedStock: { increment: q },
            },
          });
        }
      }

      // 2. Update remaining existing items: if newResellerUnitPrice provided, update only BABY TRYSPAN / reseller eligible items
      if (newResellerUnitPrice && newResellerUnitPrice > 0) {
        for (const existingItem of order.items) {
          if (!processedExistingIds.has(existingItem.id)) {
            const isBabyTryspan =
              existingItem.productName.toUpperCase().includes('BABY TRYSPAN') ||
              existingItem.productName.toUpperCase().includes('TRYSPAN');

            if (isBabyTryspan) {
              await tx.orderItem.update({
                where: { id: existingItem.id },
                data: {
                  price: newResellerUnitPrice,
                  subtotal: existingItem.quantity * newResellerUnitPrice,
                },
              });
            }
          }
        }
      }

      // 3. Recalculate totalAmount of the entire order
      const allUpdatedItems = await tx.orderItem.findMany({
        where: { orderId },
      });

      const updatedTotalAmount = allUpdatedItems.reduce((acc, it) => acc + it.subtotal, 0);

      await tx.order.update({
        where: { id: orderId },
        data: {
          totalAmount: updatedTotalAmount,
        },
      });
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error adding items to order:', error);
    return { success: false, error: error.message || 'Gagal menambahkan item ke order' };
  }
}

