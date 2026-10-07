'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { allocateStockToWaitingPreOrders } from '@/lib/preOrderFulfillment';

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

    const allProducts = await prisma.product.findMany({
      where: { isActive: true },
    });

    let totalActualReceivedPcs = 0;
    const poFulfillmentNotes: string[] = [];

    await prisma.$transaction(
      async (tx) => {
        for (const itemAudit of items) {
          const itemRecord = shipment.items.find((i) => i.id === itemAudit.itemId);
          if (!itemRecord) continue;

          const receivedQty = Math.max(0, Math.floor(Number(itemAudit.receivedQty) || 0));
          totalActualReceivedPcs += receivedQty;

          // 1. Update InboundShipmentItem record
          await tx.inboundShipmentItem.update({
            where: { id: itemRecord.id },
            data: {
              receivedQty,
              notes: itemAudit.notes ? itemAudit.notes.trim() : null,
            },
          });

          // 2. If receivedQty > 0, find or update product physicalStock in Master Data
          if (receivedQty > 0) {
            const rawSku = (itemRecord.productSku || '').trim();
            const rawName = (itemRecord.productName || '').trim();
            const cleanSku = rawSku.toLowerCase().replace(/[^a-z0-9]/g, '');

            let matchedProd = itemRecord.productId
              ? allProducts.find((p) => p.id === itemRecord.productId)
              : allProducts.find((p) => {
                  const pCleanSku = p.sku.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const pCleanMotif = (p.motif || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  const pNameClean = p.name.toLowerCase();

                  // 1. Exact ID or SKU match
                  if (p.sku.toLowerCase() === rawSku.toLowerCase()) return true;
                  if (cleanSku && pCleanSku === cleanSku) return true;

                  // 2. Motif match
                  if (p.motif && (p.motif.toLowerCase() === rawSku.toLowerCase() || p.motif.toLowerCase() === rawName.toLowerCase())) return true;
                  if (pCleanMotif && (pCleanMotif === cleanSku || rawName.toLowerCase().includes(p.motif!.toLowerCase()))) return true;

                  // 3. Name match
                  if (pNameClean === rawName.toLowerCase()) return true;
                  if (`${pNameClean} - ${p.motif || ''}`.trim() === rawName.toLowerCase()) return true;

                  return false;
                });

            // If product does not exist in Master Data yet, auto-create it so stock is NEVER lost!
            if (!matchedProd) {
              const isParis = rawName.toUpperCase().includes('PARIS') || rawName.toUpperCase().includes('JEPANG') || rawSku.toUpperCase().includes('PJ');
              const isBella = rawName.toUpperCase().includes('BELLA') || rawSku.toUpperCase().includes('BS');

              const mainCategory = isParis ? 'PARIS JAPAN' : (isBella ? 'BELLA SQUARE' : 'BABY TRYSPAN');
              const sellingPrice = isParis ? 85000 : (isBella ? 35000 : 42000);
              const wholesalePrice = isParis ? 24000 : (isBella ? 35000 : 39000);

              let extractedMotif = '';
              if (rawName.includes('-')) {
                extractedMotif = rawName.split('-').slice(1).join('-').trim();
              } else if (rawSku && !['SKU-IN', 'BARANG', 'PRODUK'].includes(rawSku.toUpperCase())) {
                extractedMotif = rawSku.replace(/^(PJ|BT|BS)[-_ ]*/i, '').trim();
              }

              let generatedSku = rawSku && !['SKU-IN', 'BARANG', 'PRODUK'].includes(rawSku.toUpperCase())
                ? rawSku.toUpperCase()
                : (isParis ? `PJ-${extractedMotif || Math.floor(100 + Math.random() * 900)}` : `BW-${extractedMotif || Math.floor(100 + Math.random() * 900)}`);

              // Ensure SKU uniqueness
              const skuExists = allProducts.some((p) => p.sku.toUpperCase() === generatedSku.toUpperCase());
              if (skuExists) {
                generatedSku = `${generatedSku}-${Math.floor(10 + Math.random() * 90)}`;
              }

              matchedProd = await tx.product.create({
                data: {
                  sku: generatedSku,
                  name: mainCategory,
                  motif: extractedMotif || null,
                  color: null,
                  costPrice: 0,
                  sellingPrice,
                  wholesalePrice,
                  physicalStock: 0, // will be incremented right below
                  reservedStock: 0,
                  isActive: true,
                },
              });

              // Also link itemRecord to this newly created product
              await tx.inboundShipmentItem.update({
                where: { id: itemRecord.id },
                data: {
                  productId: matchedProd.id,
                  productSku: matchedProd.sku,
                },
              });
            }

            // Increment physical stock
            const updatedProd = await tx.product.update({
              where: { id: matchedProd.id },
              data: {
                physicalStock: { increment: receivedQty },
              },
            });

            // 3. Auto Allocate to Waiting Pre-Orders (FIFO)
            const allocResult = await allocateStockToWaitingPreOrders(
              tx,
              updatedProd,
              receivedQty
            );

            if (allocResult.allocatedCount > 0) {
              poFulfillmentNotes.push(
                `+${allocResult.allocatedCount} pcs untuk PO #${allocResult.poNumbers.join(', #')}`
              );
            }

            // 4. Log Stock Transaction
            const selisih = receivedQty - itemRecord.expectedQty;
            const diffText =
              selisih > 0
                ? ` (Lebihan +${selisih} pcs)`
                : selisih < 0
                ? ` (Kurang ${selisih} pcs)`
                : ' (Sesuai Surat Jalan)';

            await tx.stockTransaction.create({
              data: {
                productId: matchedProd.id,
                type: 'STOCK_IN',
                quantity: receivedQty,
                notes: `Kedatangan SJ #${shipment.invoiceNumber} (${matchedProd.sku})${diffText}${
                  allocResult.allocatedCount > 0
                    ? ` [Alokasi PO: +${allocResult.allocatedCount} pcs]`
                    : ''
                }`,
              },
            });
          }
        }

        // 5. Update InboundShipment status
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

        // 6. Record Freight Expense to Finance if freightCost > 0
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
      { maxWait: 15000, timeout: 30000 }
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

// 5. Delete Inbound Shipment (Permanently, only if CANCELLED or ON_DELIVERY)
export async function deleteInboundShipment(shipmentId: string) {
  try {
    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      return { success: false, error: 'Data Surat Jalan tidak ditemukan.' };
    }

    if (shipment.status === 'RECEIVED') {
      return { success: false, error: 'Surat Jalan yang sudah masuk stok tidak dapat dihapus.' };
    }

    await prisma.inboundShipment.delete({
      where: { id: shipmentId },
    });

    revalidatePath('/stock-in');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting inbound shipment:', error);
    return { success: false, error: error.message || 'Gagal menghapus Surat Jalan' };
  }
}
