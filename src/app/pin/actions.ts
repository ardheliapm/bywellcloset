'use server';

import { prisma } from '@/lib/prisma';
import {
  hashPin,
  comparePin,
  setPinSessionCookie,
  clearPinSessionCookie,
  getStoredHashedPin,
  hasPinSession,
} from '@/lib/auth';
import { isAuthConfigured } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function verifyPin(pinInput: string) {
  try {
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      return { success: false, error: 'Silakan masukkan 6 digit PIN.' };
    }

    if (!isAuthConfigured()) {
      return {
        success: false,
        error: 'Pengaman login (AUTH_SECRET) belum diatur di server. Hubungi admin sistem.',
      };
    }

    const currentHashed = await getStoredHashedPin();
    if (!currentHashed) {
      return {
        success: false,
        error: 'PIN belum diatur di server (INITIAL_PIN). Hubungi admin sistem.',
      };
    }

    const isValid = comparePin(cleanPin, currentHashed);

    if (!isValid) {
      return { success: false, error: 'PIN yang Anda masukkan salah.' };
    }

    const sessionSet = await setPinSessionCookie();
    if (!sessionSet) {
      return { success: false, error: 'Gagal membuat sesi login. Hubungi admin sistem.' };
    }
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error verifying PIN:', error);
    return { success: false, error: error.message || 'Gagal memverifikasi PIN.' };
  }
}

export async function lockApp() {
  await clearPinSessionCookie();
  revalidatePath('/');
  redirect('/pin');
}

export async function changePin(oldPin: string, newPin: string) {
  try {
    if (!(await hasPinSession())) {
      return { success: false, error: 'Sesi login sudah berakhir. Silakan login ulang.' };
    }

    const oldClean = oldPin.trim();
    const newClean = newPin.trim();

    if (!oldClean || !newClean) {
      return { success: false, error: 'PIN lama dan PIN baru wajib diisi.' };
    }

    if (newClean.length !== 6 || !/^\d+$/.test(newClean)) {
      return { success: false, error: 'PIN baru harus terdiri dari tepat 6 angka (digit).' };
    }

    if (newClean === '123456') {
      return { success: false, error: 'PIN baru terlalu mudah ditebak. Pilih angka lain.' };
    }

    const currentHashed = await getStoredHashedPin();
    if (!currentHashed) {
      return { success: false, error: 'PIN belum diatur di server.' };
    }
    const isOldValid = comparePin(oldClean, currentHashed);

    if (!isOldValid) {
      return { success: false, error: 'PIN lama Anda salah.' };
    }

    const newHashed = hashPin(newClean);

    // Update in database
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: { password: newHashed },
      create: {
        username: 'admin',
        name: 'Admin Bywell Closet',
        password: newHashed,
        role: 'ADMIN',
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error changing PIN:', error);
    return { success: false, error: error.message || 'Gagal mengubah PIN.' };
  }
}
