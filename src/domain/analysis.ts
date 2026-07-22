import { amountInWan, daysBetween, projectKey, type CanonicalFieldKey, type ProjectRow } from './project';
import type { Finding, FindingCategory } from './rules';

export interface AnalysisOverview {
  projectCount: number;
  totalAmountWan: number;
  inProgressCount: number;
  dormantCount: number;
  signedCount: number;
  lostCount: number;
}

export interface BreakdownItem {
  name: string;
  projectCount: number;
  amountWan: number;
}

export interface AnalysisResult {
  rows: ProjectRow[];
  findings: Finding[];
  mappedFields: CanonicalFieldKey[];
  overview: AnalysisOverview;
  byDepartment: BreakdownItem[];
  bySalesManager: BreakdownItem[];
  followUpBuckets: BreakdownItem[];
  reserveCycleBuckets: BreakdownItem[];
  probabilityBreakdown: BreakdownItem[];
  results: Record<FindingCategory, Finding[]>;
  generatedAt: string;
}

const ALL_CANONICAL_FIELDS: CanonicalFieldKey[] = [
  'projectId', 'projectName', 'customerName', 'department', 'salesManager',
  'status', 'amount', 'unit', 'createdAt', 'lastFollowUpAt', 'expectedSignAt',
  'probabilityBand', 'industry', 'region', 'projectType', 'projectLevel', 'latestUpdatedAt'
];

export const FINDING_CATEGORIES: FindingCategory[] = [
  '数据质量待复核',
  '维护超期待整改',
  '疑似重复与撞单',
  '重点项目复盘',
  '经营结构分析'
];

const FOLLOW_UP_BUCKETS = [
  { name: '0-7天', min: 0, max: 7 },
  { name: '8-15天', min: 8, max: 15 },
  { name: '16-30天', min: 16, max: 30 },
  { name: '31-60天', min: 31, max: 60 },
  { name: '61天以上', min: 61, max: Number.POSITIVE_INFINITY }
];

const RESERVE_BUCKETS = [
  { name: '0-90天', min: 0, max: 90 },
  { name: '91-180天', min: 91, max: 180 },
  { name: '181-365天', min: 181, max: 365 },
  { name: '超过365天', min: 366, max: Number.POSITIVE_INFINITY }
];

const PROBABILITY_ORDER = ['询价类', '低概率', '中等概率', '较高概率', '临近签约', '未知'];

function strictDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function amountFor(row: ProjectRow) {
  return amountInWan(row) ?? 0;
}

function breakdown(rows: ProjectRow[], field: 'department' | 'salesManager'): BreakdownItem[] {
  const groups = new Map<string, BreakdownItem>();
  for (const row of rows) {
    const name = row[field].trim() || '未填写';
    const item = groups.get(name) ?? { name, projectCount: 0, amountWan: 0 };
    item.projectCount += 1;
    item.amountWan += amountFor(row);
    groups.set(name, item);
  }
  return [...groups.values()].sort((left, right) =>
    right.amountWan - left.amountWan || right.projectCount - left.projectCount || left.name.localeCompare(right.name, 'zh-CN')
  );
}

function dateBuckets(rows: ProjectRow[], field: 'lastFollowUpAt' | 'createdAt', buckets: typeof FOLLOW_UP_BUCKETS, today: Date) {
  const output = buckets.map(({ name }) => ({ name, projectCount: 0, amountWan: 0 }));
  for (const row of rows) {
    const date = strictDate(row[field]);
    if (!date) continue;
    const age = daysBetween(date, today);
    const index = buckets.findIndex(({ min, max }) => age >= min && age <= max);
    if (index < 0) continue;
    output[index].projectCount += 1;
    output[index].amountWan += amountFor(row);
  }
  return output;
}

function probabilityBreakdown(rows: ProjectRow[]): BreakdownItem[] {
  const groups = new Map(PROBABILITY_ORDER.map((name) => [name, { name, projectCount: 0, amountWan: 0 }]));
  for (const row of rows) {
    const name = PROBABILITY_ORDER.includes(row.probabilityBand) ? row.probabilityBand : '未知';
    const item = groups.get(name)!;
    item.projectCount += 1;
    item.amountWan += amountFor(row);
  }
  return PROBABILITY_ORDER.map((name) => groups.get(name)!);
}

function constructAnalysis(rows: ProjectRow[], findings: Finding[], today: Date, generatedAt = today.toISOString(), mappedFields = ALL_CANONICAL_FIELDS): AnalysisResult {
  const results = Object.fromEntries(FINDING_CATEGORIES.map((category) => [category, findings.filter((item) => item.category === category)])) as Record<FindingCategory, Finding[]>;
  return {
    rows,
    findings,
    mappedFields: [...mappedFields],
    overview: {
      projectCount: rows.length,
      totalAmountWan: rows.reduce((sum, row) => sum + amountFor(row), 0),
      inProgressCount: rows.filter((row) => row.status === '跟进中').length,
      dormantCount: rows.filter((row) => row.status === '呆滞').length,
      signedCount: rows.filter((row) => row.status === '已签约').length,
      lostCount: rows.filter((row) => row.status === '已丢单').length
    },
    byDepartment: breakdown(rows, 'department'),
    bySalesManager: breakdown(rows, 'salesManager'),
    followUpBuckets: dateBuckets(rows, 'lastFollowUpAt', FOLLOW_UP_BUCKETS, today),
    reserveCycleBuckets: dateBuckets(rows, 'createdAt', RESERVE_BUCKETS, today),
    probabilityBreakdown: probabilityBreakdown(rows),
    results,
    generatedAt
  };
}

export function buildAnalysis(rows: ProjectRow[], findings: Finding[], today: Date, mappedFields: CanonicalFieldKey[] = ALL_CANONICAL_FIELDS): AnalysisResult {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return constructAnalysis(rows, findings, todayStart, today.toISOString(), mappedFields);
}

export function projectAnalysis(full: AnalysisResult, selectedRowKeys: Set<string>): AnalysisResult {
  const rows = full.rows.filter((row) => selectedRowKeys.has(projectKey(row)));
  const findings = full.findings.filter((finding) => selectedRowKeys.has(finding.rowKey));
  const generatedAt = new Date(full.generatedAt);
  const today = Number.isNaN(generatedAt.getTime())
    ? new Date()
    : new Date(generatedAt.getFullYear(), generatedAt.getMonth(), generatedAt.getDate());
  return constructAnalysis(rows, findings, today, full.generatedAt, full.mappedFields);
}
