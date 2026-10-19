/**
 * test/hookContracts.test.js
 *
 * Two context hooks that look alike and are not.
 *
 *   const { toast } = useToast();   // returns an OBJECT
 *   const confirm   = useConfirm(); // returns the FUNCTION
 *
 * Getting either backwards type-checks fine, lints clean, builds clean and
 * renders fine. It throws only when the handler actually runs — so the first
 * sign of it is a user clicking a button and getting "x is not a function"
 * from a minified bundle. That is exactly how it reached the browser once.
 *
 * Cheap to pin, so it is pinned.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'frontend/src');

/** Every .js/.jsx under frontend/src, minus the definitions themselves. */
function sources(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { sources(full, out); continue; }
    if (!/\.jsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

const FILES = sources()
  .filter((f) => !/contexts[/\\](Toast|Confirm)Context\.jsx$/.test(f))
  .filter((f) => !/hooks[/\\]use(Toast|Confirm)\.js$/.test(f))
  .map((f) => [path.relative(root, f), readFileSync(f, 'utf8')]);

describe('the two context hooks are used the way they are shaped', () => {
  it('found the frontend', () => {
    // If the layout moves, every assertion below silently stops covering.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('useToast() is always destructured', () => {
    const wrong = [];
    for (const [name, src] of FILES) {
      // `const toast = useToast()` — the object, called as a function later.
      for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*useToast\(\)/g)) {
        wrong.push(`${name}: const ${m[1]} = useToast()`);
      }
    }
    expect(wrong, 'useToast() returns { toast } — destructure it').toEqual([]);
  });

  it('and useConfirm() never is', () => {
    const wrong = [];
    for (const [name, src] of FILES) {
      for (const m of src.matchAll(/const\s*\{[^}]*\}\s*=\s*useConfirm\(\)/g)) {
        wrong.push(`${name}: ${m[0]}`);
      }
    }
    expect(wrong, 'useConfirm() returns the function itself — do not destructure').toEqual([]);
  });

  it('and somebody actually uses each, so this is not vacuous', () => {
    const all = FILES.map(([, s]) => s).join('\n');
    expect(all).toMatch(/const \{ toast \} = useToast\(\)/);
    expect(all).toMatch(/const confirm\s*= useConfirm\(\)/);
  });
});
