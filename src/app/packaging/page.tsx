import React from 'react';
import { getZiplockStock } from './actions';
import PackagingClient from './PackagingClient';

export default async function PackagingPage() {
  const ziplock = await getZiplockStock();

  return <PackagingClient ziplock={ziplock} />;
}
