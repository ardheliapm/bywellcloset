'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface ProductMatchInfo {
  id: string;
  sku: string;
  name: string;
  motif: string | null;
  color: string | null;
  sellingPrice: number;
  wholesalePrice: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
}

export async function getActiveProductsForOrder(): Promise<ProductMatchInfo[]> {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      motif: p.motif,
      color: p.color,
      sellingPrice: p.sellingPrice,
      wholesalePrice: p.wholesalePrice || p.sellingPrice,
      physicalStock: p.physicalStock,
      reservedStock: p.reservedStock,
      availableStock: p.physicalStock - p.reservedStock,
    }));
  } catch (error) {
    console.error('Error fetching products for order:', error);
    return [];
  }
}

export interface CreateOrderItemInput {
  productId?: string;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone?: string;
  notes?: string;
  items: CreateOrderItemInput[];
}

export async function createOrder(data: CreateOrderInput) {
  try {
    const customerNameClean = data.customerName.trim();
    if (!customerNameClean) {
      return { success: false, error: 'Nama Customer wajib diisi' };
    }

    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'Order harus memiliki minimal 1 produk' };
    }

    // 1. Merge duplicate items by SKU / productId
    const mergedMap = new Map<string, {
      productId: string | null;
      productSku: string;
      productName: string;
      price: number;
      quantity: number;
    }>();

    for (const item of data.items) {
      const sku = item.productSku.trim().toUpperCase();
      const key = item.productId || sku;
      const q = Math.max(1, Number(item.quantity) || 1);
      const p = Math.max(0, Number(item.price) || 0);

      if (mergedMap.has(key)) {
        const exist = mergedMap.get(key)!;
        exist.quantity += q;
        exist.price = p;
      } else {
        mergedMap.set(key, {
          productId: item.productId || null,
          productSku: sku,
          productName: item.productName.trim(),
          price: p,
          quantity: q,
        });
      }
    }

    const mergedItems = Array.from(mergedMap.values());

    // Generate Order Number: ORD-YYYYMMDD-XXXX
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${todayStr}-${randomSuffix}`;

    // Calculate total
    const totalAmount = mergedItems.reduce((acc, item) => acc + item.quantity * item.price, 0);

    // Run transaction: create order, order_items, and increment reservedStock
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          customerName: customerNameClean,
          customerPhone: data.customerPhone?.trim() || null,
          status: 'HOLD',
          totalAmount,
          notes: data.notes?.trim() || null,
          items: {
            create: mergedItems.map((item) => ({
              productId: item.productId,
              productSku: item.productSku,
              productName: item.productName,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.price * item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // 2. Increment reservedStock for each product
      for (const item of mergedItems) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              reservedStock: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      return newOrder;
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/paste-order');
    revalidatePath('/');

    return {
      success: true,
      orderId: result.id,
      orderNumber: result.orderNumber,
      totalAmount: result.totalAmount,
    };
  } catch (error: any) {
    console.error('Error creating order:', error);
    return { success: false, error: error.message || 'Gagal menyimpan order' };
  }
}
