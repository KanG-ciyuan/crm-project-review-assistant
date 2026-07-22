import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import { buildAnalysis } from './analysis';
import { createReviewReport } from './report';
import type { Finding } from './rules';
import type { ReviewRecordMap } from './review';

const row = makeProject({ sourceKey: 'row-24', projectId: 'P-2026-024', projectName: '远景综合管廊项目' });
const findings: Finding[] = [
  { ruleId: 'amount', rowKey: 'row-24', projectId: row.projectId, projectName: row.projectName, customerName: row.customerName, department: row.department, salesManager: row.salesManager, amountWan: 50000, category: '数据质量待复核', label: '金额需复核', reason: '超过本次复核上限', level: 'review' },
  { ruleId: 'reserve', rowKey: 'row-24', projectId: row.projectId, projectName: row.projectName, customerName: row.customerName, department: row.department, salesManager: row.salesManager, amountWan: 50000, category: '经营结构分析', label: '长周期项目', reason: '仅用于经营观察', level: 'info' }
];
const analysis = buildAnalysis([row], findings, new Date('2026-07-16'));
const reviews: ReviewRecordMap = {
  'row-24': { projectId: row.projectId, projectName: row.projectName, status: '确认数据错误', note: '已通知销售修正金额。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'x', dataUpdated: false, history: [] }
};

describe('createReviewReport', () => {
  it('includes the fixed disclaimer and five result sections', () => {
    const report = createReviewReport(analysis, {}, new Date('2026-07-16'));
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
    for (const heading of ['数据质量待复核', '维护超期待整改', '疑似重复与撞单', '重点项目复盘', '经营结构分析']) {
      expect(report).toContain(`## ${heading}`);
    }
    expect(report).toContain('P-2026-024');
    expect(report).toContain('经营观察');
  });

  it('adds grouped human-review progress by project row key', () => {
    const report = createReviewReport(analysis, reviews, new Date('2026-07-16'));
    expect(report).toContain('## 审查处理进度');
    expect(report).toContain('已通知销售修正金额。');
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
  });
});
