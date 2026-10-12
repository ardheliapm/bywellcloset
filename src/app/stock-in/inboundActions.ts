'use server';

export const maxDuration = 120;

import { prisma } from '@/lib/prisma';
import type { Prisma, Product } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import {
  allocateStockToWaitingPreOrders,
  allocateStockToWaitingPreOrdersBatch,
} from '@/lib/preOrderFulfillment';
import { resolveOrCreateInboundProduct } from '@/lib/inboundProductMatcher';

export interface InboundItemInput {
  productId?: string | null;
  productSku: string;
  productName: string;
  expectedQty: number;
}

export interface CreateInboundShipmentPayload {
  invoiceNumber: string;
  supplierName?: string;
  expectedDate?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  notes?: string | null;
  items: InboundItemInput[];
}

export interface InboundAuditItemInput {
  itemId: string;
  productId?: string | null;
  receivedQty: number;
  notes?: string | null;
}

export interface ReceiveInboundPayload {
  shipmentId: string;
  freightCost?: number;
  auditNotes?: string | null;
  items: InboundAuditItemInput[];
}

export interface InboundShipmentItemRecord {
  id: string;
  shipmentId: string;
  productId: string | null;
  productSku: string;
  productName: string;
  expectedQty: number;
  receivedQty: number;
  notes: string | null;
  product?: {
    id: string;
    sku: string;
    name: string;
    physicalStock: number;
    reservedStock: number;
  } | null;
}

export interface InboundShipmentRecord {
  id: string;
  invoiceNumber: string;
  supplierName: string | null;
  status: string; // ON_DELIVERY, RECEIVED, CANCELLED
  totalExpectedPcs: number;
  totalReceivedPcs: number;
  freightCost: number;
  expectedDate: Date | null;
  receivedDate: Date | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  notes: string | null;
  auditNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: InboundShipmentItemRecord[];
}

