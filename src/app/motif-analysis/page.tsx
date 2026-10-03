import React from 'react';
import { getMotifPerformance } from './actions';
import MotifClient from './MotifClient';

export const dynamic = 'force-dynamic';

export default async function MotifAnalysisPage() {
  const motifs = await getMotifPerformance();

  return <MotifClient motifs={motifs} />;
}
