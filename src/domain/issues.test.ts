import { describe, expect, it } from 'vitest';
import { groupIssuesByProject } from './issues';
import type { Issue } from './analyze';

const issues: Issue[] = [
  { projectId: 'P-2026-024', projectName: '西南综合管廊项目', department: '营销三部', salesManager: '王宁', amount: 50000, category: '数据质量', label: '金额需复核', reason: '超过上限', status: '待人工确认' },
  { projectId: 'P-2026-024', projectName: '西南综合管廊项目', department: '营销三部', salesManager: '王宁', amount: 50000, category: '经营风险', label: '高金额低确定性', reason: '概率偏低', status: '待跟进' }
];

describe('groupIssuesByProject', () => {
  it('keeps multiple labels for the same project in one table row', () => {
    const groups = groupIssuesByProject(issues);
    expect(groups).toHaveLength(1);
    expect(groups[0].issues.map((issue) => issue.label)).toEqual(['金额需复核', '高金额低确定性']);
  });

  it('keeps missing project codes in separate review groups when source rows differ', () => {
    const groups = groupIssuesByProject([
      { ...issues[0], reviewKey: 'crm-history:4', projectId: '未填写项目编号', projectName: '未填写项目名称' },
      { ...issues[0], reviewKey: 'crm-history:9', projectId: '未填写项目编号', projectName: '未填写项目名称' }
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.reviewKey)).toEqual(['crm-history:4', 'crm-history:9']);
  });
});
