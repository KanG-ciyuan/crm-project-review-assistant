import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally not part of the browser app build.
import { readFileSync } from 'node:fs';

const css = readFileSync('src/filters.css', 'utf8');

describe('filter workbench styles', () => {
  it('keeps filter controls and popovers above the project table', () => {
    expect(css).toMatch(/\.analysis-filters\s*\{[\s\S]*?z-index:\s*20/);
    expect(css).toMatch(/\.filter-popover\s*\{[\s\S]*?z-index:\s*40/);
    expect(css).toMatch(/\.filter-popover\s*\{[\s\S]*?max-width:\s*calc\(100vw\s*-\s*\d+px\)/);
  });

  it('uses stable control heights and visible keyboard focus', () => {
    expect(css).toMatch(/\.filter-menu summary\s*\{[\s\S]*?min-height:\s*36px/);
    expect(css).toMatch(/\.filter-menu summary:focus-visible/);
    expect(css).toMatch(/\.filter-search:focus-within/);
    expect(css).toMatch(/\.filter-chip button:focus-visible/);
  });

  it('contains open menus in the responsive project tab at 760px', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.filter-popover\s*\{[\s\S]*?position:\s*static/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.filter-menu summary\s*\{[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.filter-option\s*\{[\s\S]*?min-height:\s*44px/);
  });
});
