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
  quantityFulfilled?: number;
  quantityShipped?: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  status: string; // HOLD, PAID, SHIPPED, CANCELLED, WAITING_STOCK, PARTIAL_READY, READY, PARTIAL_SHIPPED
  totalAmount: number;
  notes: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRecord[];
  orderType?: 'REGULAR' | 'PRE_ORDER';
  rawPreOrder?: any;
}

export async function getOrders(): Promise<OrderRecord[]> {
  try {
    const [orders, preOrders] = await Promise.all([
      prisma.order.findMany({
        include: {
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.preOrder.findMany({
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
      }),
    ]);

    const mappedRegularOrders: OrderRecord[] = orders.map((o) => ({
      ...o,
      orderType: 'REGULAR',
    }));

    const mappedPreOrders: OrderRecord[] = preOrders.map((po) => ({
      id: po.id,
      orderNumber: po.poNumber,
      customerName: po.customerName,
      customerPhone: po.customerPhone,
      status: po.status,
      totalAmount: po.totalAmount,
      notes: po.notes,
      paidAt: null,
      shippedAt: null,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      items: po.items.map((it) => ({
        id: it.id,
        orderId: po.id,
        productId: it.productId,
        productSku: it.productSku,
        productName: it.productName,
        price: it.price,
        quantity: it.quantityOrdered,
        subtotal: it.subtotal,
        quantityFulfilled: it.quantityFulfilled,
        quantityShipped: it.quantityShipped,
      })),
      orderType: 'PRE_ORDER',
      rawPreOrder: po,
    }));

    const allOrders = [...mappedRegularOrders, ...mappedPreOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return allOrders;
  } catch (error) {
    console.error('Error fetching orders & pre-orders:', error);
    return [];
  }
}

// 1. Mark Order as Paid (Potong stok fisik resmi & lepas hold stock)
export async function markOrderAsPaid(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, costPrice: true },
            },
          },
        },
      },
    });

    if (!order) {
      return { success: false, error: 'Order tidak ditemukan' };
    }

    if (order.status !== 'HOLD') {
      return { success: false, error: `Order tidak dalam status HOLD (status saat ini: ${order.status})` };
    }

    // Run transaction with explicit timeout configuration for Supabase pooler
    await prisma.$transaction(async (tx) => {
      // 1. Update Order status to PAID
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // 2. Reduce physicalStock and release reservedStock
      for (const item of order.items) {
        if (item.productId) {
          const cost = item.product?.costPrice || item.costPrice || 0;
          if (cost > 0 && item.costPrice === 0) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { costPrice: cost },
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
          amount: Math.max(0, Math.floor(order.totalAmount)),
          description: `Penjualan Lunas Order #${order.orderNumber} (${order.customerName})`,
          referenceId: order.orderNumber,
        },
      });
    }, {
      maxWait: 15000,
      timeout: 30000,
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
    }, {
      maxWait: 15000,
      timeout: 30000,
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
    }, {
      maxWait: 15000,
      timeout: 30000,
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

// 6. Update Full Order Details (Edit Customer, Quantities, Prices, Add/Remove Items, Sync Stock)
export interface EditOrderItemInput {
  id?: string;
  productId?: string | null;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
}

export interface UpdateOrderPayload {
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  items: EditOrderItemInput[];
}

export async function updateOrderDetails(payload: UpdateOrderPayload) {
  try {
    const { orderId, customerName, customerPhone, notes, items } = payload;

    if (!customerName || !customerName.trim()) {
      return { success: false, error: 'Nama customer wajib diisi.' };
    }

    if (!items || items.length === 0) {
      return { success: false, error: 'Pesanan harus memiliki minimal 1 produk.' };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: 'Pesanan tidak ditemukan.' };
    }

    if (order.status === 'SHIPPED') {
      return {
        success: false,
        error: 'Pesanan yang sudah dikirim (SHIPPED) tidak dapat diedit lagi.',
      };
    }

    if (order.status === 'CANCELLED') {
      return {
        success: false,
        error: 'Pesanan yang sudah dibatalkan (CANCELLED) tidak dapat diedit.',
      };
    }

    // Clean incoming items
    const cleanItems = items.map((it) => ({
      id: it.id,
      productId: it.productId || null,
      productSku: it.productSku.trim().toUpperCase(),
      productName: it.productName.trim(),
      price: Math.max(0, Number(it.price) || 0),
      quantity: Math.max(1, Number(it.quantity) || 1),
    }));

    await prisma.$transaction(async (tx) => {
      // 1. Calculate stock difference for each product involved
      const oldProductQtyMap = new Map<string, number>();
      for (const oldIt of order.items) {
        if (oldIt.productId) {
          oldProductQtyMap.set(
            oldIt.productId,
            (oldProductQtyMap.get(oldIt.productId) || 0) + oldIt.quantity
          );
        }
      }

      const newProductQtyMap = new Map<string, number>();
      for (const newIt of cleanItems) {
        if (newIt.productId) {
          newProductQtyMap.set(
            newIt.productId,
            (newProductQtyMap.get(newIt.productId) || 0) + newIt.quantity
          );
        }
      }

      const allProductIds = new Set<string>([
        ...Array.from(oldProductQtyMap.keys()),
        ...Array.from(newProductQtyMap.keys()),
      ]);

      // Adjust stock for each product based on status
      for (const prodId of allProductIds) {
        const oldQ = oldProductQtyMap.get(prodId) || 0;
        const newQ = newProductQtyMap.get(prodId) || 0;
        const delta = newQ - oldQ; // positive = added, negative = reduced

        if (delta !== 0) {
          if (order.status === 'HOLD') {
            if (delta > 0) {
              await tx.product.update({
                where: { id: prodId },
                data: { reservedStock: { increment: delta } },
              });
            } else {
              const reduceBy = Math.abs(delta);
              await tx.product.update({
                where: { id: prodId },
                data: { reservedStock: { decrement: reduceBy } },
              });
            }
          } else if (order.status === 'PAID') {
            if (delta > 0) {
              await tx.product.update({
                where: { id: prodId },
                data: { physicalStock: { decrement: delta } },
              });
              await tx.stockTransaction.create({
                data: {
                  productId: prodId,
                  type: 'ADJUSTMENT_OUT',
                  quantity: delta,
                  notes: `Edit Order #${order.orderNumber} (Tambah ${delta} pcs)`,
                },
              });
            } else {
              const restoreQty = Math.abs(delta);
              await tx.product.update({
                where: { id: prodId },
                data: { physicalStock: { increment: restoreQty } },
              });
              await tx.stockTransaction.create({
                data: {
                  productId: prodId,
                  type: 'ADJUSTMENT_IN',
                  quantity: restoreQty,
                  notes: `Edit Order #${order.orderNumber} (Kurangi ${restoreQty} pcs)`,
                },
              });
            }
          }
        }
      }

      // 2. Sync OrderItems in DB
      const keptIds = cleanItems.map((c) => c.id).filter(Boolean) as string[];
      await tx.orderItem.deleteMany({
        where: {
          orderId,
          ...(keptIds.length > 0 ? { id: { notIn: keptIds } } : {}),
        },
      });

      let totalAmount = 0;
      for (const it of cleanItems) {
        const subtotal = it.price * it.quantity;
        totalAmount += subtotal;

        if (it.id) {
          await tx.orderItem.update({
            where: { id: it.id },
            data: {
              productId: it.productId,
              productSku: it.productSku,
              productName: it.productName,
              price: it.price,
              quantity: it.quantity,
              subtotal,
            },
          });
        } else {
          await tx.orderItem.create({
            data: {
              orderId,
              productId: it.productId,
              productSku: it.productSku,
              productName: it.productName,
              price: it.price,
              quantity: it.quantity,
              subtotal,
            },
          });
        }
      }

      // 3. Update Order record
      await tx.order.update({
        where: { id: orderId },
        data: {
          customerName: customerName.trim(),
          customerPhone: customerPhone ? customerPhone.trim() : null,
          notes: notes ? notes.trim() : null,
          totalAmount,
        },
      });

      // 4. If status was PAID, also update FinanceTransaction amount
      if (order.status === 'PAID') {
        const financeTx = await tx.financeTransaction.findFirst({
          where: { referenceId: order.orderNumber, category: 'SALES' },
        });
        if (financeTx) {
          await tx.financeTransaction.update({
            where: { id: financeTx.id },
            data: {
              amount: totalAmount,
              description: `Penjualan Lunas Order #${order.orderNumber} (${customerName.trim()}) [Diperbarui]`,
            },
          });
        }
      }
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating order details:', error);
    return { success: false, error: error.message || 'Gagal menyimpan perubahan order.' };
  }
}


