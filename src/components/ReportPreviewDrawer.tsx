import { useEffect, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import type { ReportPreviewSnapshot } from '../domain/reportSnapshot';
import { ReportPreviewContent } from './ReportPreviewContent';

interface ReportPreviewDrawerProps {
  snapshot: ReportPreviewSnapshot;
  stale: boolean;
  downloaded: boolean;
  downloadError: string;
  onClose: () => void;
  onRegenerate: () => void;
  onDownload: (snapshot: ReportPreviewSnapshot) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  backgroundRef: RefObject<HTMLElement | null>;
}

export function ReportPreviewDrawer({
  snapshot,
  stale,
  downloaded,
  downloadError,
  onClose,
  onRegenerate,
  onDownload,
  returnFocusRef,
  backgroundRef
}: ReportPreviewDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const background = backgroundRef.current;
    const wasInert = background?.inert ?? false;
    if (background) background.inert = true;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      if (background) background.inert = wasInert;
      returnFocusRef.current?.focus();
    };
  }, [backgroundRef, onClose, returnFocusRef]);

  return <div className="report-preview-layer">
    <button
      className="report-preview-backdrop"
      type="button"
      aria-label="关闭报告预览背景"
      onClick={onClose}
    />
    <aside
      className="report-preview-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-preview-title"
    >
      <header className="report-preview-header">
        <div>
          <p className="report-preview-eyebrow">当前预览快照</p>
          <h2 id="report-preview-title">管理层复盘报告预览</h2>
        </div>
        <button ref={closeButtonRef} type="button" aria-label="关闭报告预览" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="report-preview-state">
        <p>生成时间：{new Date(snapshot.generatedAt).toLocaleString('zh-CN')}</p>
        {stale && <p role="status">数据已更新，请重新生成预览</p>}
        {downloaded && <p role="status">当前预览已下载</p>}
        {downloadError && <p role="alert">{downloadError}</p>}
      </div>
      <ReportPreviewContent markdown={snapshot.markdown} />
      <footer className="report-preview-actions">
        <button type="button" onClick={onClose}>关闭预览</button>
        {stale && <button type="button" onClick={onRegenerate}>重新生成预览</button>}
        <button type="button" onClick={() => onDownload(snapshot)}>下载 Markdown</button>
      </footer>
    </aside>
  </div>;
}
