/**
 * pages/NpcSheet/replaceOnFocus.test.js
 *
 * Sequences, not single calls — the whole behaviour is about what a run of
 * events does to a value, and every bug this could have is an ordering bug.
 */
import { describe, it, expect } from 'vitest';
import { IDLE, focus, input, blur, shown, hint } from './replaceOnFocus';

/**
 * Thread events through the reducer the way the component does, returning the
 * committed values in order and the value the parent would end up holding.
 */
function run(start, events) {
  let state = IDLE;
  let value = start;
  const commits = [];
  for (const e of events) {
    const r = e === 'focus' ? focus()
      : e === 'blur' ? blur(state)
        : input(e);
    state = r.state;
    if ('commit' in r) { commits.push(r.commit); value = r.commit; }
  }
  return { commits, value, state };
}

describe('typing a replacement', () => {
  it('commits each keystroke, so derived readouts stay live', () => {
    // The ability modifier and the HP clamp both read the committed value.
    const { commits, value } = run('14', ['focus', '1', '18', 'blur']);
    expect(commits).toEqual(['1', '18']);
    expect(value).toBe('18');
  });

  it('never commits the empty box you type through', () => {
    // Without this an ability score snaps to 10 — and flashes its modifier —
    // every time you start replacing it.
    const { commits } = run('14', ['focus', '8', 'blur']);
    expect(commits).toEqual(['8']);
    expect(commits).not.toContain('');
  });
});

describe('focusing and leaving without typing', () => {
  it('commits nothing at all, so the old value simply reappears', () => {
    // Focusing a field is not a decision. This is the only thing standing
    // between a stray tab-press and a blanked stat.
    const { commits, value } = run('18', ['focus', 'blur']);
    expect(commits).toEqual([]);
    expect(value).toBe('18');
  });

  it('holds even through a focus/blur on an empty field', () => {
    expect(run('', ['focus', 'blur']).commits).toEqual([]);
  });
});

describe('deliberately clearing', () => {
  it('is honoured when you type and then delete back to empty', () => {
    // Distinct from the case above: this one the author meant.
    const { commits, value } = run('18', ['focus', '1', '', 'blur']);
    expect(commits).toEqual(['1', '']);
    expect(value).toBe('');
  });

  it('is honoured even if the typing and deleting was a long detour', () => {
    const { value } = run('18', ['focus', '2', '20', '2', '', 'blur']);
    expect(value).toBe('');
  });
});

describe('what the box shows', () => {
  it('shows the committed value when idle', () => {
    expect(shown(IDLE, '18')).toBe('18');
    expect(shown(IDLE, 18)).toBe('18');
    expect(shown(IDLE, null)).toBe('');
  });

  it('is empty the moment it is focused, whatever it held', () => {
    expect(shown(focus().state, '18')).toBe('');
  });

  it('shows the draft while editing', () => {
    expect(shown(input('1').state, '18')).toBe('1');
  });
});

describe('the grey hint', () => {
  it('is the field’s own hint when idle', () => {
    expect(hint(IDLE, '18', '0')).toBe('0');
    expect(hint(IDLE, '', '30 ft')).toBe('30 ft');
  });

  it('becomes the value being replaced once focused', () => {
    // The point of the whole thing: the old number stays readable, in grey,
    // while you type over it.
    expect(hint(focus().state, '18', '0')).toBe('18');
    expect(hint(input('1').state, '18', '0')).toBe('18');
  });

  it('falls back to the field hint when there was nothing to replace', () => {
    expect(hint(focus().state, '', '30 ft')).toBe('30 ft');
    expect(hint(focus().state, null, '0')).toBe('0');
  });

  it('is empty rather than "undefined" when no hint was given', () => {
    expect(hint(IDLE, '', undefined)).toBe('');
  });
});

describe('state after blur', () => {
  it('returns to idle, so the next focus starts clean', () => {
    const { state } = run('18', ['focus', '9', 'blur']);
    expect(state).toEqual(IDLE);
    // And a second focus/blur with no typing still commits nothing — `touched`
    // must not survive the first round.
    expect(run('9', ['focus', '9', 'blur', 'focus', 'blur']).commits).toEqual(['9']);
  });
});
