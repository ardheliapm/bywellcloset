import React from 'react';
import { getProducts } from '../products/actions';
import StockOpnameClient from './StockOpnameClient';

export const dynamic = 'force-dynamic';
// Menerapkan puluhan produk sekaligus bisa lebih dari 10 detik di paket gratis
export const maxDuration = 60;

export const metadata = {
  title: 'Stok Opname - Bywell Closet Inventory',
  description: 'Samakan stok di sistem dengan hasil hitung fisik',
};

export default async function StockOpnamePage() {
  const products = await getProducts();
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <StockOpnameClient products={products} />
    </div>
  );
}
