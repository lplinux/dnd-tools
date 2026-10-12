/**
 * test/filenameCase.test.js
 *
 * No two source files may differ only by case.
 *
 * This exists because it already happened: `StatInput.jsx` beside
 * `statInput.js`. On this machine's case-insensitive filesystem they are ONE
 * path, so `import … from './StatInput'` inside StatInput.jsx resolved to the
 * other file and the Rollup build died with *"IDLE is not exported by
 * StatInput.jsx, imported by StatInput.jsx"*.
 *
 * The part worth guarding is that **the whole test suite stayed green** while
 * the build was broken — Vitest resolved it differently. And on Linux, where
 * the container builds, the two files are genuinely distinct, so the failure
 * mode flips depending on where you run it. A filename collision is not
 * something any test of behaviour can see; it has to be looked for directly.
 *
 * The comparison is on the basename WITHOUT its extension, because that is
 * what an import writes: `./StatInput` has to resolve to exactly one of
 * `.js|.jsx|.ts|.tsx|.mjs|.cjs`. The first version of this test compared whole
 * filenames, so `StatInput.jsx` and `statInput.js` hashed differently and it
 * passed against the very collision it was written for.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'public', 'coverage', '.vite']);
/** The extensions a bare `./Foo` import will try. */
const MODULE_EXT = /\.(jsx?|tsx?|mjs|cjs)$/;

/** The key an extensionless import would resolve by. */
export const importKey = (name) => name.replace(MODULE_EXT, '').toLowerCase();

/** Every directory under `dir`, itself included. */
function walk(dir, out = []) {
  out.push(dir);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP.has(e.name)) continue;
    walk(path.join(dir, e.name), out);
  }
  return out;
}

describe('filenames', () => {
  it('never collide on a case-insensitive filesystem', () => {
    const collisions = [];
    for (const dir of walk(path.join(root, 'frontend', 'src')).concat(root, path.join(root, 'test'))) {
      const seen = new Map();
      for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        // Module files only, compared against each other.
        //
        //  - `hp.js` beside `hp.css` is fine: a stylesheet is never reached by
        //    a bare import.
        //  - A FOLDER beside a same-named file is fine, and is in fact this
        //    repo's convention — every page is `pages/Diary/` plus a
        //    `pages/Diary.jsx` shim re-exporting its index. Node and Vite both
        //    resolve the file ahead of the directory, so `./Diary` is
        //    unambiguous. Twelve pages do this on purpose.
        if (!MODULE_EXT.test(name)) continue;
        const key = importKey(name);
        if (seen.has(key)) {
          collisions.push(`${path.relative(root, dir)}/{${seen.get(key)}, ${name}}`);
        }
        seen.set(key, name);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('keys on what an import actually writes', () => {
    // The pair that broke the build differed in BOTH case and extension.
    expect(importKey('StatInput.jsx')).toBe(importKey('statInput.js'));
    // Same name, both resolvable: `./foo` is ambiguous even without a case
    // difference, so that counts too.
    expect(importKey('foo.js')).toBe(importKey('foo.jsx'));
    // And these are genuinely different modules.
    expect(importKey('hp.js')).not.toBe(importKey('hp.test.js'));
    expect(importKey('index.jsx')).not.toBe(importKey('indexes.jsx'));
  });
});

describe('the directory walk', () => {
  it('actually reaches the source tree', () => {
    // A walk that silently found nothing would make the test above vacuous.
    const dirs = walk(path.join(root, 'frontend', 'src'));
    expect(dirs.length).toBeGreaterThan(10);
    expect(dirs.some((d) => d.endsWith(path.join('pages', 'NpcSheet')))).toBe(true);
  });

  it('skips the places a collision would be meaningless', () => {
    expect(statSync(path.join(root, 'frontend', 'node_modules')).isDirectory()).toBe(true);
    expect(walk(path.join(root, 'frontend', 'src')).some((d) => d.includes('node_modules'))).toBe(false);
  });

  it('does not flag the page-shim convention', () => {
    // `pages/Diary/` + `pages/Diary.jsx` is deliberate on every page, and the
    // file wins resolution. Flagging it would have meant twelve false reports
    // and a muted test.
    expect(statSync(path.join(root, 'frontend', 'src', 'pages', 'Diary')).isDirectory()).toBe(true);
    expect(statSync(path.join(root, 'frontend', 'src', 'pages', 'Diary.jsx')).isFile()).toBe(true);
  });
});
