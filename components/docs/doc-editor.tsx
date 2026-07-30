'use client';

import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { toast } from 'sonner';
import { Save, Sparkles } from 'lucide-react';
import { tiptapExtensions, EMPTY_DOC } from '@/lib/tiptap/extensions';
import { useSaveProjectDoc } from '@/hooks/docs/useProjectDoc';
import { useGenerateDocs } from '@/hooks/ai/useGenerateDocs';
import type { ProjectDoc } from '@/types/common/doc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocToolbar } from '@/components/docs/doc-toolbar';

// The editing surface, mounted only while the dialog is open so useEditor
// initializes from the latest saved doc each time. A shadcn toolbar drives the
// Tiptap editor; "Generate by AI" fills a draft; Save persists the canonical
// JSON (the server re-derives the read-only HTML) and closes the dialog.
function DocEditorBody({
  projectId,
  initialDoc,
  onSaved,
}: {
  projectId: string;
  initialDoc: ProjectDoc | null;
  onSaved: () => void;
}) {
  const save = useSaveProjectDoc(projectId);
  const generate = useGenerateDocs();
  const [generatedByAi, setGeneratedByAi] = useState(initialDoc?.generatedByAi ?? false);

  const editor = useEditor({
    extensions: [
      ...tiptapExtensions,
      Placeholder.configure({ placeholder: 'Document this project… or generate a draft with AI.' }),
    ],
    content: initialDoc?.contentJson ?? EMPTY_DOC,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'tiptap prose prose-sm max-w-none dark:prose-invert' } },
  });

  const handleGenerate = () => {
    generate.mutate(projectId, {
      onSuccess: (json) => {
        editor?.commands.setContent(json);
        setGeneratedByAi(true);
        toast.success('Draft generated — review and save.');
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'AI generation failed.'),
    });
  };

  const handleSave = () => {
    if (!editor) return;
    save.mutate(
      { contentJson: editor.getJSON(), generatedByAi },
      {
        onSuccess: () => {
          toast.success('Documentation saved.');
          onSaved();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save.'),
      }
    );
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generate.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {generate.isPending ? 'Generating…' : 'Generate by AI'}
        </Button>
        {generatedByAi ? (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" /> AI draft
          </Badge>
        ) : null}
      </div>

      <div className="flex max-h-[55vh] flex-col overflow-hidden rounded-lg border border-border">
        {editor ? <DocToolbar editor={editor} /> : null}
        <div className="overflow-y-auto">
          <EditorContent editor={editor} className="px-4 py-3" />
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" size="sm" onClick={handleSave} disabled={save.isPending || !editor}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}

// Modal wrapper. Radix unmounts the body when closed, so the editor is recreated
// with the current doc on every open.
export function DocEditorDialog({
  projectId,
  initialDoc,
  open,
  onOpenChange,
}: {
  projectId: string;
  initialDoc: ProjectDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:` prefix required — dialog.tsx's own `sm:max-w-sm` beats an
          unprefixed max-w-* here. See docker-import-dialog.tsx. */}
      <DialogContent className="gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Documentation</DialogTitle>
          <DialogDescription>
            Write project documentation, or generate a first draft with AI and edit it before saving.
          </DialogDescription>
        </DialogHeader>
        <DocEditorBody projectId={projectId} initialDoc={initialDoc} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
