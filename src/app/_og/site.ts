import type { Metadata } from 'next';

export const SITE_URL = 'https://valuation.danelrahmani.com';
export const SITE_NAME = 'Valuation Models';
export const SITE_TITLE = 'Valuation Models · What is a company worth?';
export const SITE_DESCRIPTION = 'Value any S&P 500 company with eight models, straight from its SEC filings. Every formula visible; export to Excel.';

export const OG_ALT = 'Valuation Models: what is a company worth? Eight valuation models for every S&P 500 company, from SEC filings.';

/**
 * Canonical URL, og:url and the link-preview image for one page. Next replaces (does not merge) a parent's
 * openGraph and twitter objects, so every field is repeated here. Paths end in "/" because the site exports
 * with trailingSlash; the image is /og.png (see app/og.png/route.tsx).
 */
export function pageMeta(path: string, title = SITE_TITLE): Metadata {
  const image = { url: '/og.png', width: 1200, height: 630, alt: OG_ALT, type: 'image/png' };
  return {
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, title, description: SITE_DESCRIPTION, url: path, locale: 'en_US', images: [image] },
    twitter: { card: 'summary_large_image', title, description: SITE_DESCRIPTION, images: [image] },
  };
}
