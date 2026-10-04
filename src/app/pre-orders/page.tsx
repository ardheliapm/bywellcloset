import React from 'react';
import PreOrdersClient from './PreOrdersClient';
import { getPreOrders } from './actions';
import { getProducts } from '../products/actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pre-Order (PO) - Bywell Closet Inventory',
  description: 'Manajemen Antrean Pre-Order & Alokasi Otomatis Kedatangan Barang',
};

export default async function PreOrdersPage() {
  const [preOrders, products] = await Promise.all([
    getPreOrders(),
    getProducts(),
  ]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PreOrdersClient initialPreOrders={preOrders} products={products} />
    </div>
  );
}
