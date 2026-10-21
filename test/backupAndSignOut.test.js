/**
 * test/backupAndSignOut.test.js
 *
 * Two ways the app quietly mishandled data.
 *
 * A print set that outlived a sign-out, so the next person on a shared
 * machine inherited a queue of someone else's cards — including ones their
 * table has not been shown.
 *
 * And a backup the app would refuse to restore: exports are unbounded,
 * imports are capped, and the only moment that became apparent was the one
 * where you needed the backup.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(root, 'app.js'), 'utf8');
const read = (f) => readFileSync(path.join(root, 'frontend/src', f), 'utf8');

describe('signing out clears what the sitting left behind', () => {
  const auth = read('contexts/AuthContext.jsx');

  it('the print set does not survive a sign-out', () => {
    // sessionStorage survives a logout within the same tab — that is the
    // whole bug. It is cleared explicitly.
    expect(auth).toMatch(/PER_SITTING_KEYS/);
    expect(auth).toMatch(/'ic-print-tray'/);
    const fn = auth.slice(auth.indexOf('async function logout()'), auth.indexOf('async function logout()') + 600);
    expect(fn).toMatch(/sessionStorage\.removeItem\(key\)/);
  });

  it('and the old localStorage copy goes too', () => {
    // The tray used to live there; a browser not used since the move still
    // has it, and the Item Cards page reads it once to offer a rescue.
    const fn = auth.slice(auth.indexOf('async function logout()'), auth.indexOf('async function logout()') + 600);
    expect(fn).toMatch(/localStorage\.removeItem\(key\)/);
  });

  it('but preferences are left alone', () => {
    /*
     * The theme and the SplitView/Timeline profiles belong to the browser,
     * not the account. Wiping them on sign-out is a small hostility, and
     * the SRD cache is public reference data.
     */
    const keys = /const PER_SITTING_KEYS = \[([^\]]*)\]/.exec(auth)[1];
    for (const safe of ['hc-theme', 'splitview-profiles', 'srd']) {
      expect(keys, `${safe} must not be cleared`).not.toContain(safe);
    }
  });

  it('and a private window cannot break signing out', () => {
    // Storage accessors throw when site data is blocked.
    const fn = auth.slice(auth.indexOf('async function logout()'), auth.indexOf('async function logout()') + 600);
    expect(fn).toMatch(/catch \{/);
  });
});

describe('a backup you cannot restore', () => {
  it('the import ceiling is named once on the server', () => {
    expect(app).toMatch(/const BODY_LIMIT_MB = parseInt\(process\.env\.BODY_LIMIT_MB \|\| '50', 10\) \|\| 50/);
    expect(app).toMatch(/express\.json\(\{ limit: `\$\{BODY_LIMIT_MB\}mb` \}\)/);
    expect(app).toMatch(/express\.urlencoded\(\{ extended: true, limit: `\$\{BODY_LIMIT_MB\}mb` \}\)/);
  });

  it('and the client mirrors the same number', () => {
    /*
     * Mirrored rather than fetched — every export goes through one module
     * and a round trip to learn a constant is not worth it. This assertion
     * is the thing that keeps the two honest.
     */
    const server = Number(/const BODY_LIMIT_MB = parseInt\(process\.env\.BODY_LIMIT_MB \|\| '(\d+)'/.exec(app)[1]);
    const client = Number(/export const IMPORT_LIMIT_MB = (\d+)/.exec(read('api/downloadBundle.js'))[1]);
    expect(client, 'IMPORT_LIMIT_MB has drifted from BODY_LIMIT_MB').toBe(server);
  });

  it('an oversized body answers in JSON, not an HTML error page', () => {
    /*
     * It fell through to Express's default handler, so the client's
     * response.json() threw on the HTML and the user saw "Unexpected token
     * <" instead of "that file is too big" — during a restore, which is
     * exactly when a legible error matters.
     */
    expect(app).toMatch(/err\?\.type === 'entity\.too\.large'/);
    expect(app).toMatch(/code: 'EPAYLOADTOOLARGE'/);
    expect(app).toMatch(/limit_mb: BODY_LIMIT_MB/);
  });

  it('and so does malformed JSON', () => {
    expect(app).toMatch(/err\?\.type === 'entity\.parse\.failed'/);
    expect(app).toMatch(/code: 'EBADJSON'/);
  });

  it('the download reports its own size', () => {
    const dl = read('api/downloadBundle.js');
    expect(dl).toMatch(/oversize: blob\.size > IMPORT_LIMIT_MB \* 1024 \* 1024/);
  });

  it('and the campaign export says so at EXPORT time', () => {
    // Not at restore, which is the moment it used to become apparent.
    const hook = read('hooks/useManageCampaigns.js');
    /*
     * BOTH call sites, each wrapping its download. Asserting the name
     * merely appears was not enough: dropping it from one export left the
     * definition and the other call behind, and the test passed.
     */
    const wrapped = [...hook.matchAll(/warnIfOversize\(downloadBundle\(/g)];
    expect(wrapped, 'every campaign export must report an oversized bundle').toHaveLength(2);
    // Asserted in pieces: the message is built by concatenation, so no
    // single regex spans it.
    expect(hook).toMatch(/\$\{IMPORT_LIMIT_MB\} MB import limit/);
    expect(hook).toMatch(/cannot be restored here without raising/);
    expect(hook).toMatch(/BODY_LIMIT_MB on the server/);
  });

  it('while still saving the file', () => {
    // A backup you cannot restore through the UI beats no backup, and
    // raising BODY_LIMIT_MB restores it.
    const hook = read('hooks/useManageCampaigns.js');
    const fn = hook.slice(hook.indexOf('const warnIfOversize'), hook.indexOf('const exportCampaign'));
    expect(fn).not.toMatch(/throw/);
    expect(fn).toMatch(/if \(!r\?\.oversize\) return;/);
  });
});
