import { renderCard } from '../_og/card';

// Rendered once at build time and exported as out/og.png. A real .png path matters: it skips the
// trailing-slash redirect and the host serves it as image/png, which link-preview crawlers require.
export const dynamic = 'force-static';

export function GET() {
  return renderCard();
}
