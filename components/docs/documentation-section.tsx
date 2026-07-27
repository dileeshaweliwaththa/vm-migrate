'use client';

import { useState } from 'react';
import { FileText, Pencil, Plus, Sparkles } from 'lucide-react';
import { useProjectDoc } from '@/hooks/docs/useProjectDoc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DocView } from '@/components/docs/doc-view';
import { DocEditorDialog } from '@/components/docs/doc-editor';

// Documentation section for the project page. Shows the rendered doc (or an
// empty state) inline for everyone; editors/admins get an Edit/Add button that
// opens the Tiptap editor in a modal (add/edit + AI generation happen there).
export function DocumentationSection({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const { data: doc, isLoading, error } = useProjectDoc(projectId);
  const [editing, setEditing] = useState(false);
  const hasContent = Boolean(doc?.contentHtml?.trim());

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Documentation</h2>
          {doc?.generatedByAi ? (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" /> AI
            </Badge>
          ) : null}
        </div>
        {canEdit ? (
          <Button size="sm" variant={hasContent ? 'outline' : 'default'} onClick={() => setEditing(true)}>
            {hasContent ? (
              <>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Add Documentation
              </>
            )}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load documentation.'}
        </p>
      ) : hasContent ? (
        <div className="rounded-lg border border-border px-5 py-4">
          <DocView html={doc?.contentHtml ?? ''} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <FileText className="h-6 w-6 opacity-60" />
          <span>No documentation yet.{canEdit ? ' Add it, or generate a draft with AI.' : ''}</span>
        </div>
      )}

      {canEdit ? (
        <DocEditorDialog
          projectId={projectId}
          initialDoc={doc ?? null}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}
    </section>
  );
}
