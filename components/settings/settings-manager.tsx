'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FolderGit2,
  KeyRound,
  MinusCircle,
  RefreshCw,
  Save,
  Sparkles,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useAppSettings, useSaveSettings } from '@/hooks/settings/useAppSettings';
import { useGeminiModels } from '@/hooks/ai/useGeminiModels';
import { useGeminiStatus } from '@/hooks/ai/useGeminiStatus';
import { GEMINI_MODEL_FALLBACKS, SETTINGS_SECTIONS } from '@/types/common/settings';
import type { AppSettings, AppSettingsInput, SettingsSection } from '@/types/common/settings';
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
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';
import { GithubSettings } from '@/components/settings/github-settings';

const SECRET_UNCHANGED = '';

// Renders a Gemini health/quota result gracefully (module-level so it isn't
// recreated each render). Icon + message + a friendly retry time on quota.
function GeminiStatusView({ status }: { status: GeminiStatus }) {
  const { icon, className } = !status.configured
    ? { icon: <MinusCircle className="h-4 w-4" />, className: 'text-muted-foreground' }
    : status.ok
      ? { icon: <CheckCircle2 className="h-4 w-4" />, className: 'text-primary' }
      : status.quotaExceeded
        ? { icon: <AlertTriangle className="h-4 w-4" />, className: 'text-ink-source dark:text-ink-source' }
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
// (Jenkins is configured per-VM in the tracker, not here.)
function AiSettingsForm({ settings }: { settings: AppSettings }) {
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
    <section className="space-y-4">
      {/* Save sits with the fields it saves: each section owns its buttons, so
          a page-level Save would only ever mean "this one section". */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">AI documentation (Gemini)</h2>
          <p className="text-sm text-muted-foreground">
            Used by the “Generate by AI” button on project docs. The key is stored
            server-side and never shown again.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" /> {save.isPending ? 'Saving…' : 'Save'}
        </Button>
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
  );
}

// The AI section's loader: the form is keyed on `updatedAt`, so it re-seeds from
// the server after a save without a setState-in-effect.
function AiSettings() {
  const { data: settings, isLoading, error } = useAppSettings();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error || !settings) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load settings.'}
      </p>
    );
  }
  return <AiSettingsForm key={settings.updatedAt} settings={settings} />;
}

// One entry per category, keyed by the shared `SETTINGS_SECTIONS` — the Record
// type makes adding a section there without adding it here a type error.
const SECTIONS: Record<
  SettingsSection,
  { title: string; description: string; icon: LucideIcon; render: () => React.ReactNode }
> = {
  ai: {
    title: 'AI documentation',
    description: 'Gemini key, model and house style',
    icon: Sparkles,
    render: () => <AiSettings />,
  },
  github: {
    title: 'GitHub',
    description: 'Token for the repository and branch pickers',
    icon: FolderGit2,
    render: () => <GithubSettings />,
  },
};

// Categories down the left, the chosen one on the right — one section on screen
// at a time, so the page doesn't grow into a single long form as integrations
// are added. The menu is shadcn's `Item` (not `ui/tabs`, which renders empty on
// Radix 1.4.3 — docs/ui-guidelines.md). It stacks above the content on narrow
// screens.
//
// The choice is mirrored into `?section=`, so a category can be linked to
// directly and survives a reload. `history.replaceState` rather than the router:
// switching category is local UI state, with nothing on the server to refetch.
export function SettingsManager({ initialSection }: { initialSection: SettingsSection }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  const select = (next: SettingsSection) => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set('section', next);
    window.history.replaceState(null, '', url);
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-8 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections">
          <ItemGroup className="gap-1">
            {SETTINGS_SECTIONS.map((key) => {
              const { title, description, icon: Icon } = SECTIONS[key];
              const active = key === section;
              return (
                <Item
                  key={key}
                  asChild
                  size="sm"
                  variant={active ? 'muted' : 'default'}
                  className={cn('cursor-pointer text-left', !active && 'hover:bg-muted/60')}
                >
                  <button type="button" aria-current={active ? 'page' : undefined} onClick={() => select(key)}>
                    <ItemMedia variant="icon">
                      <Icon className={active ? 'text-foreground' : 'text-muted-foreground'} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{title}</ItemTitle>
                      <ItemDescription className="text-xs">{description}</ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              );
            })}
          </ItemGroup>
        </nav>
        <div className="min-w-0">{SECTIONS[section].render()}</div>
      </div>
    </>
  );
}
