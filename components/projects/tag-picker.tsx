'use client';

import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Tag selector: existing tags render as toggleable bubbles; the + reveals an
// input to add a new one. Selected tags are filled, unselected are outlined.
export function TagPicker({
  value,
  available,
  onChange,
}: {
  value: string[];
  available: string[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  // Everything selectable: known tags ∪ already-selected (incl. new ones).
  const all = useMemo(() => {
    const set = new Set<string>([...available, ...value]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [available, value]);

  const toggle = (tag: string) =>
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);

  const commitDraft = () => {
    const name = draft.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((tag) => {
        const selected = value.includes(tag);
        return (
          <button key={tag} type="button" onClick={() => toggle(tag)}>
            <Badge
              variant={selected ? 'default' : 'outline'}
              className={cn('cursor-pointer gap-1', !selected && 'hover:bg-muted')}
            >
              {selected ? <Check className="h-3 w-3" /> : null}
              {tag}
            </Badge>
          </button>
        );
      })}

      {adding ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              } else if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            onBlur={commitDraft}
            placeholder="new tag"
            className="h-7 w-28 px-2 py-1 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel"
            onClick={() => {
              setDraft('');
              setAdding(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="rounded-full"
          aria-label="Add tag"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
