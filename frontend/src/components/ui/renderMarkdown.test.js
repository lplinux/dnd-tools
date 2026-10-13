/**
 * The renderer feeds dangerouslySetInnerHTML, including on the unauthenticated
 * public diary page, so these tests are the safety argument rather than a
 * formatting nicety. Each escaping case below is a real injection route.
 */
import { describe, it, expect } from 'vitest';
import { renderMd } from './renderMarkdown';
import { buildIndex } from '@/data/crossLinks';

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

/**
 * Cross-links. The safety question is narrower than it looks: the attribute
 * carries an id this code produced, so the only user text in the output is the
 * label, and the label is in element content like everything else.
 */
describe('[[cross-links]]', () => {
  const INDEX = buildIndex({
    locations: [{ id: 1, name: 'Waterdeep' }, { id: 3, name: 'Th\u00e9a' }],
    npcs: [{ id: 10, name: 'Grathul' }],
  });

  it('renders a resolved name as a link carrying the id, not the name', () => {
    const html = renderMd('We reached [[Waterdeep]].', INDEX);
    expect(html).toContain('<a class="xlink" data-xlink="location:1"');
    expect(html).toContain('>Waterdeep</a>');
  });

  it('renders an unresolved name as plain text, not an error', () => {
    expect(renderMd('We reached [[Neverwinter]].', INDEX))
      .toContain('<span class="xlink-dead">Neverwinter</span>');
  });

  it('renders everything plain when there is no index at all', () => {
    // The default, and what a reader who may resolve nothing sees.
    const html = renderMd('We reached [[Waterdeep]].');
    expect(html).toContain('<span class="xlink-dead">Waterdeep</span>');
    expect(html).not.toContain('data-xlink');
  });

  it('shows the display text and links the target', () => {
    const html = renderMd('[[Waterdeep|the city]]', INDEX);
    expect(html).toContain('data-xlink="location:1"');
    expect(html).toContain('>the city</a>');
    expect(html).not.toContain('>Waterdeep<');
  });

  it('never lets a name reach an attribute', () => {
    // The whole reason the id is in the attribute and the name is not.
    // escapeText does NOT escape quotes, so a name breaking out of an
    // attribute would be a live XSS — it only ever lands in element content.
    const hostile = '" onmouseover=alert(1) x="';
    const html = renderMd(`[[${hostile}]]`, INDEX);
    expect(html).not.toContain('<a ');                  // did not resolve
    expect(html).toContain('xlink-dead');
    // The quotes are present as text, inside the span, harming nothing.
    expect(html).toContain(`<span class="xlink-dead">${hostile}</span>`);
  });

  it('emits only kind:id in the attribute, whatever the name was', () => {
    // Every data-xlink in the output must be two tokens of our own making.
    const html = renderMd('[[Waterdeep]] [[npc:Grathul]] [[Th\u00e9a|x]]', INDEX);
    const attrs = [...html.matchAll(/data-xlink="([^"]*)"/g)].map((m) => m[1]);
    expect(attrs).toEqual(['location:1', 'npc:10', 'location:3']);
    for (const a of attrs) expect(a).toMatch(/^(location|npc):\d+$/);
  });

  it('cannot be tricked into an attribute by a quote in the display text', () => {
    const html = renderMd('[[Waterdeep|" onclick="alert(1)]]', INDEX);
    // Assert on the OPENING TAG, not the whole string: the label legitimately
    // contains `onclick="alert(1)` as *text* after the `>`, which is inert.
    // An earlier version of this test matched that and failed the code for it.
    const open = html.match(/<a [^>]*>/)[0];
    expect(open).toBe('<a class="xlink" data-xlink="location:1" role="button" tabindex="0">');
    expect(open).not.toMatch(/onclick/);
    // And the quote survives as text in the label, which is where it belongs.
    expect(html).toContain('>" onclick="alert(1)</a>');
  });

  it('emits no event-handler attribute on any element, for any input', () => {
    const nasty = [
      '[[Waterdeep|" onclick="x]]', '[[" onload="x]]', '[[Waterdeep|</a><img onerror=x>]]',
      '[[npc:Grathul|\'onfocus=\'x]]', '[[Waterdeep|a" autofocus b="]]',
    ].join('\n\n');
    const html = renderMd(nasty, INDEX);
    for (const tag of html.match(/<[a-z][^>]*>/g) ?? []) {
      expect(tag, `handler attribute in ${tag}`).not.toMatch(/\bon[a-z]+\s*=/i);
    }
  });

  it('escapes markup inside a name before anything else runs', () => {
    const html = renderMd('[[<script>alert(1)</script>]]', INDEX);
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes markup inside display text', () => {
    const html = renderMd('[[Waterdeep|<img src=x onerror=alert(1)>]]', INDEX);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('does not collide with an ordinary markdown link', () => {
    const html = renderMd('[[Waterdeep]] and [a real link](/timeline)', INDEX);
    expect(html).toContain('data-xlink="location:1"');
    expect(html).toContain('href="/timeline"');
  });

  it('leaves [[a]](b) as a cross-link followed by literal text', () => {
    // The link rule needs `[label](url)`; `[[a]]` is consumed first, so what
    // follows is just prose.
    const html = renderMd('[[Waterdeep]](notalink)', INDEX);
    expect(html).toContain('data-xlink="location:1"');
    expect(html).toContain('(notalink)');
  });

  it('resolves without the accent', () => {
    expect(renderMd('[[thea]]', INDEX)).toContain('data-xlink="location:3"');
  });

  it('honours a kind prefix', () => {
    expect(renderMd('[[npc:Grathul]]', INDEX)).toContain('data-xlink="npc:10"');
  });

  it('handles several on one line', () => {
    const html = renderMd('[[Waterdeep]] then [[npc:Grathul]] then [[Nowhere]]', INDEX);
    expect(html).toContain('data-xlink="location:1"');
    expect(html).toContain('data-xlink="npc:10"');
    expect(html).toContain('xlink-dead">Nowhere</span>');
  });

  it('leaves an empty token alone rather than emitting an empty link', () => {
    expect(renderMd('[[]]', INDEX)).toContain('[[]]');
  });

  it('does not match across a newline', () => {
    const html = renderMd('[[Water\ndeep]]', INDEX);
    expect(html).not.toContain('data-xlink');
  });

  it('still bolds and italicises around a link', () => {
    const html = renderMd('**bold** [[Waterdeep]] *em*', INDEX);
    expect(html).toContain('<strong');
    expect(html).toContain('<em>');
    expect(html).toContain('data-xlink');
  });
});
