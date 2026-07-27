// Read-only documentation render. Viewers get the server-rendered HTML only (no
// editor bundle). Styled with @tailwindcss/typography `prose`, inverted in dark
// mode, so it reuses theme tokens rather than hardcoded colors.
export function DocView({ html }: { html: string }) {
  if (!html.trim()) {
    return <p className="text-sm text-muted-foreground">No documentation yet.</p>;
  }
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      // Content is produced server-side by Tiptap's generateHTML from a fixed,
      // known extension set (no raw user HTML is ever stored), so this is safe.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
