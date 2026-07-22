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

  it('writes a markdown-safe active filter scope immediately after the generated date', () => {
    const report = createReviewReport(analysis, {}, new Date('2026-07-16'), [
      '部门：华东\n一部',
      '标签：跟进 | 超期'
    ]);

    expect(report).toContain('生成日期：2026-07-16\n\n筛选范围：部门：华东 一部；标签：跟进 / 超期');
    expect(report).not.toContain('筛选范围：部门：华东\n一部');
  });

  it('only reports rows and actionable review progress from the projected analysis', () => {
    const hidden = makeProject({ sourceKey: 'row-hidden', projectId: 'P-HIDDEN', projectName: '不应泄漏项目' });
    const visibleAction: Finding = {
      ...findings[0], rowKey: row.sourceKey, projectId: row.projectId, projectName: row.projectName,
      category: '维护超期待整改', label: '跟进超期', level: 'action'
    };
    const projected = buildAnalysis([row], [visibleAction, findings[1]], new Date('2026-07-16'));
    const mixedReviews: ReviewRecordMap = {
      ...reviews,
      [hidden.sourceKey]: {
        projectId: hidden.projectId, projectName: hidden.projectName, status: '确认业务风险', note: '隐藏项目备注',
        firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z',
        fingerprint: 'hidden', dataUpdated: false, history: []
      }
    };

    const report = createReviewReport(projected, mixedReviews, new Date('2026-07-16'), ['部门：华东部']);

    expect(report).toContain('远景综合管廊项目');
    expect(report).not.toContain(hidden.projectName);
    expect(report).not.toContain('仅属于隐藏项目的证据');
    expect(report).not.toContain('隐藏项目备注');
    expect(report).toContain('## 经营结构分析');
    expect(report).not.toContain('重点风险项目');
    expect(report).not.toContain('低概率重点项目');
  });

  it('does not count information-only findings as pending review work', () => {
    const infoOnly = buildAnalysis([row], [findings[1]], new Date('2026-07-16'));
    const report = createReviewReport(infoOnly, reviews, new Date('2026-07-16'));

    expect(report).toContain('### 待复核项目\n\n本期无项目。');
    expect(report).toContain('### 已确认数据错误项目\n\n本期无项目。');
  });
});
