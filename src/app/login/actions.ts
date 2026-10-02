'use server';

import { verifyPin, lockApp, changePin } from '@/app/pin/actions';

// Re-export for any legacy callers
export { verifyPin, lockApp, changePin };
