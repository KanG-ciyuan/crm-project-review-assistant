import { formatLocalDate } from './report';

export interface ReportPreviewSnapshot {
  readonly markdown: string;
  readonly fileName: string;
  readonly generatedAt: string;
  readonly sourceSignature: string;
}

export function createReportSnapshot(
  markdown: string,
  sourceSignature: string,
  now: Date
): ReportPreviewSnapshot {
  const snapshot: ReportPreviewSnapshot = {
    markdown,
    fileName: `储备项目经营复盘-${formatLocalDate(now)}-当前筛选.md`,
    generatedAt: now.toISOString(),
    sourceSignature
  };

  return Object.freeze(snapshot);
}

export function isReportSnapshotStale(
  snapshot: ReportPreviewSnapshot | null,
  signature: string
): boolean {
  return snapshot !== null && snapshot.sourceSignature !== signature;
}
