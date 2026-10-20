import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Search 104 in order_items ---');
  const orderItems = await prisma.orderItem.findMany({
    where: {
      OR: [
        { productSku: { contains: '104', mode: 'insensitive' } },
        { productName: { contains: '104', mode: 'insensitive' } },
      ],
    },
    include: {
      order: true,
      product: true,
    },
  });

  console.log(`Found ${orderItems.length} order items with "104":`);
  for (const it of orderItems) {
    console.log(`Order #${it.order.orderNumber} (Status: ${it.order.status}, Customer: ${it.order.customerName}) | Item: SKU=${it.productSku}, Name=${it.productName}, Qty=${it.quantity}, ProductID=${it.productId}`);
  }

  console.log('\n--- Search 104 in pre_order_items ---');
  const preOrderItems = await prisma.preOrderItem.findMany({
    where: {
      OR: [
        { productSku: { contains: '104', mode: 'insensitive' } },
        { productName: { contains: '104', mode: 'insensitive' } },
      ],
    },
    include: {
      preOrder: true,
      product: true,
    },
  });

  console.log(`Found ${preOrderItems.length} pre-order items with "104":`);
  for (const it of preOrderItems) {
    console.log(`PO #${it.preOrder.poNumber} (Status: ${it.preOrder.status}, Customer: ${it.preOrder.customerName}) | Item: SKU=${it.productSku}, Name=${it.productName}, Ordered=${it.quantityOrdered}, Fulfilled=${it.quantityFulfilled}, Shipped=${it.quantityShipped}, ProductID=${it.productId}`);
  }

  console.log('\n--- Stock Transactions for Product 7faab57d-b3d5-4e6e-9bdd-d86e525e5f84 ---');
  const stockTxs = await prisma.stockTransaction.findMany({
    where: {
      productId: '7faab57d-b3d5-4e6e-9bdd-d86e525e5f84',
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`Found ${stockTxs.length} stock transactions:`);
  for (const tx of stockTxs) {
    console.log(`- Type: ${tx.type}, Qty: ${tx.quantity}, Notes: ${tx.notes}, Date: ${tx.transactionDate}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
