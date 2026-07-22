import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally not part of the browser app build.
import { readFileSync } from 'node:fs';

describe('filter responsive styles', () => {
  it('contains popovers within the single-column layout at 641-900px', () => {
    const css = readFileSync('src/filters.css', 'utf8');
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.filter-popover\s*\{[\s\S]*?position:\s*static/);
  });
});
