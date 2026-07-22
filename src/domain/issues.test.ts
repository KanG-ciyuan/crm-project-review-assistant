import { describe, expect, it } from 'vitest';
import { groupIssuesByProject } from './issues';
import type { Finding } from './rules';

const findings: Finding[] = [
  { ruleId: 'amount', rowKey: 'row-24', projectId: 'P-2026-024', projectName: '远景综合管廊项目', customerName: '远景公司', department: '营销三部', salesManager: '示例经理丙', amountWan: 50000, category: '数据质量待复核', label: '金额需复核', reason: '超过上限', level: 'review' },
  { ruleId: 'follow-up', rowKey: 'row-24', projectId: 'P-2026-024', projectName: '远景综合管廊项目', customerName: '远景公司', department: '营销三部', salesManager: '示例经理丙', amountWan: 50000, category: '维护超期待整改', label: '跟进超期', reason: '超过30天', level: 'action' }
];

describe('groupIssuesByProject', () => {
  it('keeps multiple labels for the same project in one table row', () => {
    const groups = groupIssuesByProject(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reviewKey: 'row-24', customerName: '远景公司', department: '营销三部', salesManager: '示例经理丙' });
    expect(groups[0].findings.map((finding) => finding.category)).toEqual(['数据质量待复核', '维护超期待整改']);
  });

  it('keeps missing project codes in separate review groups when source rows differ', () => {
    const groups = groupIssuesByProject([
      { ...findings[0], rowKey: 'crm-history:4', projectId: '', projectName: '' },
      { ...findings[0], rowKey: 'crm-history:9', projectId: '', projectName: '' }
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.reviewKey)).toEqual(['crm-history:4', 'crm-history:9']);
  });
});
