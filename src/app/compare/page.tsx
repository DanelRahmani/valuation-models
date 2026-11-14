import { Suspense } from 'react';
import { pageMeta } from '../_og/site';
import CompareApp from '@/components/CompareApp';

export const metadata = { title: 'Compare', ...pageMeta('/compare/', 'Compare companies · Valuation Models') };

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="py-24 text-muted">Loading…</p>}>
      <CompareApp />
    </Suspense>
  );
}
