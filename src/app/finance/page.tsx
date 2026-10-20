import React from 'react';
import { getFinanceSummary } from './actions';
import FinanceClient from './FinanceClient';
import FinanceLockScreen from './FinanceLockScreen';
import { isFinanceUnlocked } from '@/lib/financeAuth';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const isUnlocked = await isFinanceUnlocked();

  if (!isUnlocked) {
    return <FinanceLockScreen />;
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const summary = await getFinanceSummary(currentMonth, currentYear);

  return (
    <FinanceClient
      initialSummary={summary}
      initialMonth={currentMonth}
      initialYear={currentYear}
    />
  );
}
