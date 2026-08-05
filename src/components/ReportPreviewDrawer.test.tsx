import { createRef, useRef, useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportPreviewSnapshot } from '../domain/reportSnapshot';
import { ReportPreviewDrawer } from './ReportPreviewDrawer';

afterEach(cleanup);

const snapshot: ReportPreviewSnapshot = Object.freeze({
  markdown: '# 储备项目经营复盘报告\n\n## 一、本期经营结论\n\n- 原始快照内容',
  fileName: '储备项目经营复盘-2026-08-05-当前筛选.md',
  generatedAt: '2026-08-05T04:00:00.000Z',
  sourceSignature: 'source:v1'
});

function renderDrawer(overrides: Partial<React.ComponentProps<typeof ReportPreviewDrawer>> = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onRegenerate = overrides.onRegenerate ?? vi.fn();
  const onDownload = overrides.onDownload ?? vi.fn();
  const returnFocusRef = overrides.returnFocusRef ?? createRef<HTMLButtonElement>();
  const backgroundRef = overrides.backgroundRef ?? createRef<HTMLElement>();

  render(<>
    <main ref={backgroundRef}>工作区内容</main>
    <button ref={returnFocusRef}>打开报告预览</button>
    <ReportPreviewDrawer
      snapshot={snapshot}
      stale={false}
      downloaded={false}
      downloadError=""
      onClose={onClose}
      onRegenerate={onRegenerate}
      onDownload={onDownload}
      returnFocusRef={returnFocusRef}
      backgroundRef={backgroundRef}
      {...overrides}
    />
  </>);

  return { onDownload, backgroundRef };
}

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backgroundRef = useRef<HTMLElement>(null);
  return <>
    <main ref={backgroundRef}>工作区内容</main>
    <button ref={triggerRef} onClick={() => setOpen(true)}>打开报告预览</button>
    {open && <ReportPreviewDrawer
      snapshot={snapshot}
      stale={false}
      downloaded={false}
      downloadError=""
      onClose={() => setOpen(false)}
      onRegenerate={() => undefined}
      onDownload={() => undefined}
      returnFocusRef={triggerRef}
      backgroundRef={backgroundRef}
    />}
  </>;
}

function UpdatingDrawerHarness() {
  const [downloaded, setDownloaded] = useState(false);
  const [closedWith, setClosedWith] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backgroundRef = useRef<HTMLElement>(null);
  return <>
    <main ref={backgroundRef}>工作区内容</main>
    <button ref={triggerRef}>打开报告预览</button>
    <ReportPreviewDrawer
      snapshot={snapshot}
      stale={false}
      downloaded={downloaded}
      downloadError=""
      onClose={() => setClosedWith(downloaded ? 'updated' : 'initial')}
      onRegenerate={() => undefined}
      onDownload={() => setDownloaded(true)}
      returnFocusRef={triggerRef}
      backgroundRef={backgroundRef}
    />
    <output aria-label="关闭回调版本">{closedWith}</output>
  </>;
}

describe('ReportPreviewDrawer', () => {
  it('shows the immutable snapshot and passes that exact object to download', async () => {
    const user = userEvent.setup();
    const { onDownload } = renderDrawer();

    expect(screen.getByRole('dialog', { name: '管理层复盘报告预览' })).toHaveTextContent('原始快照内容');
    await user.click(screen.getByRole('button', { name: '下载 Markdown' }));
    expect(onDownload).toHaveBeenCalledOnce();
    expect(onDownload).toHaveBeenCalledWith(snapshot);
  });

  it('announces stale, downloaded, and failed states while keeping regeneration available', async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    renderDrawer({ stale: true, downloaded: true, downloadError: '报告下载失败，请重试。', onRegenerate });

    expect(screen.getByText('数据已更新，请重新生成预览')).toHaveAttribute('role', 'status');
    expect(screen.getByText('当前预览已下载')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('alert')).toHaveTextContent('报告下载失败，请重试。');
    expect(screen.getByText('原始快照内容')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新生成预览' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it.each([
    ['header', '关闭报告预览'],
    ['footer', '关闭预览'],
    ['backdrop', '关闭报告预览背景']
  ] as const)('closes through the %s control and restores trigger focus', async (_path, accessibleName) => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const trigger = screen.getByRole('button', { name: '打开报告预览' });

    await user.click(trigger);
    expect(screen.getByRole('button', { name: '关闭报告预览' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: accessibleName }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes with Escape and restores trigger focus', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const trigger = screen.getByRole('button', { name: '打开报告预览' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps focus and inert stable across parent updates while Escape uses the latest close callback', async () => {
    const user = userEvent.setup();
    render(<UpdatingDrawerHarness />);
    const background = screen.getByText('工作区内容');
    const trigger = screen.getByRole('button', { name: '打开报告预览' });
    const download = screen.getByRole('button', { name: '下载 Markdown' });

    await user.click(download);

    expect(download).toHaveFocus();
    expect(trigger).not.toHaveFocus();
    expect(background.inert).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByText('当前预览已下载')).toHaveAttribute('role', 'status');
    expect(screen.getByLabelText('关闭回调版本')).toHaveTextContent('updated');
  });

  it('makes the background inert only while open', () => {
    const backgroundRef = createRef<HTMLElement>();
    const returnFocusRef = createRef<HTMLButtonElement>();
    const view = render(<>
      <main ref={backgroundRef}>工作区内容</main>
      <button ref={returnFocusRef}>打开报告预览</button>
      <ReportPreviewDrawer
        snapshot={snapshot}
        stale={false}
        downloaded={false}
        downloadError=""
        onClose={() => undefined}
        onRegenerate={() => undefined}
        onDownload={() => undefined}
        returnFocusRef={returnFocusRef}
        backgroundRef={backgroundRef}
      />
    </>);

    const background = backgroundRef.current;
    expect(background?.inert).toBe(true);
    view.unmount();
    expect(background?.inert).toBe(false);
  });

  it('restores an already inert background to its original state', () => {
    const backgroundRef = createRef<HTMLElement>();
    const returnFocusRef = createRef<HTMLButtonElement>();
    const view = render(<>
      <main ref={(element) => {
        backgroundRef.current = element;
        if (element) element.inert = true;
      }}>工作区内容</main>
      <button ref={returnFocusRef}>打开报告预览</button>
      <ReportPreviewDrawer
        snapshot={snapshot}
        stale={false}
        downloaded={false}
        downloadError=""
        onClose={() => undefined}
        onRegenerate={() => undefined}
        onDownload={() => undefined}
        returnFocusRef={returnFocusRef}
        backgroundRef={backgroundRef}
      />
    </>);

    const background = backgroundRef.current;
    view.unmount();
    expect(background?.inert).toBe(true);
  });

  it('keeps Tab and Shift+Tab focus within the modal controls', async () => {
    const user = userEvent.setup();
    renderDrawer({ stale: true });
    const close = screen.getByRole('button', { name: '关闭报告预览' });
    const regenerate = screen.getByRole('button', { name: '重新生成预览' });
    const download = screen.getByRole('button', { name: '下载 Markdown' });

    expect(close).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(download).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: '关闭预览' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(regenerate).toHaveFocus();
  });
});
