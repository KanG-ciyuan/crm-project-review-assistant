import { describe, expect, it } from 'vitest';
import { analyzeProjects, type ProjectRow } from './analyze';

const rows: ProjectRow[] = [
  { projectId: 'P-2026-001', projectName: '星港轨道维保项目', department: '营销一部', salesManager: '示例经理甲', status: '跟进中', amount: 480, unit: '万元', createdAt: '2026-05-08', lastVisitAt: '2026-07-13', expectedSignAt: '2026-08-15', probability: 70 },
  { projectId: 'P-2026-017', projectName: '星港道路检测项目', department: '营销一部', salesManager: '示例经理甲', status: '跟进中', amount: 240, unit: '万元', createdAt: '2026-04-14', lastVisitAt: '2026-06-22', expectedSignAt: '2026-08-05', probability: 60 },
  { projectId: 'P-2026-018', projectName: '云川水库监测项目', department: '营销二部', salesManager: '示例经理乙', status: '跟进中', amount: 620, unit: '万元', createdAt: '2026-03-28', lastVisitAt: '2026-06-18', expectedSignAt: '2026-08-03', probability: 50 },
  { projectId: 'P-2026-019', projectName: '北原隧道运维项目', department: '营销三部', salesManager: '示例经理丙', status: '跟进中', amount: 730, unit: '万元', createdAt: '2026-02-18', lastVisitAt: '2026-06-20', expectedSignAt: '2026-08-10', probability: 40 },
  { projectId: 'P-2026-021', projectName: '江畔桥梁加固项目', department: '营销二部', salesManager: '示例经理乙', status: '跟进中', amount: 420, unit: '万元', createdAt: '2026-03-10', lastVisitAt: '2026-06-20', expectedSignAt: '2026-08-12', probability: 60 },
  { projectId: 'P-2026-022', projectName: '星港智慧停车项目', department: '营销一部', salesManager: '示例经理甲', status: '跟进中', amount: 350, unit: '万元', createdAt: '2026-02-15', lastVisitAt: '2026-07-10', expectedSignAt: '2026-07-08', probability: 70 },
  { projectId: 'P-2026-023', projectName: '远景交通数字化项目', department: '营销二部', salesManager: '示例经理乙', status: '跟进中', amount: 6800, unit: '万元', createdAt: '2026-05-03', lastVisitAt: '2026-07-13', expectedSignAt: '2026-10-18', probability: 30 },
  { projectId: 'P-2026-024', projectName: '远景综合管廊项目', department: '营销三部', salesManager: '示例经理丙', status: '跟进中', amount: 50000, unit: '万元', createdAt: '2026-05-18', lastVisitAt: '2026-07-14', expectedSignAt: '2026-11-20', probability: 60 },
  { projectId: 'P-2026-025', projectName: '云川河道治理项目', department: '营销一部', salesManager: '示例经理甲', status: '跟进中', amount: 290, unit: '万元', createdAt: '2026-05-20', lastVisitAt: null, expectedSignAt: '2026-09-25', probability: 50 },
  { projectId: 'P-2026-026', projectName: '星港轨道维保项目', department: '营销一部', salesManager: '示例经理甲', status: '跟进中', amount: 480, unit: '万元', createdAt: '2026-05-08', lastVisitAt: '2026-07-13', expectedSignAt: '2026-08-15', probability: 70 },
  { projectId: 'P-2026-027', projectName: '海岬港区安防项目', department: '营销三部', salesManager: '示例经理丙', status: '跟进中', amount: 650, unit: '万元', createdAt: '2026-02-01', lastVisitAt: '2026-07-08', expectedSignAt: '2026-12-10', probability: 60 }
];

describe('analyzeProjects', () => {
  it('flags the expected quality and business-review cases without modifying source amounts', () => {
    const result = analyzeProjects(rows, { followUpDays: 14, longReserveDays: 90, absoluteAmountLimitWan: 10000 }, new Date('2026-07-16'));
    expect(result.issues.map((issue) => [issue.projectId, issue.label])).toEqual(expect.arrayContaining([
      ['P-2026-017', '跟进停滞'],
      ['P-2026-018', '跟进停滞'],
      ['P-2026-019', '跟进停滞'],
      ['P-2026-021', '跟进停滞'],
      ['P-2026-022', '签约预期失效'],
      ['P-2026-023', '高金额低确定性'],
      ['P-2026-024', '金额需复核'],
      ['P-2026-025', '字段缺失'],
      ['P-2026-026', '疑似重复报备'],
      ['P-2026-027', '长期储备待复盘']
    ]));
    expect(rows.find((row) => row.projectId === 'P-2026-024')?.amount).toBe(50000);
  });

  it('uses CRM visit intervals for active projects while keeping manual stagnation separate', () => {
    const crmRows: ProjectRow[] = [
      { projectId: 'CRM-A', projectName: '项目A', department: '营销一部', salesManager: '销售甲', status: '跟进中', amount: 800, unit: '万元', createdAt: '2026-06-01', lastVisitAt: '2026-07-01', visitIntervalDays: 31, expectedSignAt: '2026-08-01', probability: null, probabilityBand: '中等概率', inputProfile: 'crm-history' },
      { projectId: 'CRM-B', projectName: '项目B', department: '营销一部', salesManager: '销售乙', status: '呆滞', amount: 400, unit: '万元', createdAt: '2026-06-01', lastVisitAt: '2026-06-01', visitIntervalDays: 90, expectedSignAt: '2026-08-01', probability: null, probabilityBand: '低概率', inputProfile: 'crm-history' },
      { projectId: 'CRM-C', projectName: '项目C', department: '营销二部', salesManager: '销售丙', status: '呆滞', amount: 900, unit: '万元', createdAt: '2026-06-01', lastVisitAt: '2026-07-16', visitIntervalDays: 1, expectedSignAt: '2026-07-01', probability: null, probabilityBand: '低概率', inputProfile: 'crm-history' }
    ];
    const result = analyzeProjects(crmRows, { followUpDays: 30, longReserveDays: 90, absoluteAmountLimitWan: 10000 }, new Date('2026-07-17'));

    expect(result.issues.map((issue) => [issue.projectId, issue.label])).toContainEqual(['CRM-A', '跟进停滞']);
    expect(result.issues.map((issue) => [issue.projectId, issue.label])).not.toContainEqual(['CRM-B', '跟进停滞']);
    expect(result.issues.map((issue) => [issue.projectId, issue.label])).toContainEqual(['CRM-C', '签约预期失效']);
    expect(result.manualStagnationProjects.map((row) => row.projectId)).toEqual(['CRM-B', 'CRM-C']);
    expect(result.observationProjects.map((row) => row.projectId)).toEqual(['CRM-C', 'CRM-B']);
  });
});
