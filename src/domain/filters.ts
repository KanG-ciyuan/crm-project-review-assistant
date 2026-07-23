import { amountInWan, daysBetween, projectKey, type ProbabilityBand, type ProjectRow, type ProjectStatus } from './project';
import { FINDING_CATEGORIES, type AnalysisResult } from './analysis';
import type { FindingCategory } from './rules';
import { REVIEW_STATUSES, type ReviewRecordMap, type ReviewStatus } from './review';
import { manualReviewKeys } from './workbench';

export interface FilterState {
  customerNames: string[];
  departments: string[];
  salesManagers: string[];
  statuses: ProjectStatus[];
  probabilityBands: ProbabilityBand[];
  amountBands: string[];
  amountMinWan: number | null;
  amountMaxWan: number | null;
  followUpBands: string[];
  reserveCycleBands: string[];
  categories: FindingCategory[];
  labels: string[];
  reviewStatuses: ReviewStatus[];
  industries: string[];
  regions: string[];
  projectTypes: string[];
  projectLevels: string[];
  query: string;
  customValues: Record<string, string[]>;
}

export const EMPTY_FILTERS: FilterState = {
  customerNames: [],
  departments: [],
  salesManagers: [],
  statuses: [],
  probabilityBands: [],
  amountBands: [],
  amountMinWan: null,
  amountMaxWan: null,
  followUpBands: [],
  reserveCycleBands: [],
  categories: [],
  labels: [],
  reviewStatuses: [],
  industries: [],
  regions: [],
  projectTypes: [],
  projectLevels: [],
  query: '',
  customValues: Object.create(null) as Record<string, string[]>
};

export interface CountedOption<T extends string = string> {
  value: T;
  count: number;
}

export interface BandDefinition {
  value: string;
  min?: number;
  maxExclusive?: number;
  invalid?: 'missing' | 'non-positive';
  positiveOnly?: boolean;
}

export const AMOUNT_BANDS: BandDefinition[] = [
  { value: '普通', min: 0, maxExclusive: 1000, positiveOnly: true },
  { value: '大额', min: 1000, maxExclusive: 5000, positiveOnly: true },
  { value: '超大', min: 5000, maxExclusive: 10_000, positiveOnly: true },
  { value: '极端', min: 10_000, maxExclusive: Number.POSITIVE_INFINITY, positiveOnly: true },
  { value: '金额异常', invalid: 'non-positive' }
];

export const FOLLOW_UP_BANDS: BandDefinition[] = [
  { value: '0-7天', min: 0, maxExclusive: 8 },
  { value: '8-15天', min: 8, maxExclusive: 16 },
  { value: '16-30天', min: 16, maxExclusive: 31 },
  { value: '31-60天', min: 31, maxExclusive: 61 },
  { value: '61天以上', min: 61, maxExclusive: Number.POSITIVE_INFINITY },
  { value: '未填写或异常', invalid: 'missing' }
];

export const RESERVE_CYCLE_BANDS: BandDefinition[] = [
  { value: '0-90天', min: 0, maxExclusive: 91 },
  { value: '91-180天', min: 91, maxExclusive: 181 },
  { value: '181-365天', min: 181, maxExclusive: 366 },
  { value: '超过365天', min: 366, maxExclusive: Number.POSITIVE_INFINITY },
  { value: '未填写或异常', invalid: 'missing' }
];

export interface FilterOptions {
  customerNames: CountedOption[];
  departments: CountedOption[];
  salesManagers: CountedOption[];
  statuses: CountedOption<ProjectStatus>[];
  probabilityBands: CountedOption<ProbabilityBand>[];
  amountBands: CountedOption[];
  followUpBands: CountedOption[];
  reserveCycleBands: CountedOption[];
  categories: CountedOption<FindingCategory>[];
  labels: CountedOption[];
  reviewStatuses: CountedOption<ReviewStatus>[];
  industries: CountedOption[];
  regions: CountedOption[];
  projectTypes: CountedOption[];
  projectLevels: CountedOption[];
  customFields: Record<string, string[]>;
}

const normalize = (value: unknown) => String(value ?? '').toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
const display = (value: unknown) => String(value ?? '').trim() || '未填写';

