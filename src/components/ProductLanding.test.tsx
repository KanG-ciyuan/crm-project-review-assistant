import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductLanding } from './ProductLanding';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('switches the sticky workbench when the next workflow stage enters the page viewport', () => {
  let observerCallback: IntersectionObserverCallback = () => undefined;

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '-35% 0px -55% 0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];

    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }

    disconnect() {}
    observe() {}
    takeRecords() { return []; }
    unobserve() {}
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  render(<ProductLanding onStart={vi.fn()} />);

  const thirdStage = screen.getByRole('link', { name: /03.*每一个提示/ });
  act(() => observerCallback([{ isIntersecting: true, intersectionRatio: 1, target: thirdStage } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));

  expect(screen.getByRole('region', { name: '规则扫描' })).toHaveAttribute('data-active', 'true');
  expect(screen.getByRole('region', { name: '文件导入' })).toHaveAttribute('data-active', 'false');
});
