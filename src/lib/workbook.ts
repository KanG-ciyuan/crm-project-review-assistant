import * as XLSX from 'xlsx';
import type { CustomFieldValue, ProjectRow, ProjectStatus } from '../domain/project';

export const REQUIRED_HEADERS = ['项目编号', '项目名称', '部门', '销售经理', '项目状态', '储备金额', '金额单位', '创建日期', '最近拜访日期', '预计签约日期', '成单概率'] as const;
const CRM_HEADERS = ['部门', '销售经理', '创建日期', '最近拜访时间', '拜访间隔周期（天）', '项目名称', '项目编码', '项目状态', '成单概率', '储备金额（万元）', '预计合同签订时间'] as const;
export type InputProfile = 'standard' | 'crm-history';

const OPTIONAL_HEADERS = ['行业', '区域/省份', '项目类型', '项目等级'] as const;

export interface HeaderValidation {
  valid: boolean;
  missing: string[];
}

export interface WorkbookInspection {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

export interface RawSheetInspection {
  sheetName: string;
  matrix: unknown[][];
  candidateHeaderRows: number[];
}

export interface SheetParseResult {
  profile: InputProfile | null;
  headerRowIndex: number;
  headers: string[];
  validation: HeaderValidation;
  preview: Array<Record<string, unknown>>;
  rows: ProjectRow[];
}

const isPresent = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';

export function validateHeaders(headers: string[]): HeaderValidation {
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  return { valid: missing.length === 0, missing: [...missing] };
}
const profileFor = (headers: string[]): InputProfile | null => REQUIRED_HEADERS.every((value) => headers.includes(value)) ? 'standard' : CRM_HEADERS.every((value) => headers.includes(value)) ? 'crm-history' : null;

export function findHeaderRow(matrix: unknown[][]): number {
  return matrix.findIndex((row) => profileFor(row.map((cell) => String(cell ?? '').trim())) !== null);
}

const toDateString = (value: unknown): string | null => {
  if (!isPresent(value)) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : null;
  }
  const normalized = String(value).replaceAll('/', '-');
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : normalized.slice(0, 10);
};

const toAmount = (value: unknown): number | null => {
  if (!isPresent(value)) return null;
  const amount = Number(String(value).replaceAll(',', '').trim());
  return Number.isFinite(amount) ? amount : null;
};

const toProbabilityBand = (value: unknown): ProjectRow['probabilityBand'] => {
  if (!isPresent(value)) return '未知';
  const probability = Number(String(value).replace('%', '').trim());
  if (!Number.isFinite(probability)) return '未知';
  const percent = probability > 0 && probability <= 1 ? probability * 100 : probability;
  if (percent <= 50) return '低概率';
  if (percent <= 70) return '中等概率';
  if (percent <= 80) return '较高概率';
  return percent <= 100 ? '临近签约' : '未知';
};

const toText = (value: unknown): string => isPresent(value) ? String(value).trim() : '';
const crmText = (value: unknown) => { const text = toText(value); return text === '无' ? '' : text; };
const PROBABILITY_BANDS: Record<string, NonNullable<ProjectRow['probabilityBand']>> = { '询价类': '询价类', '1%-50%': '低概率', '51%-70%': '中等概率', '71%-80%': '较高概率', '81%-100%': '临近签约' };
const band = (value: string): ProjectRow['probabilityBand'] => PROBABILITY_BANDS[value] ?? '未知';

const pick = (source: Record<string, unknown>, header: string) => source[header];

export async function inspectWorkbook(file: File): Promise<WorkbookInspection> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('请选择 .xlsx 格式的标准 Excel 文件');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  if (workbook.SheetNames.length === 0) throw new Error('该文件不包含可读取的工作表');
  return { workbook, sheetNames: workbook.SheetNames };
}

export function inspectSheet(workbook: XLSX.WorkBook, sheetName: string): RawSheetInspection {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('未找到所选工作表');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true
  });
  const firstTenNonEmptyRows = matrix
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some(isPresent))
    .slice(0, 10);
  const candidateHeaderRows = firstTenNonEmptyRows
    .filter(({ row }) => row.filter(isPresent).length >= 2)
    .map(({ index }) => index);

  return { sheetName, matrix, candidateHeaderRows };
}