// 1. Get All Inbound Shipments
export async function getInboundShipments(): Promise<InboundShipmentRecord[]> {
  try {
    const shipments = await prisma.inboundShipment.findMany({
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

    return shipments as any;
  } catch (error) {
    console.error('Error fetching inbound shipments:', error);
    return [];
  }
}

// 2. Create Inbound Shipment (Status: ON_DELIVERY)
export async function createInboundShipment(payload: CreateInboundShipmentPayload) {
  try {
    const { invoiceNumber, supplierName, expectedDate, attachmentUrl, attachmentType, notes, items } = payload;

    if (!invoiceNumber || !invoiceNumber.trim()) {
      return { success: false, error: 'Nomor Surat Jalan / Invoice wajib diisi.' };
    }

    if (!items || items.length === 0) {
      return { success: false, error: 'Minimal harus ada 1 barang dalam daftar Surat Jalan.' };
    }

    const cleanItems = items
      .filter((it) => (it.productSku?.trim() || it.productName?.trim()) && Number(it.expectedQty) > 0)
      .map((it) => ({
        productId: it.productId || null,
        productSku: (it.productSku || it.productName || 'SKU-IN').trim().toUpperCase(),
        productName: (it.productName || it.productSku || 'Produk Kiriman').trim(),
        expectedQty: Math.max(1, Math.floor(Number(it.expectedQty) || 1)),
      }));

    if (cleanItems.length === 0) {
      return { success: false, error: 'Minimal harus ada 1 barang yang valid.' };
    }

    const totalExpectedPcs = cleanItems.reduce((acc, it) => acc + it.expectedQty, 0);

    const existing = await prisma.inboundShipment.findUnique({
      where: { invoiceNumber: invoiceNumber.trim().toUpperCase() },
    });

    if (existing) {
      return { success: false, error: `Nomor Invoice/SJ "${invoiceNumber}" sudah pernah dicatat sebelumnya.` };
    }

    const newShipment = await prisma.inboundShipment.create({
      data: {
        invoiceNumber: invoiceNumber.trim().toUpperCase(),
        supplierName: (supplierName || 'Konveksi / Gudang').trim(),
        status: 'ON_DELIVERY',
        totalExpectedPcs,
        totalReceivedPcs: 0,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        notes: notes ? notes.trim() : null,
        items: {
          create: cleanItems.map((it) => ({
            productId: it.productId,
            productSku: it.productSku,
            productName: it.productName,
            expectedQty: it.expectedQty,
            receivedQty: 0,
          })),
        },
      },
    });

    revalidatePath('/stock-in');
    return { success: true, id: newShipment.id, invoiceNumber: newShipment.invoiceNumber };
  } catch (error: any) {
    console.error('Error creating inbound shipment:', error);
    return { success: false, error: error.message || 'Gagal menyimpan Surat Jalan Inbound' };
  }
}

// 3. Receive & Audit Inbound Shipment (Physical Stock In + Auto PO Allocation + Freight Expense)
export async function receiveInboundShipment(payload: ReceiveInboundPayload) {
  try {
    const { shipmentId, freightCost = 0, auditNotes, items } = payload;

    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: shipmentId },
      include: { items: true },
    });

    if (!shipment) {
      return { success: false, error: 'Data Surat Jalan tidak ditemukan.' };
    }

    if (shipment.status === 'RECEIVED') {
      return { success: false, error: 'Surat Jalan ini sudah pernah diverifikasi & diterima sebelumnya.' };
    }

    if (shipment.status === 'CANCELLED') {
      return { success: false, error: 'Surat Jalan ini berstatus Dibatalkan.' };
    }

    // Include inactive products too, so we never create a duplicate SKU (unique constraint)
    const allProducts = await prisma.product.findMany();

    let totalActualReceivedPcs = 0;
    const poFulfillmentNotes: string[] = [];

    await prisma.$transaction(
      async (tx) => {
        interface ProcessedInboundItem {
          itemRecord: (typeof shipment.items)[0];
          matchedProd: Product;
          receivedQty: number;
        }

        const processedItems: ProcessedInboundItem[] = [];

        for (const itemAudit of items) {
          const itemRecord = shipment.items.find((i) => i.id === itemAudit.itemId);
          if (!itemRecord) continue;

          const receivedQty = Math.max(0, Math.floor(Number(itemAudit.receivedQty) || 0));
          totalActualReceivedPcs += receivedQty;

          if (receivedQty > 0) {
            const rawSku = (itemRecord.productSku || '').trim();
            const rawName = (itemRecord.productName || '').trim();

            let matchedProd = itemRecord.productId
              ? allProducts.find((p) => p.id === itemRecord.productId)
              : undefined;

            if (!matchedProd) {
              const resolved = await resolveOrCreateInboundProduct(tx, allProducts, rawSku, rawName);
              matchedProd = resolved.product;
            }

            // 1. Update InboundShipmentItem record once with linked productId and receivedQty
            await tx.inboundShipmentItem.update({
              where: { id: itemRecord.id },
              data: {
                receivedQty,
                productId: matchedProd.id,
                notes: itemAudit.notes ? itemAudit.notes.trim() : null,
              },
            });

            processedItems.push({
              itemRecord,
              matchedProd,
              receivedQty,
            });
          } else {
            // receivedQty is 0
            await tx.inboundShipmentItem.update({
              where: { id: itemRecord.id },
              data: {
                receivedQty: 0,
                notes: itemAudit.notes ? itemAudit.notes.trim() : null,
              },
            });
          }
        }

        // 2. Aggregate received items by product for high-performance batch allocation
        const productBatchMap = new Map<string, { product: Product; totalReceivedQty: number }>();
        for (const pItem of processedItems) {
          const existing = productBatchMap.get(pItem.matchedProd.id);
          if (existing) {
            existing.totalReceivedQty += pItem.receivedQty;
          } else {
            productBatchMap.set(pItem.matchedProd.id, {
              product: pItem.matchedProd,
              totalReceivedQty: pItem.receivedQty,
            });
          }
        }

        // 3. High-performance batch allocation to waiting pre-orders (FIFO)
        const itemsToAllocate = Array.from(productBatchMap.values()).map((e) => ({
          product: e.product,
          availableQty: e.totalReceivedQty,
        }));

        const batchAllocResult = await allocateStockToWaitingPreOrdersBatch(tx, itemsToAllocate);
        poFulfillmentNotes.push(...batchAllocResult.poFulfillmentNotes);

        // 4. Update product stock (physicalStock + reservedStock) in ONE atomic query per unique product
        for (const [prodId, data] of productBatchMap.entries()) {
          const allocInfo = batchAllocResult.allocationsByProductId.get(prodId);
          const allocatedCount = allocInfo?.allocatedCount || 0;

          await tx.product.update({
            where: { id: prodId },
            data: {
              physicalStock: { increment: data.totalReceivedQty },
              reservedStock: { increment: allocatedCount },
            },
          });
        }

        // 5. Bulk insert stock transactions in ONE single query
        const stockTransactionsToCreate: Prisma.StockTransactionCreateManyInput[] = [];
        for (const pItem of processedItems) {
          const allocInfo = batchAllocResult.allocationsByProductId.get(pItem.matchedProd.id);
          const allocatedCount = allocInfo?.allocatedCount || 0;

          const selisih = pItem.receivedQty - pItem.itemRecord.expectedQty;
          const diffText =
            selisih > 0
              ? ` (Lebihan +${selisih} pcs)`
              : selisih < 0
              ? ` (Kurang ${selisih} pcs)`
              : ' (Sesuai Surat Jalan)';

          stockTransactionsToCreate.push({
            productId: pItem.matchedProd.id,
            type: 'STOCK_IN',
            quantity: pItem.receivedQty,
            notes: `Kedatangan SJ #${shipment.invoiceNumber} (${pItem.matchedProd.sku})${diffText}${
              allocatedCount > 0 ? ` [Alokasi PO: +${allocatedCount} pcs]` : ''
            }`,
          });
        }

        if (stockTransactionsToCreate.length > 0) {
          await tx.stockTransaction.createMany({
            data: stockTransactionsToCreate,
          });
        }

        // 6. Update InboundShipment status
        await tx.inboundShipment.update({
          where: { id: shipmentId },
          data: {
            status: 'RECEIVED',
            totalReceivedPcs: totalActualReceivedPcs,
            freightCost: Math.max(0, Math.floor(freightCost)),
            receivedDate: new Date(),
            auditNotes: auditNotes ? auditNotes.trim() : null,
          },
        });

        // 7. Record Freight Expense to Finance if freightCost > 0
        if (freightCost > 0) {
          await tx.financeTransaction.create({
            data: {
              type: 'EXPENSE',
              category: 'ONG_KIR_RESTOK',
              amount: Math.max(0, Math.floor(freightCost)),
              description: `Biaya Ongkir Surat Jalan #${shipment.invoiceNumber} (${totalActualReceivedPcs} pcs diterima)`,
              referenceId: shipment.invoiceNumber,
            },
          });
        }
      },
      { maxWait: 30000, timeout: 120000 }
    );

    revalidatePath('/stock-in');
    revalidatePath('/pre-orders');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');

    return {
      success: true,
      totalReceivedPcs: totalActualReceivedPcs,
      poAllocations: poFulfillmentNotes,
    };
  } catch (error: any) {
    console.error('Error receiving inbound shipment:', error);
    return { success: false, error: error.message || 'Gagal memproses verifikasi kedatangan barang' };
  }
}

