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

it('describes the current workbench and labels fixed values as demonstration data', () => {
  render(<ProductLanding onStart={vi.fn()} />);

  expect(screen.getAllByText('演示数据').length).toBeGreaterThan(0);
  for (const label of ['数据总览', '问题项目', '人工复核', '复盘报告']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getByText(/先预览完整报告/)).toBeInTheDocument();
  expect(screen.getByText(/下载 Markdown/)).toBeInTheDocument();
  expect(screen.getByText(/导出项目明细 Excel/)).toBeInTheDocument();
  expect(screen.queryByText('已识别 17 个标准字段，共 150 条项目数据，可以开始分析。')).not.toBeInTheDocument();
});
