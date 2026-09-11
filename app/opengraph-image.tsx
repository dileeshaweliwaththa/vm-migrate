import { ImageResponse } from 'next/og';

// The card Teams, Slack and iMessage show when someone pastes the portal's link.
//
// Generated rather than committed as a PNG: the wordmark and the palette are
// already defined in this repo, and a checked-in image would be the one place
// they could drift. `next/og` renders this with its own bundled font, so it
// needs no network access and no font file of ours — which is why the type here
// is plain and heavily tracked rather than the app's own display face.
//
// Reachable without a session: it sits at the app root, outside `(protected)`,
// and `proxy.ts` only refreshes the session rather than redirecting. A crawler
// that cannot fetch this would show the bare domain instead.

export const alt = 'DevOps Portal — Upview Technologies';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// `#131b2e` is the navy chrome and `#0058be` the accent, both from
// app/globals.css. Literals, not tokens: satori resolves no CSS variables.
const NAVY = '#131b2e';
const ACCENT = '#0058be';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: NAVY,
          padding: '72px 80px',
        }}
      >
        {/* The mark: the accent tile from `app/icon.svg`, with the same terminal
            prompt drawn as type. At 1200px wide it can be lettered, which a
            16px favicon could not. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 16,
              backgroundColor: ACCENT,
              color: '#ffffff',
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            {'>_'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 22,
                letterSpacing: 6,
                color: '#ffffff',
                fontWeight: 700,
              }}
            >
              UPVIEW
            </div>
            <div style={{ fontSize: 18, letterSpacing: 4, color: '#8fa3c4' }}>TECHNOLOGIES</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              letterSpacing: -2,
              color: '#ffffff',
              lineHeight: 1,
            }}
          >
            DevOps Portal
          </div>
          {/* The three areas, in the order the sidebar lists them. */}
          <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
            {['VM migration tracker', 'Projects & deployments', 'Database backups'].map((item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  fontSize: 26,
                  color: '#dbe6f7',
                  border: '1px solid #2b3a55',
                  borderRadius: 6,
                  padding: '10px 18px',
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 4, backgroundColor: ACCENT }} />
          <div style={{ fontSize: 26, color: '#8fa3c4' }}>deploy.upviewtech.com</div>
        </div>
      </div>
    ),
    size
  );
}
