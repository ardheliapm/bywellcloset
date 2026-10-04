import React from 'react';
import OrdersList from './OrdersList';
import { getOrders } from './actions';
import { getProducts } from '../products/actions';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const orders = await getOrders();
  const products = await getProducts();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <OrdersList orders={orders} products={products} />
    </div>
  );
}
