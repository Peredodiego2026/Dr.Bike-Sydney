// The mechanic's parts picker filters tubes by wheel size. js/mechanic.js is a
// classic script, so the two helpers are lifted from its source and run - a
// change to the real code shows up here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../js/mechanic.js', import.meta.url), 'utf8');
const lift = (name) => src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
const { ppSizesOf, ppSizeLabel } = new Function(
  `${lift('ppSizesOf')}\n${lift('ppSizeLabel')}\nreturn { ppSizesOf, ppSizeLabel };`
)();

describe('tube sizes', () => {
  it('reads the seeded wheel sizes', () => {
    expect(ppSizesOf('26"')).toEqual(['26']);
    expect(ppSizesOf('27.5"')).toEqual(['27.5']);
    expect(ppSizesOf('700C')).toEqual(['700C']);
    expect(ppSizesOf(null)).toEqual([]);
  });

  it('a 28"/29" tube counts as both, so it shows under the 29" chip (it fits)', () => {
    expect(ppSizesOf('28"/29"')).toEqual(['28', '29']);
    expect(ppSizesOf('28"/29"').includes('29')).toBe(true);
  });

  it('labels inches with a quote and leaves 700C alone', () => {
    expect(ppSizeLabel('26')).toBe('26"');
    expect(ppSizeLabel('27.5')).toBe('27.5"');
    expect(ppSizeLabel('700C')).toBe('700C');
  });

  it('chips sort smallest first, 700C last', () => {
    const sizes = ['700C', '29', '12', '27.5', '26', '28'].sort(
      (a, b) => parseFloat(a) - parseFloat(b)
    );
    expect(sizes).toEqual(['12', '26', '27.5', '28', '29', '700C']);
  });
});

describe('picker steppers are phone-sized', () => {
  it('the -/+ buttons are 44px, not 32px', () => {
    const list = src.slice(src.indexOf('function renderPPList('));
    const body = list.slice(0, list.indexOf('\nfunction '));
    expect(body).toMatch(/data-action="parts-step"[^>]*width:44px;height:44px/);
    expect(body).not.toMatch(/width:32px;height:32px/);
  });
});
