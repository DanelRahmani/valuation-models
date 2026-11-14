'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RandomCompanyButton } from './RandomCompany';

const ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/value/', label: 'Value a company' },
  { href: '/compare/', label: 'Compare' },
  { href: '/methodology/', label: 'Methodology' },
];

export function SiteNav() {
  const path = usePathname();
  const norm = (p: string) => (p.endsWith('/') ? p : p + '/');
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-6 sm:px-8 lg:px-12">
      <Link href="/" aria-label="Valuation Models home" className="shrink-0">
        <Mark />
      </Link>
      <nav aria-label="Main">
        <ul className="nav-glass flex rounded-full px-2 text-sm font-medium shadow-lg shadow-[rgba(74,14,14,0.05)] ring-1 ring-[var(--seam)]">
          {ITEMS.map((it) => {
            const active = norm(path) === it.href;
            return (
              // On phones the logo already links home and "Value a company" is the search on the home page.
              <li key={it.href} className={it.href === '/value/' || it.href === '/' ? 'hidden sm:block' : ''}>
                <Link
                  href={it.href}
                  className={`relative block px-2.5 py-2 transition-colors sm:px-3 ${active ? 'font-semibold text-accent' : 'text-muted hover:text-accent'}`}
                >
                  {it.label}
                  {active && <span aria-hidden className="seam absolute inset-x-2 -bottom-px" style={{ borderTopColor: 'currentColor' }} />}
                </Link>
              </li>
            );
          })}
          <li>
            <a
              href="https://github.com/DanelRahmani/valuation-models"
              className="flex items-center px-2.5 py-2 text-muted transition-colors hover:text-accent sm:px-3"
              aria-label="Source code on GitHub"
            >
              <GitHubIcon />
            </a>
          </li>
        </ul>
      </nav>
      <div className="flex items-center gap-2">
        <RandomCompanyButton compact />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** The brand mark: ten discounted cash-flow bars sewn by a thread. Same drawing as the favicon. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden className="rounded-full shadow-[0_0_24px_4px_rgba(74,14,14,0.08)]">
      <circle cx="32" cy="32" r="32" className="fill-accent" />
      {[0, 1, 2, 3, 4].map((i) => {
        const h = 26 - i * 4;
        return <rect key={i} x={14 + i * 8} y={46 - h} width="5" height={h} rx="1" fill="rgb(var(--bg))" opacity={1 - i * 0.12} />;
      })}
      <path d="M14 18 C 26 20, 38 26, 50 36" fill="none" stroke="rgb(var(--bg))" strokeWidth="1.6" strokeDasharray="3 2.5" strokeLinecap="round" />
    </svg>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const flip = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {}
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="nav-glass grid h-10 w-10 place-items-center rounded-full text-accent shadow-lg shadow-[rgba(74,14,14,0.05)] ring-1 ring-[var(--seam)] transition-transform hover:scale-105"
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