// 4. Cancel Inbound Shipment
export async function cancelInboundShipment(shipmentId: string) {
  try {
    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      return { success: false, error: 'Data Surat Jalan tidak ditemukan.' };
    }

    if (shipment.status === 'RECEIVED') {
      return { success: false, error: 'Surat Jalan yang sudah diverifikasi masuk stok tidak dapat dibatalkan.' };
    }

    await prisma.inboundShipment.update({
      where: { id: shipmentId },
      data: {
        status: 'CANCELLED',
      },
    });

    revalidatePath('/stock-in');
    return { success: true };
  } catch (error: any) {
    console.error('Error cancelling inbound shipment:', error);
    return { success: false, error: error.message || 'Gagal membatalkan Surat Jalan' };
  }
}

// 5. Delete Inbound Shipment (Permanently, with automatic stock rollback if RECEIVED)
export async function deleteInboundShipment(shipmentId: string) {
  try {
    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: shipmentId },
      include: { items: true },
    });

    if (!shipment) {
      return { success: false, error: 'Data Surat Jalan tidak ditemukan.' };
    }

    await prisma.$transaction(
      async (tx) => {
        // If shipment was already received, rollback physical stock
        if (shipment.status === 'RECEIVED') {
          for (const item of shipment.items) {
            if (item.receivedQty > 0) {
              // Find product by item.productId or by SKU
              const prod = item.productId
                ? await tx.product.findUnique({ where: { id: item.productId } })
                : await tx.product.findFirst({
                    where: {
                      OR: [
                        { sku: { equals: item.productSku, mode: 'insensitive' } },
                        { sku: { equals: item.productSku.replace(/^(PJ|BT|BS)[-_ ]*/i, ''), mode: 'insensitive' } },
                      ],
                    },
                  });

              if (prod) {
                const newPhysicalStock = Math.max(0, prod.physicalStock - item.receivedQty);
                await tx.product.update({
                  where: { id: prod.id },
                  data: {
                    physicalStock: newPhysicalStock,
                  },
                });
              }
            }
          }

          // Delete stock transactions associated with this SJ
          await tx.stockTransaction.deleteMany({
            where: {
              notes: { contains: shipment.invoiceNumber },
            },
          });

          // Delete finance expense associated with this SJ
          await tx.financeTransaction.deleteMany({
            where: {
              referenceId: shipment.invoiceNumber,
            },
          });
        }

        // Delete the shipment and all its items (cascade)
        await tx.inboundShipment.delete({
          where: { id: shipmentId },
        });
      },
      { maxWait: 30000, timeout: 120000 }
    );

    revalidatePath('/stock-in');
    revalidatePath('/products');
    revalidatePath('/finance');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting inbound shipment:', error);
    return { success: false, error: error.message || 'Gagal menghapus Surat Jalan' };
  }
}
