import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseWhatsAppOrderText } from '@/lib/orderParser';
import { revalidatePath } from 'next/cache';

const EXPECTED_API_KEY = process.env.API_KEY || 'bywell_secret_key_2026';

export async function POST(request: Request) {
  try {
    // 1. Verify API Key
    const apiKeyHeader = request.headers.get('x-api-key');
    if (apiKeyHeader !== EXPECTED_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid x-api-key' },
        { status: 401 }
      );
    }

    // 2. Parse Body Payload
    const body = await request.json();
    const { rawText, phone, notes } = body;

    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return NextResponse.json(
        { success: false, error: 'Field "rawText" wajib diisi dengan teks order WhatsApp.' },
        { status: 400 }
      );
    }

    // 3. Get Active Products from Database
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    // 4. Parse Text
    const parseResult = parseWhatsAppOrderText(rawText, products);

    if (parseResult.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada item produk valid yang terdeteksi dari teks.' },
        { status: 400 }
      );
    }

    // 5. Generate Order Number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${todayStr}-${randomSuffix}`;

    // 6. Run Prisma Transaction (Create Order & Increment reservedStock)
    const newOrder = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerName: parseResult.customerName,
          customerPhone: phone ? String(phone).trim() : null,
          status: 'HOLD',
          totalAmount: parseResult.totalAmount,
          notes: notes ? String(notes).trim() : 'Auto-created via n8n WA webhook',
          items: {
            create: parseResult.items.map((item) => ({
              productId: item.productId || null,
              productSku: item.productSku,
              productName: item.productName,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // Increment reservedStock for each matched product
      for (const item of parseResult.items) {
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

      return createdOrder;
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/paste-order');
    revalidatePath('/');

    return NextResponse.json({
      success: true,
      message: 'Order berhasil disimpan dan stokHOLD dikunci.',
      data: {
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        customerName: parseResult.customerName,
        customerPhone: phone || null,
        totalAmount: parseResult.totalAmount,
        totalQty: parseResult.totalQty,
        itemsCount: parseResult.items.length,
        replyMessage: parseResult.formattedReply,
      },
    });
  } catch (error: any) {
    console.error('Error in n8n WA order webhook API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
