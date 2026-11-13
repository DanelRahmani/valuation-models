import type { Metadata } from 'next';
import { Bodoni_Moda } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import Link from 'next/link';
import './globals.css';

const display = Bodoni_Moda({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Valuation Models',
  description: 'DCF, dividend discount, APV, residual income and multiples for S&P 500 companies, with every calculation visible.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <header className="mx-auto flex max-w-6xl items-baseline justify-between px-4 py-6 sm:px-8">
          <Link href="/" className="font-serif text-xl">Valuation Models</Link>
          <nav className="flex gap-6 text-sm text-muted">
            <Link href="/value/?t=NVDA" className="link">NVIDIA case</Link>
            <Link href="/methodology/" className="link">Methodology</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">{children}</main>
        <footer className="mx-auto max-w-6xl border-t border-seam px-4 py-8 text-xs text-muted sm:px-8">
          <p>Mathematical valuations under stated assumptions. Not investment advice. Data from SEC EDGAR filings.</p>
        </footer>
      </body>
    </html>
  );
}
