export type ProjectStatus = '跟进中' | '呆滞' | '已签约' | '已丢单';
export type ProbabilityBand = '低概率' | '中等概率' | '较高概率' | '临近签约' | '未知';

export interface ProjectRow {
  sourceKey?: string;
  projectId: string;
  projectName: string;
  department: string;
  salesManager: string;
  status: ProjectStatus;
  amount: number | null;
  unit: '元' | '万元' | '亿元' | string;
  createdAt: string | null;
  lastVisitAt: string | null;
  expectedSignAt: string | null;
  probability: number | null;
  probabilityLabel?: string | null;
  probabilityBand?: ProbabilityBand;
  visitIntervalDays?: number | null;
  inputProfile?: 'standard' | 'crm-history';
  industry?: string | null;
  region?: string | null;
  projectType?: string | null;
  projectLevel?: string | null;
}

export interface Thresholds {
  followUpDays: number;
  longReserveDays: number;
  absoluteAmountLimitWan: number;
}

export type IssueLabel = '字段缺失' | '金额格式异常' | '金额需复核' | '日期逻辑异常' | '疑似重复报备' | '跟进停滞' | '签约预期失效' | '高金额低确定性' | '长期储备待复盘';

export interface Issue {
  reviewKey?: string;
  projectId: string;
  projectName: string;
  department: string;
  salesManager: string;
  amount: number | null;
  category: '数据质量' | '经营风险';
  label: IssueLabel;
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
  issues: Issue[];
  overview: Overview;
  byDepartment: BreakdownItem[];
  bySalesManager: BreakdownItem[];
  manualStagnationProjects: ProjectRow[];
  observationProjects: ProjectRow[];
}

const REQUIRED_FIELDS: Array<[keyof ProjectRow, string]> = [
  ['projectId', '项目编号'],
  ['projectName', '项目名称'],
  ['department', '部门'],
  ['salesManager', '销售经理'],
  ['status', '项目状态'],
  ['amount', '储备金额'],
  ['unit', '金额单位'],
  ['createdAt', '创建日期'],
  ['lastVisitAt', '最近拜访日期'],
  ['expectedSignAt', '预计签约日期'],
  ['probability', '成单概率']
];
const CRM_REQUIRED_FIELDS: Array<[keyof ProjectRow, string]> = [
  ['projectId', '项目编码'], ['projectName', '项目名称'], ['department', '部门'], ['salesManager', '销售经理'], ['status', '项目状态'], ['amount', '储备金额（万元）'], ['lastVisitAt', '最近拜访时间'], ['visitIntervalDays', '拜访间隔周期（天）'], ['expectedSignAt', '预计合同签订时间'], ['probabilityLabel', '成单概率']
];

const toWan = (amount: number | null, unit: ProjectRow['unit']): number | null => {
  if (amount === null || !Number.isFinite(amount)) return null;
  if (unit === '元') return amount / 10000;
  if (unit === '亿元') return amount * 10000;
  return amount;
};

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysSince = (date: Date, today: Date) => Math.floor((today.getTime() - date.getTime()) / 86400000);

const percentile = (numbers: number[], percent: number) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.ceil(percent * sorted.length) - 1];
};

const issueFrom = (row: ProjectRow, category: Issue['category'], label: IssueLabel, reason: string): Issue => ({
  reviewKey: row.sourceKey || row.projectId || `${row.projectName}|${row.department}|${row.salesManager}`,
  projectId: row.projectId || '未填写项目编号',
  projectName: row.projectName || '未填写项目名称',
  department: row.department || '未填写部门',
  salesManager: row.salesManager || '未填写负责人',
  amount: toWan(row.amount, row.unit),
  category,
  label,
  reason,
  status: category === '数据质量' ? '待人工确认' : '待跟进'
});

const duplicateKey = (row: ProjectRow) => [row.projectName, row.department, row.salesManager, row.createdAt].join('|');

