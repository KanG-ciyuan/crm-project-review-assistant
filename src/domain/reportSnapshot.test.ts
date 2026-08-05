import { describe, expect, it } from 'vitest';
import {
  createReportSnapshot,
  isReportSnapshotStale,
  type ReportPreviewSnapshot
} from './reportSnapshot';

describe('createReportSnapshot', () => {
  it('captures the supplied report values and timestamp exactly', () => {
    const now = new Date(2026, 6, 21, 14, 30, 45, 123);
    const snapshot = createReportSnapshot('# 经营复盘\n\n正文', 'filters:v1', now);

    expect(snapshot).toEqual({
      markdown: '# 经营复盘\n\n正文',
      fileName: '储备项目经营复盘-2026-07-21-当前筛选.md',
      generatedAt: now.toISOString(),
      sourceSignature: 'filters:v1'
    });
  });

  it('uses the supplied date local calendar fields for the filename', () => {
    const now = new Date(2026, 0, 2, 0, 30);
    const expectedLocalDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

    expect(createReportSnapshot('report', 'signature', now).fileName)
      .toBe(`储备项目经营复盘-${expectedLocalDate}-当前筛选.md`);
  });

  it.each([
    '',
    '# 标题\n\n> 引用\n\n- 列表\n\n<script>alert("x")</script> & `代码`'
  ])('preserves Markdown without transformation: %j', (markdown) => {
    expect(createReportSnapshot(markdown, 'signature', new Date(2026, 6, 21)).markdown)
      .toBe(markdown);
  });

  it('returns a new value for each call without mutating inputs', () => {
    const markdown = '# 原始内容';
    const sourceSignature = 'source:original';
    const now = new Date(2026, 6, 21, 9, 15);
    const originalTime = now.getTime();

    const first = createReportSnapshot(markdown, sourceSignature, now);
    const second = createReportSnapshot(markdown, sourceSignature, now);

    expect(first).not.toBe(second);
    expect(now.getTime()).toBe(originalTime);
    expect(first.markdown).toBe(markdown);
    expect(first.sourceSignature).toBe(sourceSignature);
  });
});

describe('isReportSnapshotStale', () => {
  const snapshot: ReportPreviewSnapshot = {
    markdown: 'report',
    fileName: 'report.md',
    generatedAt: '2026-07-21T01:00:00.000Z',
    sourceSignature: 'same-signature'
  };

  it('returns false when there is no snapshot', () => {
    expect(isReportSnapshotStale(null, 'current-signature')).toBe(false);
  });

  it('returns false when the source signature is unchanged', () => {
    expect(isReportSnapshotStale(snapshot, 'same-signature')).toBe(false);
  });

  it('returns true only when the source signature differs', () => {
    expect(isReportSnapshotStale(snapshot, 'different-signature')).toBe(true);
  });
});
