import React from 'react';
import { getProducts } from '../products/actions';
import { getStockInHistory } from './actions';
import StockInClient from './StockInClient';

export default async function StockInPage() {
  const products = await getProducts();
  const history = await getStockInHistory();

  return <StockInClient products={products} history={history} />;
}
