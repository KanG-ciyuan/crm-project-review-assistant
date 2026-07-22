import { amountInWan, type ProjectRow } from './project';
import type { Finding } from './rules';

export * from './project';
export * from './rules';

/** Temporary shape consumed by the pre-Task-5 results screen and report. */
export interface Issue {
  reviewKey?: string;
  projectId: string;
  projectName: string;
  department: string;
  salesManager: string;
  amount: number | null;
  category: '数据质量' | '经营风险';
  label: string;
  reason: string;
  status: '待人工确认' | '待跟进';
}

export interface Overview {
  projectCount: number;
  totalAmountWan: number;
  inProgressCount: number;
  signedCount: number;
  lostCount: number;
  riskProjectCount: number;
}

export interface BreakdownItem {
  name: string;
  projectCount: number;
  amountWan: number;
}

export interface AnalysisResult {
  rows: ProjectRow[];
  findings: Finding[];
  issues: Issue[];
  overview: Overview;
  byDepartment: BreakdownItem[];
  bySalesManager: BreakdownItem[];
  manualStagnationProjects: ProjectRow[];
  observationProjects: ProjectRow[];
}

const legacyIssue = (item: Finding): Issue => ({
  reviewKey: item.rowKey,
  projectId: item.projectId || '未填写项目编号',
  projectName: item.projectName || '未填写项目名称',
  department: item.department || '未填写部门',
  salesManager: item.salesManager || '未填写负责人',
  amount: item.amountWan,
  category: item.category === '数据质量待复核' ? '数据质量' : '经营风险',
  label: item.label,
  reason: item.reason,
  status: item.level === 'action' ? '待跟进' : '待人工确认'
});

/**
 * Projects the confirmed rule findings into the old screen's data contract.
 * It deliberately contains no detection logic; Task 5 replaces this adapter.
 */
export function adaptFindingsForLegacyView(rows: ProjectRow[], findings: Finding[]): AnalysisResult {
  const amountsWan = rows.map(amountInWan).filter((amount): amount is number => amount !== null);
  const buildBreakdown = (key: 'department' | 'salesManager'): BreakdownItem[] => {
    const groups = new Map<string, BreakdownItem>();
    for (const row of rows) {
      const name = row[key] || '未填写';
      const item = groups.get(name) ?? { name, projectCount: 0, amountWan: 0 };
      item.projectCount += 1;
      item.amountWan += amountInWan(row) ?? 0;
      groups.set(name, item);
    }
    return [...groups.values()].sort((left, right) => right.amountWan - left.amountWan);
  };
  const riskRowKeys = new Set(findings
    .filter((item) => item.category !== '数据质量待复核' && item.level !== 'info')
    .map((item) => item.rowKey));

  return {
    rows,
    findings,
    issues: findings.map(legacyIssue),
    overview: {
      projectCount: rows.length,
      totalAmountWan: amountsWan.reduce((sum, amount) => sum + amount, 0),
      inProgressCount: rows.filter((row) => row.status === '跟进中').length,
      signedCount: rows.filter((row) => row.status === '已签约').length,
      lostCount: rows.filter((row) => row.status === '已丢单').length,
      riskProjectCount: riskRowKeys.size
    },
    byDepartment: buildBreakdown('department'),
    bySalesManager: buildBreakdown('salesManager'),
    manualStagnationProjects: rows.filter((row) => row.status === '呆滞'),
    observationProjects: rows
      .filter((row) => row.probabilityBand === '低概率' || row.probabilityBand === '询价类')
      .sort((left, right) => (amountInWan(right) ?? 0) - (amountInWan(left) ?? 0))
  };
}
