import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Dipanggil Vercel Cron sekali sehari supaya database Supabase (paket gratis)
// tidak di-pause karena sepi aktivitas. Hanya membaca jumlah baris, tidak mengubah
// atau menampilkan data apa pun, jadi aman diakses tanpa PIN.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.product.count();
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Keepalive gagal menjangkau database:', error);
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