function analysisDate(analysis: AnalysisResult) {
  const value = new Date(analysis.generatedAt);
  return Number.isNaN(value.getTime()) ? new Date() : new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function strictDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function matchesSelection<T extends string>(selected: T[], value: T) {
  return selected.length === 0 || selected.includes(value);
}

function matchesBands(selected: string[], value: number | null, definitions: BandDefinition[]) {
  if (selected.length === 0) return true;
  return selected.some((selectedBand) => {
    const band = definitions.find((item) => item.value === selectedBand);
    if (!band) return false;
    if (band.invalid === 'non-positive') return value === null || !Number.isFinite(value) || value <= 0;
    if (band.invalid === 'missing') return value === null || !Number.isFinite(value);
    return value !== null && Number.isFinite(value)
      && (!band.positiveOnly || value > 0)
      && value >= (band.min ?? Number.NEGATIVE_INFINITY)
      && value < (band.maxExclusive ?? Number.POSITIVE_INFINITY);
  });
}

function ageInDays(value: string | null, today: Date) {
  const date = strictDate(value);
  if (!date) return null;
  const age = daysBetween(date, today);
  return age >= 0 ? age : null;
}

function actionableReviewStatus(actionableRowKeys: Set<string>, reviews: ReviewRecordMap, rowKey: string): ReviewStatus | null {
  if (!actionableRowKeys.has(rowKey)) return null;
  const explicit = reviews[rowKey]?.status;
  if (explicit) return explicit;
  return '待复核';
}

function textMatches(row: ProjectRow, query: string) {
  const needle = normalize(query);
  if (!needle) return true;
  const values = [
    row.projectId, row.projectName, row.customerName,
    row.department, row.salesManager, row.industry, row.region, row.projectType, row.projectLevel,
    ...Object.keys(row.customFields), ...Object.values(row.customFields)
  ];
  return values.some((value) => normalize(value).includes(needle));
}

function customMatches(row: ProjectRow, selections: Record<string, string[]>) {
  return Object.entries(selections).every(([field, selected]) =>
    selected.length === 0 || selected.includes(display(row.customFields[field]))
  );
}

export function filterProjectKeys(
  analysis: AnalysisResult,
  reviews: ReviewRecordMap,
  filters: FilterState
): Set<string> {
  const today = analysisDate(analysis);
  const findingsByRow = new Map<string, typeof analysis.findings>();
  const actionableRowKeys = new Set(manualReviewKeys(analysis.findings));
  for (const finding of analysis.findings) {
    const list = findingsByRow.get(finding.rowKey) ?? [];
    list.push(finding);
    findingsByRow.set(finding.rowKey, list);
  }

  return new Set(analysis.rows.filter((row) => {
    const key = projectKey(row);
    const findings = findingsByRow.get(key) ?? [];
    const amountWan = amountInWan(row);
    const followUpAge = ageInDays(row.lastFollowUpAt, today);
    const reserveAge = ageInDays(row.createdAt, today);
    const reviewStatus = actionableReviewStatus(actionableRowKeys, reviews, key);
    return matchesSelection(filters.departments, display(row.department))
      && matchesSelection(filters.customerNames, display(row.customerName))
      && matchesSelection(filters.salesManagers, display(row.salesManager))
      && matchesSelection(filters.statuses, row.status)
      && matchesSelection(filters.probabilityBands, row.probabilityBand)
      && matchesSelection(filters.industries, display(row.industry))
      && matchesSelection(filters.regions, display(row.region))
      && matchesSelection(filters.projectTypes, display(row.projectType))
      && matchesSelection(filters.projectLevels, display(row.projectLevel))
      && matchesBands(filters.amountBands, amountWan, AMOUNT_BANDS)
      && (filters.amountMinWan === null || (amountWan !== null && amountWan >= filters.amountMinWan))
      && (filters.amountMaxWan === null || (amountWan !== null && amountWan <= filters.amountMaxWan))
      && matchesBands(filters.followUpBands, followUpAge, FOLLOW_UP_BANDS)
      && matchesBands(filters.reserveCycleBands, reserveAge, RESERVE_CYCLE_BANDS)
      && (filters.categories.length === 0 || findings.some((finding) => filters.categories.includes(finding.category)))
      && (filters.labels.length === 0 || findings.some((finding) => filters.labels.includes(finding.label)))
      && (filters.reviewStatuses.length === 0 || (reviewStatus !== null && filters.reviewStatuses.includes(reviewStatus)))
      && customMatches(row, filters.customValues)
      && textMatches(row, filters.query);
  }).map(projectKey));
}

function countValues<T extends string>(values: T[]): CountedOption<T>[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, 'zh-CN'));
}

function countBands(rows: ProjectRow[], values: BandDefinition[], getValue: (row: ProjectRow) => number | null): CountedOption[] {
  return values.map((band) => ({
    value: band.value,
    count: rows.filter((row) => matchesBands([band.value], getValue(row), values)).length
  })).filter((item) => item.count > 0);
}