export function analyzeProjects(rows: ProjectRow[], thresholds: Thresholds, today: Date): AnalysisResult {
  const issues: Issue[] = [];
  const manualStagnationProjects: ProjectRow[] = [];
  const observationProjects: ProjectRow[] = [];
  const duplicateCounts = new Map<string, number>();
  const idCounts = new Map<string, number>();
  const amountsWan = rows.map((row) => toWan(row.amount, row.unit)).filter((amount): amount is number => amount !== null);
  const highAmountThreshold = percentile(amountsWan, 0.75);

  for (const row of rows) {
    duplicateCounts.set(duplicateKey(row), (duplicateCounts.get(duplicateKey(row)) ?? 0) + 1);
    if (row.projectId) idCounts.set(row.projectId, (idCounts.get(row.projectId) ?? 0) + 1);
  }

  for (const row of rows) {
    const requiredFields = row.inputProfile === 'crm-history' ? CRM_REQUIRED_FIELDS : REQUIRED_FIELDS;
    const missing = requiredFields.filter(([key]) => row[key] === null || row[key] === undefined || row[key] === '').map(([, label]) => label);
    const amountWan = toWan(row.amount, row.unit);
    const createdAt = parseDate(row.createdAt);
    const lastVisitAt = parseDate(row.lastVisitAt);
    const expectedSignAt = parseDate(row.expectedSignAt);

    if (missing.length > 0) issues.push(issueFrom(row, '数据质量', '字段缺失', `缺少必填字段：${missing.join('、')}`));
    if (amountWan === null || amountWan <= 0) issues.push(issueFrom(row, '数据质量', '金额格式异常', '储备金额必须是大于 0 的数值'));
    if (amountWan !== null && amountWan > thresholds.absoluteAmountLimitWan) issues.push(issueFrom(row, '数据质量', '金额需复核', `储备金额 ${amountWan.toLocaleString()} 万元超过本次复核上限`));
    if (createdAt && ((lastVisitAt && lastVisitAt < createdAt) || (expectedSignAt && expectedSignAt < createdAt))) issues.push(issueFrom(row, '数据质量', '日期逻辑异常', '最近拜访日期或预计签约日期早于创建日期'));
    if ((row.projectId && (idCounts.get(row.projectId) ?? 0) > 1) || duplicateCounts.get(duplicateKey(row))! > 1) issues.push(issueFrom(row, '数据质量', '疑似重复报备', '项目编号重复，或项目名称、部门、负责人、创建日期相同'));

    if (row.inputProfile === 'crm-history') {
      if (row.status === '呆滞') manualStagnationProjects.push(row);
      if (row.probabilityBand === '低概率') observationProjects.push(row);
      if (row.status === '跟进中' && (row.visitIntervalDays ?? -1) > 30) issues.push(issueFrom(row, '经营风险', '跟进停滞', `CRM 导出的拜访间隔为 ${row.visitIntervalDays} 天，超过 30 天`));
      if ((row.status === '跟进中' || row.status === '呆滞') && expectedSignAt && expectedSignAt < today) issues.push(issueFrom(row, '经营风险', '签约预期失效', '预计合同签订日期已过，请更新项目预期或状态'));
      continue;
    }
    if (row.status !== '跟进中') continue;
    if (lastVisitAt && daysSince(lastVisitAt, today) > thresholds.followUpDays) issues.push(issueFrom(row, '经营风险', '跟进停滞', `距离最近拜访已超过 ${thresholds.followUpDays} 天`));
    if (expectedSignAt && expectedSignAt < today) issues.push(issueFrom(row, '经营风险', '签约预期失效', '预计签约日期早于分析当天，项目仍为跟进中'));
    if (amountWan !== null && amountWan > highAmountThreshold && (row.probability ?? 101) <= 50) issues.push(issueFrom(row, '经营风险', '高金额低确定性', `储备金额高于本次数据 75 分位，成单概率为 ${row.probability}%`));
    if (createdAt && daysSince(createdAt, today) > thresholds.longReserveDays) issues.push(issueFrom(row, '经营风险', '长期储备待复盘', `项目已储备超过 ${thresholds.longReserveDays} 天且仍为跟进中`));
  }

  const buildBreakdown = (key: 'department' | 'salesManager'): BreakdownItem[] => {
    const groups = new Map<string, BreakdownItem>();
    for (const row of rows) {
      const name = row[key] || '未填写';
      const item = groups.get(name) ?? { name, projectCount: 0, amountWan: 0 };
      item.projectCount += 1;
      item.amountWan += toWan(row.amount, row.unit) ?? 0;
      groups.set(name, item);
    }
    return [...groups.values()].sort((a, b) => b.amountWan - a.amountWan);
  };

  const riskProjectCount = new Set(issues.filter((issue) => issue.category === '经营风险').map((issue) => issue.projectId)).size;
  return {
    rows,
    issues,
    overview: {
      projectCount: rows.length,
      totalAmountWan: amountsWan.reduce((sum, amount) => sum + amount, 0),
      inProgressCount: rows.filter((row) => row.status === '跟进中').length,
      signedCount: rows.filter((row) => row.status === '已签约').length,
      lostCount: rows.filter((row) => row.status === '已丢单').length,
      riskProjectCount
    },
    byDepartment: buildBreakdown('department'),
    bySalesManager: buildBreakdown('salesManager'),
    manualStagnationProjects,
    observationProjects: observationProjects.sort((a, b) => (toWan(b.amount, b.unit) ?? 0) - (toWan(a.amount, a.unit) ?? 0))
  };
}
