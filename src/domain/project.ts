export type ProjectStatus = '跟进中' | '呆滞' | '已签约' | '已丢单' | '未知';
export type ProbabilityBand = '询价类' | '未知' | `${number}%` | `${number}%-${number}%`;

export type CanonicalFieldKey =
  | 'projectId' | 'projectName' | 'customerName' | 'department' | 'salesManager'
  | 'status' | 'amount' | 'unit' | 'createdAt' | 'lastFollowUpAt'
  | 'expectedSignAt' | 'probabilityBand' | 'industry' | 'region'
  | 'projectType' | 'projectLevel' | 'latestUpdatedAt';

export type CustomFieldValue = string | number | null;

export interface ProjectRow {
  sourceKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  department: string;
  salesManager: string;
  status: ProjectStatus;
  amount: number | null;
  amountParseError: boolean;
  unit: '元' | '万元' | '亿元' | string;
  createdAt: string | null;
  createdAtParseError: boolean;
  lastFollowUpAt: string | null;
  lastFollowUpAtParseError: boolean;
  expectedSignAt: string | null;
  expectedSignAtParseError: boolean;
  probabilityBand: ProbabilityBand;
  industry: string;
  region: string;
  projectType: string;
  projectLevel: string;
  latestUpdatedAt: string | null;
  customFields: Record<string, CustomFieldValue>;
}

export const projectKey = (row: ProjectRow) =>
  row.sourceKey || row.projectId || `${row.customerName}|${row.projectName}|${row.salesManager}`;

export const probabilityRange = (value: ProbabilityBand): { min: number; max: number } | null => {
  const exact = value.match(/^(\d+(?:\.\d+)?)%$/);
  if (exact) {
    const percent = Number(exact[1]);
    return Number.isFinite(percent) && percent >= 0 && percent <= 100
      ? { min: percent, max: percent }
      : null;
  }
  const range = value.match(/^(\d+(?:\.\d+)?)%-(\d+(?:\.\d+)?)%$/);
  if (!range) return null;
  const min = Number(range[1]);
  const max = Number(range[2]);
  return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && min <= max && max <= 100
    ? { min, max }
    : null;
};

export const probabilityPercent = (value: ProbabilityBand): number | null =>
  probabilityRange(value)?.min ?? null;

export function amountInWan(row: Pick<ProjectRow, 'amount' | 'unit'>): number | null {
  if (row.amount === null || !Number.isFinite(row.amount)) return null;
  if (row.unit === '元') return row.amount / 10_000;
  if (row.unit === '亿元') return row.amount * 10_000;
  if (row.unit === '万元') return row.amount;
  return null;
}

export function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const calendarDayNumber = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

export const daysBetween = (earlier: Date, later: Date) =>
  Math.floor((calendarDayNumber(later) - calendarDayNumber(earlier)) / 86_400_000);
