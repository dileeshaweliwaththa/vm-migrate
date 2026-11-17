'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/errors/error-state';

// The in-shell error boundary for every signed-in page. It sits *inside*
// `(app)/layout.tsx`, so when a page throws, the sidebar and top bar stay up
// and only the content area is replaced, with a way to try again.
//
// In production a server error's message is replaced with a generic one, so the
// message isn't shown. The digest is, because it's what matches the server log.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // There's no error-reporting service, so the browser console is where a
    // client-side throw is diagnosed.
    console.error(error);
  }, [error]);

  return (
    <div className="px-4 py-12 sm:px-8">
      <ErrorState
        icon={TriangleAlert}
        title="This page couldn't be shown."
        description="Something failed while loading it. Trying again usually works. If it keeps happening, quote the reference below."
        reference={error.digest}
        actions={
          <>
            <Button size="sm" onClick={() => unstable_retry()}>
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard">Go to the dashboard</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
