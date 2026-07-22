import { describe, expect, it } from 'vitest';
import { createReviewReport } from './report';
import type { AnalysisResult } from './analyze';
import type { ReviewRecordMap } from './review';
import { makeProject } from '../test/fixtures';

const analysis: AnalysisResult = {
  rows: [],
  findings: [],
  issues: [
    { projectId: 'P-2026-024', projectName: '远景综合管廊项目', department: '营销三部', salesManager: '示例经理丙', amount: 50000, category: '数据质量', label: '金额需复核', reason: '超过本次复核上限', status: '待人工确认' },
    { projectId: 'P-2026-025', projectName: '云川河道治理项目', department: '营销一部', salesManager: '示例经理甲', amount: 290, category: '经营风险', label: '跟进停滞', reason: '距离最近拜访已超过 14 天', status: '待跟进' },
    { projectId: 'P-2026-026', projectName: '星港轨道维保项目', department: '营销一部', salesManager: '示例经理甲', amount: 480, category: '数据质量', label: '疑似重复报备', reason: '项目编号重复', status: '待人工确认' }
  ],
  overview: { projectCount: 30, totalAmountWan: 8462, inProgressCount: 13, signedCount: 9, lostCount: 8, riskProjectCount: 10 },
  byDepartment: [],
  bySalesManager: [],
  manualStagnationProjects: [],
  observationProjects: []
};

const reviews: ReviewRecordMap = {
  'P-2026-024': { projectId: 'P-2026-024', projectName: '远景综合管廊项目', status: '确认数据错误', note: '已通知销售修正金额。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'x', dataUpdated: false, history: [] },
  'P-2026-025': { projectId: 'P-2026-025', projectName: '云川河道治理项目', status: '确认业务风险', note: '安排本周拜访。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'y', dataUpdated: false, history: [] },
  'P-2026-026': { projectId: 'P-2026-026', projectName: '星港轨道维保项目', status: '已忽略', note: '已在专项流程处理。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'z', dataUpdated: false, history: [] }
};

describe('createReviewReport', () => {
  it('includes the fixed human-confirmation disclaimer and key sections', () => {
    const report = createReviewReport(analysis, {}, new Date('2026-07-16'));
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
    expect(report).toContain('## 重点风险项目摘要');
    expect(report).toContain('P-2026-024');
  });

  it('adds grouped human-review progress while keeping the confirmation disclaimer', () => {
    const report = createReviewReport(analysis, reviews, new Date('2026-07-16'));

    expect(report).toContain('## 审查处理进度');
    expect(report).toContain('已通知销售修正金额。');
    expect(report).toContain('安排本周拜访。');
    expect(report).toContain('本期已忽略 1 个项目');
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
  });

  it('separates manual stagnation and low-probability observations from the risk summary', () => {
    const manualStagnation = makeProject({ sourceKey: 'crm-2', projectId: 'CRM-002', projectName: '云川仓储升级项目', department: '华南业务部', salesManager: '示例经理乙', status: '呆滞', amount: 1200, createdAt: '2026-03-02', lastFollowUpAt: '2026-04-01', expectedSignAt: '2026-09-30' });
    const observation = makeProject({ sourceKey: 'crm-5', projectId: 'CRM-005', projectName: '北原综合管廊项目', department: '华东业务部', salesManager: '示例经理甲', amount: 1850, createdAt: '2026-04-26', lastFollowUpAt: '2026-07-05', expectedSignAt: '2026-11-10', probabilityBand: '低概率' });
    const crmAnalysis: AnalysisResult = {
      ...analysis,
      findings: [],
      rows: [manualStagnation, observation],
      manualStagnationProjects: [manualStagnation],
      observationProjects: [observation]
    };
    const report = createReviewReport(crmAnalysis, {}, new Date('2026-07-16'));
    expect(report).toContain('## 已手动标记呆滞');
    expect(report).toContain('## 低概率重点项目');
    expect(report).toContain('不计入经营风险项目数');
    expect(report).toContain('手动标记呆滞 1 个');
    expect(report).not.toContain('已签约 9 个');
  });
});
