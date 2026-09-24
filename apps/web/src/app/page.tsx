'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { readStoredMode } from '@/components/Header';
import { getLinkedSlot } from '@/lib/linked-slot';

// `/` routes per mode (control-room handoff): My node when chosen or when a slot is linked,
// Chain otherwise. Client-side because the choice lives in the browser.
export default function RootRedirect() {
  const router = useRouter();
  useEffect(() => {
    const mode = readStoredMode() ?? (getLinkedSlot() ? 'node' : 'chain');
    router.replace(mode === 'node' ? '/node' : '/chain');
  }, [router]);
  return null;
}
