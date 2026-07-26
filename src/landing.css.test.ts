import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally not part of the browser app build.
import { readFileSync } from 'node:fs';

const landingCss = readFileSync('src/landing.css', 'utf8');

describe('product workflow workbench viewport fit', () => {
  it('fits the desktop workbench below the fixed navigation without clipping', () => {
    expect(landingCss).toMatch(/\.product-stage-list\s*\{[\s\S]*?padding-bottom:\s*clamp\(348px,\s*50vh,\s*400px\)/);
    expect(landingCss).toMatch(/\.product-live-workbench\s*\{[\s\S]*?top:\s*92px/);
    expect(landingCss).toMatch(/\.product-live-workbench\s*\{[\s\S]*?height:\s*min\(640px,\s*calc\(100dvh\s*-\s*112px\)\)/);
    expect(landingCss).toMatch(/\.product-live-screen\s*\{[\s\S]*?min-height:\s*0/);
  });

  it('keeps the mobile workbench within short phone viewports', () => {
    expect(landingCss).toMatch(/@media\s*\(max-width:\s*560px\)[\s\S]*?\.product-live-workbench\s*\{[\s\S]*?top:\s*76px;[\s\S]*?height:\s*min\(560px,\s*calc\(100dvh\s*-\s*92px\)\)/);
  });
});
