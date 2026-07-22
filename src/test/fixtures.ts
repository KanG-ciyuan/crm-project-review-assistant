import type { ProjectRow } from '../domain/project';

export function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    sourceKey: 'row-1',
    projectId: 'CRM-001',
    projectName: '华城医院数字化改造',
    customerName: '华城医院',
    department: '华东一部',
    salesManager: '销售甲',
    status: '跟进中',
    amount: 1200,
    amountParseError: false,
    unit: '万元',
    createdAt: '2026-01-01',
    createdAtParseError: false,
    lastFollowUpAt: '2026-07-01',
    lastFollowUpAtParseError: false,
    expectedSignAt: '2026-08-01',
    expectedSignAtParseError: false,
    probabilityBand: '60%',
    industry: '医疗',
    region: '华东',
    projectType: '数字化项目',
    projectLevel: 'A级',
    latestUpdatedAt: '2026-07-01',
    customFields: {},
    ...overrides
  };
}
