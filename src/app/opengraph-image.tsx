import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OG_ALT } from './_og/site';

// Site-wide link preview (LinkedIn, Slack, WhatsApp, X). Rendered once at build time.
export const alt = OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Static export: render once at build time.
export const dynamic = 'force-static';

// Same tokens as globals.css (light theme): creme cloth, maroon thread.
const BG = '#FDFBF6';
const PANEL = '#F8F3EE';
const INK = '#1C1917';
const MUTED = '#57534E';
const ACCENT = '#4A0E0E';

const font = (f: string) => readFile(join(process.cwd(), 'src', 'app', '_og', f));

export default async function Image() {
  const [bodoniItalic, bodoni, geist, geistMono] = await Promise.all([
    font('bodoni-moda-500-italic.woff'),
    font('bodoni-moda-500-normal.woff'),
    font('Geist-Regular.ttf'),
    font('GeistMono-Regular.ttf'),
  ]);

  // The favicon's falling bars and dashed curve, drawn large on the right.
  const bars = [0, 1, 2, 3, 4].map((i) => ({ x: 10 + i * 52, h: 280 - i * 44, o: 1 - i * 0.12 }));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: BG, padding: 28 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            border: `2px dashed rgba(74,14,14,0.35)`,
            borderRadius: 18,
            background: PANEL,
            padding: '56px 64px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="32" fill={ACCENT} />
                <rect x="14" y="20" width="5" height="26" rx="1" fill={BG} />
                <rect x="22" y="24" width="5" height="22" rx="1" fill={BG} opacity=".88" />
                <rect x="30" y="28" width="5" height="18" rx="1" fill={BG} opacity=".76" />
                <rect x="38" y="32" width="5" height="14" rx="1" fill={BG} opacity=".64" />
                <rect x="46" y="36" width="5" height="10" rx="1" fill={BG} opacity=".52" />
              </svg>
              <div style={{ fontFamily: 'Bodoni', fontSize: 40, color: INK }}>Valuation Models</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              <div style={{ fontFamily: 'BodoniItalic', fontSize: 92, lineHeight: 1.02, color: INK, letterSpacing: -1 }}>What is a company worth?</div>
              <div style={{ fontFamily: 'Geist', fontSize: 34, lineHeight: 1.3, color: MUTED }}>
                Eight models for every S&amp;P 500 company
              </div>
            </div>

            <div style={{ fontFamily: 'GeistMono', fontSize: 26, color: ACCENT }}>valuation.danelrahmani.com</div>
          </div>

          <svg width="270" height="420" viewBox="0 0 270 420" style={{ position: 'absolute', right: 56, bottom: 56 }}>
            <path d="M 10 40 C 90 55, 175 105, 250 175" fill="none" stroke={ACCENT} strokeWidth="5" strokeDasharray="14 12" strokeLinecap="round" opacity="0.8" />
            {bars.map((b) => (
              <rect key={b.x} x={b.x} y={420 - b.h} width="36" height={b.h} rx="4" fill={ACCENT} opacity={b.o} />
            ))}
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'BodoniItalic', data: bodoniItalic, style: 'italic', weight: 500 },
        { name: 'Bodoni', data: bodoni, style: 'normal', weight: 500 },
        { name: 'Geist', data: geist, style: 'normal', weight: 400 },
        { name: 'GeistMono', data: geistMono, style: 'normal', weight: 400 },
      ],
    },
  );
}
