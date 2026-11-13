import { pageMeta } from '../_og/site';
import { Suspense } from 'react';
import ValueApp from '@/components/ValueApp';

export const metadata = { title: 'Valuation', ...pageMeta('/value/', 'Value a company · Valuation Models') };

export default function ValuePage() {
  return (
    <Suspense fallback={<p className="py-24 text-muted">Loading…</p>}>
      <ValueApp />
    </Suspense>
  );
}
