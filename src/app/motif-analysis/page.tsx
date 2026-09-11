import React from 'react';
import { getMotifPerformance } from './actions';
import MotifClient from './MotifClient';

export default async function MotifAnalysisPage() {
  const motifs = await getMotifPerformance();

  return <MotifClient motifs={motifs} />;
}
