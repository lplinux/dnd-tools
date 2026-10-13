/**
 * pages/PcSheet/tabs/bridgeOrigin.test.js
 *
 * The stat-sheet bridge must name its peer origin, never `'*'`.
 *
 * Structural, because the property is about two files agreeing and about what
 * is NOT in them. A whole character's stat block crosses this bridge in both
 * directions; `'*'` on a send means "give it to whatever document is in that
 * frame", and a missing `e.origin` check means "accept one from anywhere".
 *
 * Both documents are served by this app, so pinning costs nothing — which is
 * exactly why leaving it as `'*'` was indefensible rather than a trade-off.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.resolve(here, p), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PARENT = strip(src('./index.jsx'));
const IFRAME = strip(src('../../NpcSheet/index.jsx'));

describe('no send uses a wildcard target origin', () => {
  for (const [name, code] of [['the host tab', PARENT], ['the embedded sheet', IFRAME]]) {
    it(`${name} never posts to '*'`, () => {
      const wildcards = [...code.matchAll(/postMessage\s*\([\s\S]{0,200}?\)/g)]
        .map((m) => m[0])
        .filter((call) => /,\s*'\*'\s*\)/.test(call));
      expect(wildcards).toEqual([]);
    });

    it(`${name} posts to an explicit origin every time`, () => {
      const calls = [...code.matchAll(/postMessage\s*\(/g)].length;
      const pinned = [...code.matchAll(/BRIDGE_ORIGIN|window\.location\.origin/g)].length;
      expect(calls).toBeGreaterThan(0);
      // Every send names one, plus the constant's definition / the guard.
      expect(pinned).toBeGreaterThanOrEqual(calls);
    });
  }
});

describe('no receiver accepts a message from anywhere', () => {
  it('the host tab checks e.origin before reading e.data', () => {
    const handler = PARENT.slice(PARENT.indexOf('function onMessage'));
    const check = handler.indexOf('e.origin !== BRIDGE_ORIGIN');
    const read = handler.indexOf('e.data');
    expect(check, 'no origin check').toBeGreaterThan(-1);
    expect(check, 'origin checked after the payload is read').toBeLessThan(read);
  });

  it('the embedded sheet checks e.origin before reading e.data', () => {
    const handler = IFRAME.slice(IFRAME.indexOf('function handleMessage'));
    const check = handler.indexOf('e.origin !== window.location.origin');
    const read = handler.indexOf('e.data');
    expect(check, 'no origin check').toBeGreaterThan(-1);
    expect(check, 'origin checked after the payload is read').toBeLessThan(read);
  });
});

describe('the reply to COLLECT_STATS', () => {
  it('names our own origin rather than echoing the sender’s', () => {
    // `e.origin` would be correct today because of the guard above, but it
    // couples this line to that one: weaken the guard and the stat block
    // starts being posted back to whoever asked.
    const line = IFRAME.split('\n').find((l) => l.includes("'STATS_DATA'"));
    expect(line).toBeTruthy();
    expect(line).toMatch(/window\.location\.origin/);
    expect(line).not.toMatch(/e\.origin/);
  });
});

describe('the bridge really is same-origin', () => {
  it('embeds a route of this app, which is what makes pinning safe', () => {
    expect(PARENT).toMatch(/src=\{`\/npc-sheet\?embedded=1/);
  });
});
