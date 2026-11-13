// X/Twitter uses the same 1200×630 card as Open Graph. Route config is re-declared because Next reads it statically.
export { default, alt, size } from './opengraph-image';
export const contentType = 'image/png';
export const dynamic = 'force-static';
