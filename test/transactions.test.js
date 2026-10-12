/**
 * test/transactions.test.js
 *
 * Postgres aborts the WHOLE transaction when any statement fails. Every later
 * command then errors with 25P02, and `COMMIT` silently becomes a rollback —
 * so a handler that catches a constraint violation mid-transaction and carries
 * on will throw away everything it did and still answer `success: true`.
 *
 * That is not hypothetical. The campaign import caught a duplicate-key error
 * to skip one inventory row, and discarded the entire campaign while replying
 * `{ success: true, campaign_id: 4 }`. There was no campaign 4. The only way
 * to catch inside a transaction is a SAVEPOINT.
 *
 * `campaignGear.test.js` pins that one route. This generalises it: every
 * BEGIN…COMMIT region in the file, so the next one to grow a `catch` fails
 * here rather than in somebody's database.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = readFileSync(path.join(root, 'app.js'), 'utf8').split('\n');

/** Every BEGIN…COMMIT region, with the route it belongs to. */
function transactions() {
  const out = [];
  let start = null;
  lines.forEach((l, i) => {
    if (l.includes("query('BEGIN')")) start = i;
    if (start !== null && l.includes("query('COMMIT')")) {
      let route = `lines ${start + 1}-${i + 1}`;
      for (let j = start; j > Math.max(0, start - 80); j--) {
        const m = lines[j].match(/app\.(get|post|put|delete)\('([^']+)'/);
        if (m) { route = `${m[1].toUpperCase()} ${m[2]}`; break; }
      }
      const raw = lines.slice(start, i + 1).join('\n');
      // Comments stripped, as handlerCode() does elsewhere. The comment that
      // EXPLAINS the savepoint contains the word SAVEPOINT, so a check against
      // the raw text passes with the code deleted — which it did, until this.
      const body = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      out.push({ route, body, raw });
      start = null;
    }
  });
  return out;
}

const txs = transactions();

describe('transactional handlers', () => {
  it('finds the transactions in app.js', () => {
    // A guard on the guard: if the BEGIN/COMMIT shape ever changes, every
    // assertion below would pass vacuously.
    expect(txs.length).toBeGreaterThanOrEqual(6);
    expect(txs.map(t => t.route)).toContain('POST /api/campaigns/import');
  });

  it('never catches inside a transaction without a SAVEPOINT', () => {
    const unsafe = txs
      .filter(t => /\bcatch\s*\(/.test(t.body) && !/SAVEPOINT/.test(t.body))
      .map(t => t.route);
    expect(
      unsafe,
      `these catch an error mid-transaction with no SAVEPOINT, so the whole `
      + `transaction is already aborted and COMMIT will silently roll back: ${unsafe.join(', ')}`,
    ).toEqual([]);
  });

  it('rolls back to the savepoint before inspecting the error', () => {
    // Order matters: once aborted, even reading the error's details by issuing
    // another query fails. The rollback has to come first.
    for (const t of txs) {
      if (!/SAVEPOINT/.test(t.body)) continue;
      const at = t.body.indexOf('catch (e) {', t.body.indexOf('SAVEPOINT'));
      if (at === -1) continue;
      const tail = t.body.slice(at);
      const rollback = tail.indexOf('ROLLBACK TO SAVEPOINT');
      const inspect = tail.search(/e\.code/);
      expect(rollback, `${t.route}: catch with no ROLLBACK TO SAVEPOINT`).toBeGreaterThan(-1);
      if (inspect > -1) {
        expect(rollback, `${t.route}: inspects the error before rolling back`).toBeLessThan(inspect);
      }
    }
  });

  it('every transaction can still roll back as a whole', () => {
    // A SAVEPOINT is for recovering from one statement, not a substitute for
    // the outer ROLLBACK that an unexpected error needs.
    for (const t of txs) {
      const all = lines.join('\n');
      const after = all.slice(all.indexOf(t.raw) + t.raw.length);
      expect(
        /ROLLBACK/.test(t.body) || /ROLLBACK/.test(after.slice(0, 600)),
        `${t.route}: no ROLLBACK anywhere near the transaction`,
      ).toBe(true);
    }
  });
});
