import React from 'react';
import PasteOrderClient from './PasteOrderClient';
import { getActiveProductsForOrder } from './actions';

export const dynamic = 'force-dynamic';

export default async function PasteOrderPage() {
  const products = await getActiveProductsForOrder();

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PasteOrderClient products={products} />
    </div>
  );
}
