import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally not part of the browser app build.
import { readFileSync } from 'node:fs';

const reviewCss = readFileSync('src/review.css', 'utf8');
const globalCss = readFileSync('src/styles.css', 'utf8');
const filterCss = readFileSync('src/filters.css', 'utf8');
const allCss = `${reviewCss}\n${filterCss}\n${globalCss}`;

function mountRealStyles() {
  const style = document.createElement('style');
  style.dataset.realStyles = '';
  style.textContent = allCss;
  document.head.append(style);
  return style;
}

afterEach(() => {
  document.querySelectorAll('style[data-real-styles]').forEach((style) => style.remove());
  document.body.replaceChildren();
});

describe('analysis workbench layout styles', () => {
  it('keeps only the page header flex in the real stylesheet order', () => {
    mountRealStyles();
    document.body.innerHTML = `<main class="content">
      <header id="page-header"><h1>页面标题</h1></header>
      <section class="review-summary"><header id="summary-header"><h2>复盘摘要</h2></header></section>
    </main>`;

    expect(getComputedStyle(document.querySelector('#page-header')!).display).toBe('flex');
    expect(getComputedStyle(document.querySelector('#summary-header')!).display).toBe('block');

  });

  it('computes the dark teal focus token used by keyboard outlines', () => {
    mountRealStyles();

    expect(getComputedStyle(document.documentElement).getPropertyValue('--focus').trim()).toBe('#0c6668');
    expect(globalCss).toMatch(/button:focus-visible,[\s\S]*?outline:\s*3px solid var\(--focus\)/);

  });

  it('gives the workbench tabs a stable accessible selected state', () => {
    expect(reviewCss).toMatch(/\.workbench-tabs\s*\{[\s\S]*?min-height:\s*44px/);
    expect(reviewCss).toMatch(/\.workbench-tabs\s+button\s*\{[\s\S]*?height:\s*44px/);
    expect(reviewCss).toMatch(/\.workbench-tabs\s+button\[aria-selected=["']true["']\]::after/);
    expect(reviewCss).toMatch(/\.workbench-tabs\s+button:focus-visible\s*\{[\s\S]*?outline:/);
  });

  it('lays out five overview metrics and three open summary regions on desktop', () => {
    expect(reviewCss).toMatch(/\.analysis-overview\s+\.metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
    expect(reviewCss).toMatch(/\.analysis-overview\s+\.summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(reviewCss).toMatch(/\.analysis-overview\s+\.chart-card\s*\{[\s\S]*?border-radius:\s*[0-6]px/);
  });

  it('uses a stable fixed six-column project table and non-shifting pagination', () => {
    expect(reviewCss).toMatch(/\.project-list-table\s*\{[\s\S]*?table-layout:\s*fixed/);
    for (let column = 1; column <= 6; column += 1) {
      expect(reviewCss).toMatch(new RegExp(`\\.project-list-table th:nth-child\\(${column}\\)\\s*\\{[\\s\\S]*?width:`));
    }
    expect(reviewCss).toMatch(/\.project-list-table\s+td\s*\{[\s\S]*?vertical-align:\s*top/);
    expect(reviewCss).toMatch(/\.pagination\s*\{[\s\S]*?min-height:/);
    expect(reviewCss).toMatch(/\.pagination\s+button\s*\{[\s\S]*?min-width:/);
  });

  it('keeps findings, date evidence and review controls readable', () => {
    expect(reviewCss).toMatch(/\.finding-item\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(reviewCss).toMatch(/\.related-project\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(reviewCss).toMatch(/\.date-stack\s*\{[\s\S]*?white-space:\s*normal/);
    expect(reviewCss).toMatch(/\.review-control\s+(?:select|input),[\s\S]*?min-height:\s*36px/);
  });

  it('styles the semantic review summary and its export actions as a clear region', () => {
    expect(reviewCss).toMatch(/\.review-summary\s*\{[\s\S]*?display:\s*grid/);
    expect(reviewCss).toMatch(/\.review-summary-actions\s*\{[\s\S]*?display:\s*flex/);
    expect(reviewCss).toMatch(/\.review-summary\s+section\s*\{[\s\S]*?border-top:/);
    expect(reviewCss).toMatch(/\.review-summary\s+table\s*\{[\s\S]*?white-space:\s*normal/);
  });

  it('switches only the project table to labelled project blocks at 760px', () => {
    expect(reviewCss).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.project-list-table\s+thead\s*\{[\s\S]*?display:\s*none/);
    expect(reviewCss).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.project-list-table\s+td::before\s*\{[\s\S]*?content:\s*attr\(data-label\)/);
    expect(reviewCss).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.review-summary-actions\s*\{[\s\S]*?flex-direction:\s*column/);
  });

  it('uses restrained geometry and never introduces gradients or viewport-sized type', () => {
    expect(allCss).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(/i);
    expect(allCss).not.toMatch(/font-size\s*:\s*[^;{}]*(?:vw|vh|vmin|vmax)/i);
    const radii = [...allCss.matchAll(/border-radius\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((match) => Number(match[1]));
    expect(radii.every((radius) => radius <= 6)).toBe(true);
    expect(allCss).toMatch(/letter-spacing:\s*0(?:px|em|rem)?\s*[;}]/);
  });
});