function countFindings(analysis: AnalysisResult, field: 'category' | 'label') {
  const keys = new Map<string, Set<string>>();
  for (const finding of analysis.findings) {
    const value = finding[field];
    const rows = keys.get(value) ?? new Set<string>();
    rows.add(finding.rowKey);
    keys.set(value, rows);
  }
  return [...keys].map(([value, rows]) => ({ value, count: rows.size }));
}

export function buildFilterOptions(analysis: AnalysisResult, filters: FilterState, reviews: ReviewRecordMap = {}): FilterOptions {
  const today = analysisDate(analysis);
  const sellerRows = filters.departments.length === 0
    ? analysis.rows
    : analysis.rows.filter((row) => filters.departments.includes(display(row.department)));
  const customValues = new Map<string, Set<string>>();
  for (const row of analysis.rows) {
    for (const [field, value] of Object.entries(row.customFields)) {
      const values = customValues.get(field) ?? new Set<string>();
      values.add(display(value));
      customValues.set(field, values);
    }
  }
  const customFields = Object.create(null) as Record<string, string[]>;
  for (const [field, values] of customValues) {
    if (values.size <= 20) customFields[field] = [...values].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }
  const categoryCounts = new Map(countFindings(analysis, 'category').map((item) => [item.value, item.count]));
  const actionableRowKeys = new Set(manualReviewKeys(analysis.findings));
  const reviewValues = analysis.rows.flatMap((row) => {
    const status = actionableReviewStatus(actionableRowKeys, reviews, projectKey(row));
    return status ? [status] : [];
  });
  const customerNames = countValues(analysis.rows.map((row) => display(row.customerName)));
  return {
    customerNames: customerNames.length <= 20 ? customerNames : [],
    departments: countValues(analysis.rows.map((row) => display(row.department))),
    salesManagers: countValues(sellerRows.map((row) => display(row.salesManager))),
    statuses: countValues(analysis.rows.map((row) => row.status)),
    probabilityBands: countValues(analysis.rows.map((row) => row.probabilityBand)),
    amountBands: countBands(analysis.rows, AMOUNT_BANDS, amountInWan),
    followUpBands: countBands(analysis.rows, FOLLOW_UP_BANDS, (row) => ageInDays(row.lastFollowUpAt, today)),
    reserveCycleBands: countBands(analysis.rows, RESERVE_CYCLE_BANDS, (row) => ageInDays(row.createdAt, today)),
    categories: FINDING_CATEGORIES.map((value) => ({ value, count: categoryCounts.get(value) ?? 0 })),
    labels: countFindings(analysis, 'label').sort((left, right) => left.value.localeCompare(right.value, 'zh-CN')),
    reviewStatuses: REVIEW_STATUSES.map((value) => ({ value, count: reviewValues.filter((status) => status === value).length })),
    industries: countValues(analysis.rows.map((row) => display(row.industry))),
    regions: countValues(analysis.rows.map((row) => display(row.region))),
    projectTypes: countValues(analysis.rows.map((row) => display(row.projectType))),
    projectLevels: countValues(analysis.rows.map((row) => display(row.projectLevel))),
    customFields
  };
}

const describeMany = (prefix: string, values: readonly string[]) => values.map((value) => `${prefix}：${value}`);
const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export function describeFilters(filters: FilterState): string[] {
  return [
    ...(filters.query.trim() ? [`关键词：${filters.query.trim()}`] : []),
    ...describeMany('客户名称', filters.customerNames),
    ...describeMany('部门', filters.departments),
    ...describeMany('销售经理', filters.salesManagers),
    ...describeMany('项目状态', filters.statuses),
    ...describeMany('成单概率', filters.probabilityBands),
    ...describeMany('金额等级', filters.amountBands),
    ...(filters.amountMinWan === null ? [] : [`金额下限：${formatAmount(filters.amountMinWan)}万元`]),
    ...(filters.amountMaxWan === null ? [] : [`金额上限：${formatAmount(filters.amountMaxWan)}万元`]),
    ...describeMany('跟进周期', filters.followUpBands),
    ...describeMany('储备周期', filters.reserveCycleBands),
    ...describeMany('结果分类', filters.categories),
    ...describeMany('标签', filters.labels),
    ...describeMany('审查状态', filters.reviewStatuses),
    ...describeMany('行业', filters.industries),
    ...describeMany('区域', filters.regions),
    ...describeMany('项目类型', filters.projectTypes),
    ...describeMany('项目等级', filters.projectLevels),
    ...Object.entries(filters.customValues).flatMap(([field, values]) => describeMany(field, values))
  ];
}
