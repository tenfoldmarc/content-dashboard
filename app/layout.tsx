import type { Metadata } from 'next';
import { Outfit, DM_Sans, JetBrains_Mono } from 'next/font/google';
import ClientLayout from '@/components/ClientLayout';
import ThemeProvider from '@/components/ThemeProvider';
import ToastProvider from '@/components/ToastProvider';
import GlobalFeatures from '@/components/GlobalFeatures';
import { BRAND } from '@/lib/config';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['400', '500', '600', '700'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: `Content performance dashboard for ${BRAND.name}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased">
        <ThemeProvider>
          <GlobalFeatures />
          <ToastProvider>
            <ClientLayout>
              {children}
            </ClientLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
