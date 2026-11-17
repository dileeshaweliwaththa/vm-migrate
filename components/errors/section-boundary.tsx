'use client';

import { unstable_catchError, type ErrorInfo } from 'next/error';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/errors/error-state';

// An error boundary around one risky panel, so a render-time throw inside it
// shows a small recoverable message in place of the panel instead of taking the
// whole page down to the route's `error.tsx`.
//
// Used where the input is the least predictable: the docs editor and viewer
// (stored rich-text JSON and HTML) and the Jenkins dialogs (whatever a Jenkins
// server sends back). Built on Next's `unstable_catchError`, the component-level
// counterpart of `error.tsx`.
//
// `what` names the panel in the message: "the documentation editor".
function SectionFallback({ what }: { what: string }, { error, reset }: ErrorInfo) {
  return (
    <ErrorState
      compact
      icon={TriangleAlert}
      title={`Something went wrong in ${what}.`}
      description={
        // A client-side throw keeps its message; it's the most useful thing to
        // report, and it never came from the server.
        error.message || 'The rest of the page still works.'
      }
      reference={(error as Error & { digest?: string }).digest}
      actions={
        // `reset`, not `unstable_retry`: everything inside these panels renders
        // on the client, so there is nothing on the server to fetch again.
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Try again
        </Button>
      }
    />
  );
}

export const SectionBoundary = unstable_catchError(SectionFallback);
