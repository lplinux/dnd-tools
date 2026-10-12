/**
 * The renderer feeds dangerouslySetInnerHTML, including on the unauthenticated
 * public diary page, so these tests are the safety argument rather than a
 * formatting nicety. Each escaping case below is a real injection route.
 */
import { describe, it, expect } from 'vitest';
import { renderMd } from './renderMarkdown';

describe('renderMd — formatting', () => {
  it('renders the heading levels', () => {
    expect(renderMd('# A')).toContain('<h1');
    expect(renderMd('## B')).toContain('<h2');
    expect(renderMd('### C')).toContain('<h3');
  });

  it('renders bold, italic, code, quotes and both list kinds', () => {
    expect(renderMd('**x**')).toContain('<strong');
    expect(renderMd('*x*')).toContain('<em>');
    expect(renderMd('`x`')).toContain('<code');
    expect(renderMd('> x')).toContain('<blockquote');
    expect(renderMd('- x')).toContain('list-disc');
    expect(renderMd('1. x')).toContain('list-decimal');
  });

  it('does not treat the inner asterisks of bold as italic', () => {
    const out = renderMd('**x**');
    expect(out).toContain('<strong');
    expect(out).not.toContain('<em>');
  });

  it('wraps blank-line-separated blocks as paragraphs', () => {
    expect(renderMd('a\n\nb')).toBe('<p class="mb-2">a</p><p class="mb-2">b</p>');
  });
});

describe('renderMd — escaping', () => {
  it('does not throw on null/undefined and always returns a string', () => {
    expect(typeof renderMd(null)).toBe('string');
    expect(typeof renderMd(undefined)).toBe('string');
    expect(typeof renderMd(0)).toBe('string');
  });

  it('escapes a script tag rather than emitting it', () => {
    const out = renderMd('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes & before < and >, so entities are not double-escaped', () => {
    // If the order were wrong, the `&` of `&lt;` produced by the `<` pass would
    // be escaped again and the output would show a literal `&amp;lt;`.
    expect(renderMd('&lt;')).toContain('&amp;lt;');
    expect(renderMd('<')).toContain('&lt;');
    expect(renderMd('<')).not.toContain('&amp;lt;');
  });

  it('escapes markup nested inside an inline rule', () => {
    const out = renderMd('**<img src=x onerror=alert(1)>**');
    expect(out).toContain('<strong');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});

describe('renderMd — links', () => {
  it('renders http, https and site-relative links', () => {
    expect(renderMd('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(renderMd('[a](http://example.com)')).toContain('href="http://example.com"');
    expect(renderMd('[a](/journey-map-public/ab12)')).toContain('href="/journey-map-public/ab12"');
  });

  it('marks outbound links noopener/noreferrer', () => {
    const out = renderMd('[a](https://example.com)');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('refuses javascript:, data: and protocol-relative URLs', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example.com']) {
      const out = renderMd(`[x](${bad})`);
      expect(out, bad).not.toContain('<a ');
      expect(out, bad).not.toContain('href=');
    }
  });

  it('cannot break out of the href attribute with a quote', () => {
    const out = renderMd('[x](https://e.com/"onmouseover="alert(1))');
    expect(out).not.toContain('onmouseover="alert');
    expect(out).toContain('&quot;');
  });

  it('leaves a rejected link as visible literal text', () => {
    expect(renderMd('[x](javascript:alert(1))')).toContain('[x](javascript:alert(1))');
  });
});
