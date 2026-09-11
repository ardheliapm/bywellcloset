'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  motif: string | null;
  color: string | null;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BulkProductInput {
  sku: string;
  name: string;
  motif?: string;
  color?: string;
  costPrice?: number;
  sellingPrice: number;
  wholesalePrice?: number;
  physicalStock: number;
}

export async function getProducts(): Promise<ProductItem[]> {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return products.map((product) => ({
      ...product,
      wholesalePrice: product.wholesalePrice || product.sellingPrice,
      availableStock: product.physicalStock - product.reservedStock,
    }));
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function createProduct(formData: {
  sku: string;
  name: string;
  motif?: string;
  color?: string;
  costPrice?: number;
  sellingPrice: number;
  wholesalePrice?: number;
  physicalStock: number;
}) {
  try {
    const skuClean = formData.sku.trim().toUpperCase();
    const nameClean = formData.name.trim();

    if (!skuClean) {
      return { success: false, error: 'SKU wajib diisi' };
    }

    if (!nameClean) {
      return { success: false, error: 'Nama Produk wajib diisi' };
    }

    // Check SKU duplicate
    const existing = await prisma.product.findUnique({
      where: { sku: skuClean },
    });

    if (existing) {
      return { success: false, error: `SKU "${skuClean}" sudah terdaftar` };
    }

    const costPrice = Math.max(0, Math.floor(Number(formData.costPrice) || 0));
    const sellingPrice = Math.max(0, Math.floor(Number(formData.sellingPrice) || 0));
    const wholesalePrice = formData.wholesalePrice !== undefined
      ? Math.max(0, Math.floor(Number(formData.wholesalePrice) || 0))
      : sellingPrice;

    const newProduct = await prisma.product.create({
      data: {
        sku: skuClean,
        name: nameClean,
        motif: formData.motif?.trim() || null,
        color: formData.color?.trim() || null,
        costPrice,
        sellingPrice,
        wholesalePrice,
        physicalStock: Math.max(0, Math.floor(Number(formData.physicalStock) || 0)),
        reservedStock: 0,
        isActive: true,
      },
    });

    // If initial physicalStock > 0, log a stock_in transaction automatically
    if (newProduct.physicalStock > 0) {
      await prisma.stockTransaction.create({
        data: {
          productId: newProduct.id,
          type: 'STOCK_IN',
          quantity: newProduct.physicalStock,
          notes: 'Stok awal saat pendaftaran produk',
        },
      });
    }

    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error creating product:', error);
    return { success: false, error: error.message || 'Gagal menyimpan produk' };
  }
}

export async function bulkCreateProducts(items: BulkProductInput[], freightCost: number = 0) {
  try {
    if (!items || items.length === 0) {
      return { success: false, error: 'Tidak ada data produk yang diimpor.' };
    }

    // Get existing SKUs to avoid duplicates
    const existingProducts = await prisma.product.findMany({
      select: { sku: true },
    });
    const existingSkus = new Set(existingProducts.map((p) => p.sku.toUpperCase()));

    let createdCount = 0;
    let skippedCount = 0;
    let totalPcsCreated = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const skuClean = item.sku ? String(item.sku).trim().toUpperCase() : '';
      const nameClean = item.name ? String(item.name).trim() : '';

      if (!skuClean || !nameClean) {
        errors.push(`Baris ${i + 1}: SKU atau Nama Produk kosong.`);
        skippedCount++;
        continue;
      }

      if (existingSkus.has(skuClean)) {
        errors.push(`Baris ${i + 1}: SKU "${skuClean}" sudah terdaftar di database.`);
        skippedCount++;
        continue;
      }

      const costPrice = Math.max(0, Math.floor(Number(item.costPrice) || 0));
      const sellingPrice = Math.max(0, Math.floor(Number(item.sellingPrice) || 0));
      const wholesalePrice = item.wholesalePrice !== undefined
        ? Math.max(0, Math.floor(Number(item.wholesalePrice) || 0))
        : sellingPrice;
      const physicalStock = Math.max(0, Math.floor(Number(item.physicalStock) || 0));

      const newProduct = await prisma.product.create({
        data: {
          sku: skuClean,
          name: nameClean,
          motif: item.motif ? String(item.motif).trim() : null,
          color: item.color ? String(item.color).trim() : null,
          costPrice,
          sellingPrice,
          wholesalePrice,
          physicalStock,
          reservedStock: 0,
          isActive: true,
        },
      });

      existingSkus.add(skuClean);
      createdCount++;
      totalPcsCreated += physicalStock;

      // Log initial stock transaction if physicalStock > 0
      if (physicalStock > 0) {
        await prisma.stockTransaction.create({
          data: {
            productId: newProduct.id,
            type: 'STOCK_IN',
            quantity: physicalStock,
            notes: 'Stok awal saat impor massal (Excel)',
          },
        });
      }
    }

    // Auto-record Freight Cost to Finance Transactions if freightCost > 0
    if (freightCost > 0) {
      await prisma.financeTransaction.create({
        data: {
          type: 'EXPENSE',
          category: 'ONG_KIR_RESTOK',
          amount: Math.max(0, Math.floor(freightCost)),
          description: `Biaya Ongkir Restok Impor Excel (${createdCount} SKU / ${totalPcsCreated} pcs)`,
        },
      });
    }

    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');

    return {
      success: true,
      createdCount,
      skippedCount,
      errors,
    };
  } catch (error: any) {
    console.error('Error bulk creating products:', error);
    return { success: false, error: error.message || 'Gagal mengimpor produk.' };
  }
}

export async function toggleProductStatus(id: string, currentStatus: boolean) {
  try {
    await prisma.product.update({
      where: { id },
      data: { isActive: !currentStatus },
    });

    revalidatePath('/products');
    return { success: true };
  } catch (error) {
    console.error('Error toggling product status:', error);
    return { success: false, error: 'Gagal mengubah status produk' };
  }
}
