'use client';

import { unstable_catchError, type ErrorInfo } from 'next/error';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/errors/error-state';

// `SectionBoundary` for a dialog: wraps a dialog component **at its call site**,
// so a throw anywhere in it, including the rows it maps inline, is caught.
// (A boundary only catches its descendants, so one placed inside the dialog's
// own JSX would miss errors from that dialog's render.)
//
// The fallback is itself a dialog, so the error appears where the reader was
// looking, not as a block dropped into the row of buttons the dialog was opened
// from. Closing it closes the dialog in the parent's state *before* resetting the
// boundary; resetting while the parent still says "open" would render the same
// failing dialog straight away.
//
// Used for the Jenkins dialogs, which render whatever a Jenkins server returns.
function DialogFallback(
  { what, onClose }: { what: string; onClose: () => void },
  { error, reset }: ErrorInfo
) {
  const close = () => {
    onClose();
    reset();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{what}</DialogTitle>
          <DialogDescription>This couldn&apos;t be shown. The rest of the page still works.</DialogDescription>
        </DialogHeader>
        <ErrorState
          compact
          icon={TriangleAlert}
          title="Something went wrong."
          description={error.message || 'No details were given.'}
          reference={(error as Error & { digest?: string }).digest}
          actions={
            <>
              {/* Everything in these dialogs renders on the client, so `reset`
                  is a full retry; there is nothing on the server to refetch. */}
              <Button size="sm" variant="outline" onClick={() => reset()}>
                Try again
              </Button>
              <Button size="sm" onClick={close}>
                Close
              </Button>
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

export const DialogBoundary = unstable_catchError(DialogFallback);
