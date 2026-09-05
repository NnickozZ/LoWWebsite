'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { readUploadResponse } from '@/lib/upload';

/**
 * "Uploadlimiet testen" — Beheer → Site.
 *
 * Posts bodies of growing size to `/api/health/upload` until one is refused,
 * then says what that means. The steps sit just past the archive's own two
 * ceilings (10 MB for a player, 100 MB for a Keeper) and just past nginx's
 * default (1 MB), so the outcome names the culprit: a refusal at 1.5 MB is
 * an untouched nginx, a refusal at 11 MB a proxy set to 10m, a pass at 101 MB
 * means the web server is out of the way and only the archive's own limits
 * apply. Sending 101 MB takes a while on a home line, which is why the steps
 * are climbed one at a time and the screen says which one is in the air.
 */
const STEPS_MB = [1.5, 11, 101];

/**
 * `/admin?tab=site&probe=1.5,11,25` climbs other steps — to pin a ceiling
 * down, or (the tests) to stay under what a browser harness can carry.
 */
function stepsFrom(raw: string | null): number[] {
  if (!raw) return STEPS_MB;
  const steps = raw
    .split(',')
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n >= 0.1 && n <= 500);
  return steps.length ? steps : STEPS_MB;
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'busy'; mb: number }
  | { kind: 'ok'; mb: number }
  | { kind: 'refused'; mb: number; passed: number | null; status: number }
  | { kind: 'failed'; mb: number; message: string };

export function UploadProbe() {
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const steps = stepsFrom(useSearchParams().get('probe'));

  async function run() {
    let passed: number | null = null;
    for (const mb of steps) {
      setOutcome({ kind: 'busy', mb });
      // Not zero bytes: a body of NULs is what some tooling escapes six-fold.
      const body = new Uint8Array(Math.round(mb * 1024 * 1024)).fill(0x61);
      try {
        const response = await fetch('/api/health/upload', {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/octet-stream' },
        });
        const result = await readUploadResponse<{ bytes: number }>(response);
        if (!result.ok) {
          // This route never says 413 itself, so a 413 is the server in front.
          setOutcome({ kind: 'refused', mb, passed, status: result.status });
          return;
        }
        passed = mb;
      } catch {
        setOutcome({ kind: 'failed', mb, message: 'De verbinding viel weg tijdens de test.' });
        return;
      }
    }
    setOutcome({ kind: 'ok', mb: passed ?? 0 });
  }

  return (
    <div>
      <span className="label">Uploadlimiet van de webserver</span>
      <p className="tiny muted" style={{ margin: '0 0 0.45rem' }}>
        Het archief laat spelers 10 MB en Keepers 100 MB uploaden, maar de webserver vóór het archief
        (nginx, Caddy, een paneel) heeft een eigen grens — bij nginx 1 MB tenzij anders ingesteld. Deze
        test stuurt {steps.map((mb) => `${mb} MB`).join(', ')} aan lege bytes naar het archief en meldt waar
        het stokt.
      </p>
      <div className="row-wrap">
        <button
          type="button"
          className="btn btn-small"
          disabled={outcome.kind === 'busy'}
          onClick={() => void run()}
        >
          <Icon name="upload" size={14} />
          {outcome.kind === 'busy' ? `Bezig… ${outcome.mb} MB onderweg` : 'Uploadlimiet testen'}
        </button>
      </div>

      {outcome.kind === 'ok' && (
        <p className="small" style={{ margin: '0.5rem 0 0' }}>
          <Icon name="check" size={14} /> De webserver laat minstens {outcome.mb} MB door
          {outcome.mb >= 100 ? ': genoeg voor spelers (10 MB) en de Keeper (100 MB).' : '.'}
        </p>
      )}

      {outcome.kind === 'refused' && (
        <div className="small" style={{ margin: '0.5rem 0 0' }}>
          <p className="error-note" style={{ margin: '0 0 0.4rem' }}>
            {outcome.mb} MB werd geweigerd ({outcome.status})
            {outcome.passed ? `; ${outcome.passed} MB kwam nog door` : ''}.
          </p>
          {outcome.status === 413 ? (
            <>
              <p style={{ margin: '0 0 0.4rem' }}>
                Dat is de webserver vóór het archief, niet het archief zelf. Bij nginx: zet in het
                <code> server </code>-blok van deze site (meestal in <code>/etc/nginx/sites-enabled/</code>)
                de regel
              </p>
              <pre className="probe-snippet">client_max_body_size 100m;</pre>
              <p style={{ margin: '0.4rem 0 0' }}>
                en herlaad met <code>sudo nginx -t &amp;&amp; sudo systemctl reload nginx</code>. Bij Apache heet
                het <code>LimitRequestBody 104857600</code>; Caddy heeft geen grens. Daarna deze test nog eens.
              </p>
            </>
          ) : (
            <p style={{ margin: 0 }}>
              Het archief zelf antwoordde met een fout; kijk in <code>npm run logs -- --errors</code>.
            </p>
          )}
        </div>
      )}

      {outcome.kind === 'failed' && (
        <p className="error-note small" style={{ margin: '0.5rem 0 0' }}>
          {outcome.message} ({outcome.mb} MB)
        </p>
      )}
    </div>
  );
}
