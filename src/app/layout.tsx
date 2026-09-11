import type { Metadata } from 'next';
import './globals.css';
import AppLayoutWrapper from '@/components/AppLayoutWrapper';

export const metadata: Metadata = {
  title: 'Bywell Closet Inventory MVP',
  description: 'Sistem Manajemen Stok dan Pemrosesan Order WhatsApp Bywell Closet',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="bg-slate-950 text-slate-900 min-h-screen">
        <AppLayoutWrapper>{children}</AppLayoutWrapper>
      </body>
    </html>
  );
}
