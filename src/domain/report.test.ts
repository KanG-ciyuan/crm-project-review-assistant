import { describe, expect, it } from 'vitest';
import { createReviewReport } from './report';
import type { AnalysisResult } from './analyze';

const analysis: AnalysisResult = {
  rows: [],
  issues: [{ projectId: 'P-2026-024', projectName: '西南综合管廊项目', department: '营销三部', salesManager: '王宁', amount: 50000, category: '数据质量', label: '金额需复核', reason: '超过本次复核上限', status: '待人工确认' }],
  overview: { projectCount: 30, totalAmountWan: 8462, inProgressCount: 13, signedCount: 9, lostCount: 8, riskProjectCount: 10 },
  byDepartment: [],
  bySalesManager: []
};

describe('createReviewReport', () => {
  it('includes the fixed human-confirmation disclaimer and key sections', () => {
    const report = createReviewReport(analysis, new Date('2026-07-16'));
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
    expect(report).toContain('## 重点风险项目摘要');
    expect(report).toContain('P-2026-024');
  });
});
