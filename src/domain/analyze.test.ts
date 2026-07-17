import { describe, expect, it } from 'vitest';
import { analyzeProjects, type ProjectRow } from './analyze';

const rows: ProjectRow[] = [
  { projectId: 'P-2026-001', projectName: '南昌轨道维保项目', department: '营销一部', salesManager: '陈晨', status: '跟进中', amount: 480, unit: '万元', createdAt: '2026-05-08', lastVisitAt: '2026-07-13', expectedSignAt: '2026-08-15', probability: 70 },
  { projectId: 'P-2026-017', projectName: '南昌道路检测项目', department: '营销一部', salesManager: '陈晨', status: '跟进中', amount: 240, unit: '万元', createdAt: '2026-04-14', lastVisitAt: '2026-06-22', expectedSignAt: '2026-08-05', probability: 60 },
  { projectId: 'P-2026-018', projectName: '宜昌水库监测项目', department: '营销二部', salesManager: '李航', status: '跟进中', amount: 620, unit: '万元', createdAt: '2026-03-28', lastVisitAt: '2026-06-18', expectedSignAt: '2026-08-03', probability: 50 },
  { projectId: 'P-2026-019', projectName: '南京隧道运维项目', department: '营销三部', salesManager: '王宁', status: '跟进中', amount: 730, unit: '万元', createdAt: '2026-02-18', lastVisitAt: '2026-06-20', expectedSignAt: '2026-08-10', probability: 40 },
  { projectId: 'P-2026-021', projectName: '武汉桥梁加固项目', department: '营销二部', salesManager: '李航', status: '跟进中', amount: 420, unit: '万元', createdAt: '2026-03-10', lastVisitAt: '2026-06-20', expectedSignAt: '2026-08-12', probability: 60 },
  { projectId: 'P-2026-022', projectName: '南昌智慧停车项目', department: '营销一部', salesManager: '陈晨', status: '跟进中', amount: 350, unit: '万元', createdAt: '2026-02-15', lastVisitAt: '2026-07-10', expectedSignAt: '2026-07-08', probability: 70 },
  { projectId: 'P-2026-023', projectName: '华中交通数字化项目', department: '营销二部', salesManager: '李航', status: '跟进中', amount: 6800, unit: '万元', createdAt: '2026-05-03', lastVisitAt: '2026-07-13', expectedSignAt: '2026-10-18', probability: 30 },
  { projectId: 'P-2026-024', projectName: '西南综合管廊项目', department: '营销三部', salesManager: '王宁', status: '跟进中', amount: 50000, unit: '万元', createdAt: '2026-05-18', lastVisitAt: '2026-07-14', expectedSignAt: '2026-11-20', probability: 60 },
  { projectId: 'P-2026-025', projectName: '赣州河道治理项目', department: '营销一部', salesManager: '陈晨', status: '跟进中', amount: 290, unit: '万元', createdAt: '2026-05-20', lastVisitAt: null, expectedSignAt: '2026-09-25', probability: 50 },
  { projectId: 'P-2026-026', projectName: '南昌轨道维保项目', department: '营销一部', salesManager: '陈晨', status: '跟进中', amount: 480, unit: '万元', createdAt: '2026-05-08', lastVisitAt: '2026-07-13', expectedSignAt: '2026-08-15', probability: 70 },
  { projectId: 'P-2026-027', projectName: '宁波港区安防项目', department: '营销三部', salesManager: '王宁', status: '跟进中', amount: 650, unit: '万元', createdAt: '2026-02-01', lastVisitAt: '2026-07-08', expectedSignAt: '2026-12-10', probability: 60 }
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
});
