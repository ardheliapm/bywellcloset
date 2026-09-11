'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword, comparePassword, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function loginUser(usernameInput: string, passwordInput: string) {
  try {
    const usernameClean = usernameInput.trim().toLowerCase();
    const passwordClean = passwordInput.trim();

    if (!usernameClean || !passwordClean) {
      return { success: false, error: 'Username dan Password wajib diisi.' };
    }

    // Check if any users exist in database, if not seed default users
    const totalUsers = await prisma.user.count();
    if (totalUsers === 0) {
      // Seed default Owner & Admin with password 'bywell123'
      const hashedDefaultPassword = hashPassword('bywell123');
      await prisma.user.createMany({
        data: [
          {
            username: 'owner',
            name: 'Owner Bywell Closet',
            password: hashedDefaultPassword,
            role: 'OWNER',
          },
          {
            username: 'admin',
            name: 'Admin Bywell Closet',
            password: hashedDefaultPassword,
            role: 'ADMIN',
          },
        ],
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username: usernameClean },
    });

    if (!user) {
      return { success: false, error: 'Username atau Password salah.' };
    }

    // Check password
    const isPasswordValid = comparePassword(passwordClean, user.password);
    if (!isPasswordValid) {
      return { success: false, error: 'Username atau Password salah.' };
    }

    // Set Session Cookie
    await setSessionCookie({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error logging in:', error);
    return { success: false, error: error.message || 'Gagal melakukan login.' };
  }
}

export async function logoutUser() {
  await clearSessionCookie();
  revalidatePath('/');
  redirect('/login');
}

export async function changePassword(oldPassword: string, newPassword: string) {
  try {
    const { getSession } = await import('@/lib/auth');
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'Sesi login tidak ditemukan. Silakan login kembali.' };
    }

    const oldClean = oldPassword.trim();
    const newClean = newPassword.trim();

    if (!oldClean || !newClean) {
      return { success: false, error: 'Password lama dan password baru wajib diisi.' };
    }

    if (newClean.length < 4) {
      return { success: false, error: 'Password baru minimal 4 karakter.' };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    });

    if (!user) {
      return { success: false, error: 'Akun user tidak ditemukan di database.' };
    }

    const isMatch = comparePassword(oldClean, user.password);
    if (!isMatch) {
      return { success: false, error: 'Password lama Anda salah.' };
    }

    const newHashed = hashPassword(newClean);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: newHashed },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error changing password:', error);
    return { success: false, error: error.message || 'Gagal mengubah password.' };
  }
}
