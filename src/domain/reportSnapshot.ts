import { formatLocalDate } from './report';

export interface ReportPreviewSnapshot {
  markdown: string;
  fileName: string;
  generatedAt: string;
  sourceSignature: string;
}

export function createReportSnapshot(
  markdown: string,
  sourceSignature: string,
  now: Date
): ReportPreviewSnapshot {
  return {
    markdown,
    fileName: `储备项目经营复盘-${formatLocalDate(now)}-当前筛选.md`,
    generatedAt: now.toISOString(),
    sourceSignature
  };
}

export function isReportSnapshotStale(
  snapshot: ReportPreviewSnapshot | null,
  signature: string
): boolean {
  return snapshot !== null && snapshot.sourceSignature !== signature;
}
