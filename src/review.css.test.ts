import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally not part of the browser app build.
import { readFileSync } from 'node:fs';

describe('analysis result table containment', () => {
  it('lets result grid tracks and sections shrink within a mobile viewport', () => {
    const css = readFileSync('src/review.css', 'utf8');

    expect(css).toMatch(/\.result-areas\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.result-section\s*\{[\s\S]*?min-width:\s*0/);
  });
});
