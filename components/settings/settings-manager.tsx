'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Save } from 'lucide-react';
import { useAppSettings, useSaveSettings } from '@/hooks/settings/useAppSettings';
import type { AppSettings, AppSettingsInput } from '@/types/common/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';

const SECRET_UNCHANGED = '';

// Inner form: state is seeded once from `settings` props. The parent remounts it
// via `key` whenever server state changes, so there's no setState-in-effect.
// (Jenkins is configured per-environment on each project page, not here.)
function SettingsForm({ settings }: { settings: AppSettings }) {
  const save = useSaveSettings();

  const [geminiModel, setGeminiModel] = useState(settings.geminiModel);
  const [aiStylePrompt, setAiStylePrompt] = useState(settings.aiStylePrompt);
  const [geminiApiKey, setGeminiApiKey] = useState(SECRET_UNCHANGED);

  const handleSave = () => {
    const input: AppSettingsInput = { geminiModel, aiStylePrompt };
    // Only send the secret the admin actually typed (blank = keep stored value).
    if (geminiApiKey !== SECRET_UNCHANGED) input.geminiApiKey = geminiApiKey;

    save.mutate(input, {
      onSuccess: () => {
        toast.success('Settings saved.');
        setGeminiApiKey(SECRET_UNCHANGED);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save settings.'),
    });
  };

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            <Save className="mr-2 h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">AI documentation (Gemini)</h2>
            <p className="text-sm text-muted-foreground">
              Used by the “Generate by AI” button on project docs. The key is stored server-side
              and never shown again.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gemini-key">API key</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="gemini-key"
                type="password"
                className="pl-9"
                autoComplete="off"
                placeholder={settings.hasGeminiKey ? '•••••••••• (leave blank to keep)' : 'Not set — paste a key'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gemini-model">Model</Label>
            <Input
              id="gemini-model"
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              placeholder="gemini-2.5-flash"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="style-prompt">House-style prompt</Label>
            <Textarea
              id="style-prompt"
              rows={5}
              value={aiStylePrompt}
              onChange={(e) => setAiStylePrompt(e.target.value)}
              placeholder="e.g. Write concise, engineer-facing docs. Use present tense…"
            />
            <p className="text-xs text-muted-foreground">
              Prepended to every generation so all project docs share one voice.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

export function SettingsManager() {
  const { data: settings, isLoading, error } = useAppSettings();

  if (isLoading) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  if (error || !settings) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load settings.'}
          </p>
        </div>
      </>
    );
  }

  // Remount when server state changes so form state re-seeds cleanly.
  return <SettingsForm key={settings.updatedAt} settings={settings} />;
}
