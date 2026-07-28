'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, KeyRound, MinusCircle, RefreshCw, Save, XCircle } from 'lucide-react';
import { useAppSettings, useSaveSettings } from '@/hooks/settings/useAppSettings';
import { useGeminiModels } from '@/hooks/ai/useGeminiModels';
import { useGeminiStatus } from '@/hooks/ai/useGeminiStatus';
import { GEMINI_MODEL_FALLBACKS } from '@/types/common/settings';
import type { AppSettings, AppSettingsInput } from '@/types/common/settings';
import type { GeminiStatus } from '@/types/common/ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/page-header';

const SECRET_UNCHANGED = '';

// Renders a Gemini health/quota result gracefully (module-level so it isn't
// recreated each render). Icon + message + a friendly retry time on quota.
function GeminiStatusView({ status }: { status: GeminiStatus }) {
  const { icon, className } = !status.configured
    ? { icon: <MinusCircle className="h-4 w-4" />, className: 'text-muted-foreground' }
    : status.ok
      ? { icon: <CheckCircle2 className="h-4 w-4" />, className: 'text-primary' }
      : status.quotaExceeded
        ? { icon: <AlertTriangle className="h-4 w-4" />, className: 'text-amber-600 dark:text-amber-500' }
        : { icon: <XCircle className="h-4 w-4" />, className: 'text-destructive' };

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 shrink-0 ${className}`}>{icon}</span>
      <div className="space-y-0.5">
        <p className="text-foreground">{status.message}</p>
        {status.retryAt ? (
          <p className="text-xs text-muted-foreground">
            Retry after about {new Date(status.retryAt).toLocaleTimeString()}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Inner form: state is seeded once from `settings` props. The parent remounts it
// via `key` whenever server state changes, so there's no setState-in-effect.
// (Jenkins is configured per-environment on each project page, not here.)
function SettingsForm({ settings }: { settings: AppSettings }) {
  const save = useSaveSettings();
  const { data: liveModels, isFetching: modelsFetching, refetch: reloadModels } = useGeminiModels();
  const status = useGeminiStatus();

  const [geminiModel, setGeminiModel] = useState(settings.geminiModel);
  const [aiStylePrompt, setAiStylePrompt] = useState(settings.aiStylePrompt);
  const [geminiApiKey, setGeminiApiKey] = useState(SECRET_UNCHANGED);

  // Live models when available, else the static fallback; always include the
  // currently-selected model so it stays valid even if the API omits it.
  const modelOptions = Array.from(
    new Set(
      [...(liveModels ?? GEMINI_MODEL_FALLBACKS), geminiModel].filter((m): m is string => Boolean(m))
    )
  );

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
            <div className="flex items-center justify-between">
              <Label htmlFor="gemini-model">Model</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => reloadModels()}
                disabled={modelsFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${modelsFetching ? 'animate-spin' : ''}`} />
                Reload
              </Button>
            </div>
            <Select value={geminiModel} onValueChange={setGeminiModel}>
              <SelectTrigger id="gemini-model" className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {liveModels
                ? 'Loaded from your Gemini account.'
                : 'Common models shown — save a key and Reload to list exactly what your key supports.'}
            </p>
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

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">AI status</p>
                <p className="text-xs text-muted-foreground">
                  Check the key works and see quota / retry timing.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => status.mutate()}
                disabled={status.isPending}
              >
                <Activity className="mr-2 h-4 w-4" />
                {status.isPending ? 'Checking…' : 'Check status'}
              </Button>
            </div>
            {status.data ? (
              <GeminiStatusView status={status.data} />
            ) : status.error ? (
              <p className="text-sm text-destructive">
                {status.error instanceof Error ? status.error.message : 'Status check failed.'}
              </p>
            ) : null}
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
