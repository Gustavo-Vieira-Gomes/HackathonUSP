'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Recarrega os dados do Server Component a cada `intervalMs`, sem recarregar a página. */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
