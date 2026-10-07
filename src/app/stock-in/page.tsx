import React from 'react';
import { getProducts } from '../products/actions';
import { getStockInHistory } from './actions';
import { getInboundShipments } from './inboundActions';
import StockInClient from './StockInClient';

export const dynamic = 'force-dynamic';

export default async function StockInPage() {
  const [products, history, inboundShipments] = await Promise.all([
    getProducts(),
    getStockInHistory(),
    getInboundShipments(),
  ]);

  return (
    <StockInClient
      products={products}
      history={history}
      inboundShipments={inboundShipments}
    />
  );
}
