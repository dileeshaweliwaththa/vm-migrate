import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/errors/error-state';

// What a signed-in page renders when it calls `notFound()`: a stale or mistyped
// link to a project that doesn't exist. Inside the shell, so the sidebar is still
// there to go somewhere else.
export default function AppNotFound() {
  return (
    <div className="px-4 py-12 sm:px-8">
      <ErrorState
        icon={SearchX}
        title="Not found"
        description="What this link points to doesn't exist, or it has been removed."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard">Go to the dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
