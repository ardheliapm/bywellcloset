import React from 'react';
import { getFinanceSummary } from './actions';
import FinanceClient from './FinanceClient';

export default async function FinancePage() {
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