function uniqueHeaders(row: unknown[]): string[] {
  const usedHeaders = new Set<string>();
  const nextSuffixes = new Map<string, number>();
  return row.map((cell, index) => {
    const base = String(cell ?? '').trim() || `未命名列${index + 1}`;
    let header = base;
    let suffix = nextSuffixes.get(base) ?? 2;
    while (usedHeaders.has(header)) {
      header = `${base} (${suffix})`;
      suffix += 1;
    }
    nextSuffixes.set(base, suffix);
    usedHeaders.add(header);
    return header;
  });
}

export function readSheetRecords(
  matrix: unknown[][],
  headerRowIndex: number
): Array<Record<string, unknown>> {
  if (!Number.isInteger(headerRowIndex) || headerRowIndex < 0 || headerRowIndex >= matrix.length) {
    throw new Error('请选择有效的表头行');
  }

  const headers = uniqueHeaders(matrix[headerRowIndex]);
  return matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some(isPresent))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}

export function parseSelectedSheet(workbook: XLSX.WorkBook, sheetName: string): SheetParseResult {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('未找到所选工作表');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });
  const headerRowIndex = findHeaderRow(matrix);
  if (headerRowIndex < 0) return { profile: null, headerRowIndex, headers: [], validation: { valid: false, missing: [...REQUIRED_HEADERS] }, preview: [], rows: [] };

  const headers = matrix[headerRowIndex].map((cell) => String(cell ?? '').trim());
  const profile = profileFor(headers);
  const validation = profile ? { valid: true, missing: [] } : validateHeaders(headers);
  const dataRows = matrix.slice(headerRowIndex + 1).filter((row) => row.some(isPresent));
  const objects = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const rows = objects.map<ProjectRow>((source, index) => profile === 'crm-history' ? ({
    sourceKey: `crm-history:${index + 1}`, projectId: crmText(pick(source, '项目编码')), projectName: crmText(pick(source, '项目名称')),
    customerName: crmText(pick(source, '客户名称')),
    department: crmText(pick(source, '部门')), salesManager: crmText(pick(source, '销售经理')), status: crmText(pick(source, '项目状态')) as ProjectStatus,
    amount: toAmount(pick(source, '储备金额（万元）')),
    amountParseError: isPresent(pick(source, '储备金额（万元）')) && toAmount(pick(source, '储备金额（万元）')) === null,
    unit: '万元', createdAt: toDateString(pick(source, '创建日期')),
    lastFollowUpAt: toDateString(pick(source, '最近拜访时间')),
    expectedSignAt: toDateString(pick(source, '预计合同签订时间')),
    probabilityBand: band(crmText(pick(source, '成单概率'))), industry: crmText(pick(source, '行业')),
    region: crmText(pick(source, '区域')), projectType: crmText(pick(source, '项目类型')), projectLevel: crmText(pick(source, '项目等级')),
    latestUpdatedAt: null,
    customFields: {
      '拜访间隔周期（天）': toAmount(pick(source, '拜访间隔周期（天）'))
    } as Record<string, CustomFieldValue>
  }) : ({
    sourceKey: `standard:${index + 1}`,
    projectId: toText(pick(source, '项目编号')),
    projectName: toText(pick(source, '项目名称')),
    customerName: toText(pick(source, '客户名称')),
    department: toText(pick(source, '部门')),
    salesManager: toText(pick(source, '销售经理')),
    status: toText(pick(source, '项目状态')) as ProjectStatus,
    amount: toAmount(pick(source, '储备金额')),
    amountParseError: isPresent(pick(source, '储备金额')) && toAmount(pick(source, '储备金额')) === null,
    unit: toText(pick(source, '金额单位')),
    createdAt: toDateString(pick(source, '创建日期')),
    lastFollowUpAt: toDateString(pick(source, '最近拜访日期')),
    expectedSignAt: toDateString(pick(source, '预计签约日期')),
    probabilityBand: toProbabilityBand(pick(source, '成单概率')),
    industry: toText(pick(source, '行业')),
    region: toText(pick(source, '区域/省份')),
    projectType: toText(pick(source, '项目类型')),
    projectLevel: toText(pick(source, '项目等级')),
    latestUpdatedAt: null,
    customFields: {} as Record<string, CustomFieldValue>
  }));

  return { profile, headerRowIndex, headers, validation, preview: objects.slice(0, 5), rows };
}

export const optionalHeaders = OPTIONAL_HEADERS;
