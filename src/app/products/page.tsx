import React from 'react';
import ProductList from './ProductList';
import { getProducts } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <ProductList products={products} />
    </div>
  );
}
