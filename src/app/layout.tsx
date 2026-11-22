import type { Metadata } from 'next';
import { Bodoni_Moda } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Analytics } from '@vercel/analytics/next';
import { SiteNav } from '@/components/SiteNav';
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL, pageMeta } from './_og/site';
import './globals.css';

const display = Bodoni_Moda({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-display' });

// Link-preview tags (pageMeta) resolve against metadataBase to absolute URLs; the card image is /og.png.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · Valuation Models' },
  description: SITE_DESCRIPTION,
  ...pageMeta('/'),
};

// Apply the saved theme before first paint, falling back to the system setting.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <div className="mx-auto min-h-screen max-w-7xl border-x border-seam sm:mx-8 xl:mx-auto">
          <SiteNav />
          <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8 lg:px-12">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-12 sm:px-8 lg:px-12">
            <div className="seam flex flex-col gap-4 pt-8 text-sm text-muted sm:flex-row sm:items-baseline sm:justify-between">
              <p className="max-w-md text-xs">Mathematical valuations under stated assumptions. Not investment advice. Financials from SEC EDGAR filings, refreshed monthly.</p>
              <div className="flex gap-6">
                <a className="link" href="https://danelrahmani.com">
                  danelrahmani.com
                </a>
                <a className="link" href="https://github.com/DanelRahmani/valuation-models">
                  Source on GitHub
                </a>
              </div>
            </div>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
