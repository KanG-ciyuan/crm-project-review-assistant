import * as XLSX from 'xlsx';
import type { ProjectRow, ProjectStatus } from '../domain/analyze';

export const REQUIRED_HEADERS = ['项目编号', '项目名称', '部门', '销售经理', '项目状态', '储备金额', '金额单位', '创建日期', '最近拜访日期', '预计签约日期', '成单概率'] as const;

const OPTIONAL_HEADERS = ['行业', '区域/省份', '项目类型', '项目等级'] as const;

export interface HeaderValidation {
  valid: boolean;
  missing: string[];
}

export interface WorkbookInspection {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

export interface SheetParseResult {
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

export function findHeaderRow(matrix: unknown[][]): number {
  return matrix.findIndex((row) => validateHeaders(row.map((cell) => String(cell ?? '').trim())).valid);
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

const toProbability = (value: unknown): number | null => {
  if (!isPresent(value)) return null;
  const probability = Number(String(value).replace('%', '').trim());
  return Number.isFinite(probability) ? probability : null;
};

const toText = (value: unknown): string => isPresent(value) ? String(value).trim() : '';

const pick = (source: Record<string, unknown>, header: string) => source[header];

export async function inspectWorkbook(file: File): Promise<WorkbookInspection> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('请选择 .xlsx 格式的标准 Excel 文件');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  if (workbook.SheetNames.length === 0) throw new Error('该文件不包含可读取的工作表');
  return { workbook, sheetNames: workbook.SheetNames };
}

export function parseSelectedSheet(workbook: XLSX.WorkBook, sheetName: string): SheetParseResult {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('未找到所选工作表');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });
  const headerRowIndex = findHeaderRow(matrix);
  if (headerRowIndex < 0) return { headerRowIndex, headers: [], validation: { valid: false, missing: [...REQUIRED_HEADERS] }, preview: [], rows: [] };

  const headers = matrix[headerRowIndex].map((cell) => String(cell ?? '').trim());
  const validation = validateHeaders(headers);
  const dataRows = matrix.slice(headerRowIndex + 1).filter((row) => row.some(isPresent));
  const objects = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const rows: ProjectRow[] = objects.map((source) => ({
    projectId: toText(pick(source, '项目编号')),
    projectName: toText(pick(source, '项目名称')),
    department: toText(pick(source, '部门')),
    salesManager: toText(pick(source, '销售经理')),
    status: toText(pick(source, '项目状态')) as ProjectStatus,
    amount: toAmount(pick(source, '储备金额')),
    unit: toText(pick(source, '金额单位')),
    createdAt: toDateString(pick(source, '创建日期')),
    lastVisitAt: toDateString(pick(source, '最近拜访日期')),
    expectedSignAt: toDateString(pick(source, '预计签约日期')),
    probability: toProbability(pick(source, '成单概率')),
    industry: toText(pick(source, '行业')) || null,
    region: toText(pick(source, '区域/省份')) || null,
    projectType: toText(pick(source, '项目类型')) || null,
    projectLevel: toText(pick(source, '项目等级')) || null
  }));

  return { headerRowIndex, headers, validation, preview: objects.slice(0, 5), rows };
}

export const optionalHeaders = OPTIONAL_HEADERS;
