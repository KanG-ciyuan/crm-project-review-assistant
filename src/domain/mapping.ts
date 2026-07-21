import * as XLSX from 'xlsx';
import type {
  CanonicalFieldKey,
  CustomFieldValue,
  ProbabilityBand,
  ProjectRow,
  ProjectStatus
} from './project';

export type ColumnMode = 'standard' | 'custom' | 'ignore';

export interface ColumnMapping {
  sourceHeader: string;
  mode: ColumnMode;
  targetField?: CanonicalFieldKey;
  customName?: string;
}

export interface ValueMappings {
  statuses: Record<string, ProjectStatus>;
  probabilities: Record<string, ProbabilityBand>;
  amountUnit: ProjectRow['unit'];
}

export interface MappingValidation {
  valid: boolean;
  duplicateTargets: CanonicalFieldKey[];
  duplicateCustomNames: string[];
  unmappedEnumValues: string[];
  invalidMappings: string[];
}

export const emptyValueMappings: ValueMappings = {
  statuses: {},
  probabilities: {},
  amountUnit: ''
};

const FIELD_ALIASES: Record<CanonicalFieldKey, readonly string[]> = {
  projectId: ['项目编号', '项目编码', '商机编号', '商机编码', '机会编号', 'project id', 'project code'],
  projectName: ['项目名称', '商机名称', '项目标题', '商机标题', '机会名称', 'project name', 'opportunity name'],
  customerName: ['客户', '客户名称', '客户单位', '客户/单位', '单位名称', '企业名称', 'customer', 'customer name'],
  department: ['部门', '所属部门', '业务部门', '销售部门', '组织', 'department'],
  salesManager: ['销售经理', '业务负责人', '销售负责人', '项目负责人', '商机负责人', '负责人', 'owner', 'sales owner'],
  status: ['项目状态', '商机状态', '机会状态', '状态', 'project status', 'opportunity status'],
  amount: ['储备金额', '储备金额(万元)', '储备金额（万元）', '商机金额', '项目金额', '预计金额', '合同金额', '报价金额', '金额', 'amount'],
  unit: ['金额单位', '金额量纲', 'amount unit'],
  createdAt: ['创建日期', '创建时间', '项目创建日期', '商机创建日期', '立项日期', 'created at', 'creation date'],
  lastFollowUpAt: ['最近跟进日期', '最近跟进时间', '最后跟进时间', '最后联系时间', '最近联系时间', '最近拜访日期', '最近拜访时间', 'last follow up', 'last contact time'],
  expectedSignAt: ['预计签约日期', '预计签订日期', '预计成交时间', '预计成交日期', '预计合同签订时间', '预计合同签订日期', 'expected close date', 'expected sign date'],
  probabilityBand: ['成单概率', '成交概率', '商机概率', '赢单概率', '概率', 'probability', 'win probability'],
  industry: ['行业', '所属行业', '客户行业', 'industry'],
  region: ['区域', '区域/省份', '省份', '地区', '销售区域', 'region'],
  projectType: ['项目类型', '商机类型', '业务类型', '机会类型', 'project type'],
  projectLevel: ['项目等级', '商机等级', '项目级别', '重要程度', 'project level'],
  latestUpdatedAt: ['最后更新时间', '最近更新时间', '数据更新时间', '更新日期', 'updated at', 'last updated at']
};

const fullWidthToHalfWidth = (value: string) => value
  .replace(/\u3000/g, ' ')
  .replace(/[\uFF01-\uFF5E]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0));

const normalizeAlias = (value: string) => fullWidthToHalfWidth(value.trim())
  .toLocaleLowerCase()
  .replace(/[\s\-_/\\.,，。:：;；()（）\[\]【】{}<>《》]+/g, '');

const aliasToField = new Map<string, CanonicalFieldKey>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[CanonicalFieldKey, readonly string[]]>) {
  for (const alias of aliases) aliasToField.set(normalizeAlias(alias), field);
}

export function suggestMappings(headers: string[]): ColumnMapping[] {
  return headers.map((rawHeader) => {
    const sourceHeader = rawHeader.trim();
    const targetField = aliasToField.get(normalizeAlias(sourceHeader));
    return targetField
      ? { sourceHeader, mode: 'standard', targetField }
      : { sourceHeader, mode: 'custom', customName: sourceHeader };
  });
}

const validStatuses = new Set<ProjectStatus>(['跟进中', '呆滞', '已签约', '已丢单', '未知']);
const validProbabilities = new Set<ProbabilityBand>(['询价类', '低概率', '中等概率', '较高概率', '临近签约', '未知']);
const validUnits = new Set(['元', '万元', '亿元']);

export function validateMappings(mappings: ColumnMapping[], values: ValueMappings): MappingValidation {
  const targetCounts = new Map<CanonicalFieldKey, number>();
  const customNameCounts = new Map<string, number>();
  const invalidMappings: string[] = [];

  for (const mapping of mappings) {
    if (mapping.mode === 'standard') {
      if (!mapping.targetField) {
        invalidMappings.push(`${mapping.sourceHeader}未选择标准字段`);
      } else {
        targetCounts.set(mapping.targetField, (targetCounts.get(mapping.targetField) ?? 0) + 1);
      }
    }
    if (mapping.mode === 'custom') {
      const customName = mapping.customName?.trim() ?? '';
      if (!customName) {
        invalidMappings.push(`${mapping.sourceHeader}缺少自定义字段名称`);
      } else {
        customNameCounts.set(customName, (customNameCounts.get(customName) ?? 0) + 1);
      }
    }
  }

  const duplicateTargets = [...targetCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([field]) => field);
  const duplicateCustomNames = [...customNameCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  const unmappedEnumValues: string[] = [];
  const mapsAmount = targetCounts.has('amount');
  const mapsUnitColumn = targetCounts.has('unit');
  if (mapsAmount && !mapsUnitColumn && !validUnits.has(values.amountUnit)) {
    unmappedEnumValues.push('金额单位');
  }
  for (const [source, status] of Object.entries(values.statuses)) {
    if (!source.trim() || !validStatuses.has(status)) unmappedEnumValues.push(source || '空状态值');
  }
  for (const [source, probability] of Object.entries(values.probabilities)) {
    if (!source.trim() || !validProbabilities.has(probability)) unmappedEnumValues.push(source || '空概率值');
  }

  return {
    valid: duplicateTargets.length === 0 && duplicateCustomNames.length === 0 && unmappedEnumValues.length === 0 && invalidMappings.length === 0,
    duplicateTargets,
    duplicateCustomNames,
    unmappedEnumValues,
    invalidMappings
  };
}

const isPresent = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';
const toText = (value: unknown) => isPresent(value) ? String(value).trim() : '';

const toAmount = (value: unknown): number | null => {
  if (!isPresent(value)) return null;
  const amount = Number(fullWidthToHalfWidth(String(value)).replaceAll(',', '').trim());
  return Number.isFinite(amount) ? amount : null;
};

const isoDate = (year: number, month: number, day: number): string | null => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const toDateString = (value: unknown): string | null => {
  if (!isPresent(value)) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? isoDate(parsed.y, parsed.m, parsed.d) : null;
  }
  const match = fullWidthToHalfWidth(String(value).trim()).match(/^(\d{4})[\-/\.](\d{1,2})[\-/\.](\d{1,2})(?:\s.*)?$/);
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
};

const mappedValue = <T>(source: string, mappings: Record<string, T>): T | undefined => {
  const direct = mappings[source];
  if (direct !== undefined) return direct;
  const normalizedSource = source.trim();
  const entry = Object.entries(mappings).find(([key]) => key.trim() === normalizedSource);
  return entry?.[1];
};

const toStatus = (value: unknown, values: ValueMappings): ProjectStatus => {
  const source = toText(value);
  const mapped = mappedValue(source, values.statuses);
  if (mapped) return mapped;
  return validStatuses.has(source as ProjectStatus) ? source as ProjectStatus : '未知';
};

const toProbability = (value: unknown, values: ValueMappings): ProbabilityBand => {
  const source = toText(value);
  if (!source) return '未知';
  const mapped = mappedValue(source, values.probabilities);
  if (mapped) return mapped;
  if (validProbabilities.has(source as ProbabilityBand)) return source as ProbabilityBand;
  if (source === '1%-50%' || source === '1-50%') return '低概率';
  if (source === '51%-70%' || source === '51-70%') return '中等概率';
  if (source === '71%-80%' || source === '71-80%') return '较高概率';
  if (source === '81%-100%' || source === '81-100%') return '临近签约';
  const numeric = Number(source.replace('%', ''));
  if (!Number.isFinite(numeric) || numeric < 0) return '未知';
  const percent = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  if (percent <= 50) return '低概率';
  if (percent <= 70) return '中等概率';
  if (percent <= 80) return '较高概率';
  if (percent <= 100) return '临近签约';
  return '未知';
};

const toUnit = (value: unknown): ProjectRow['unit'] => {
  const normalized = normalizeAlias(toText(value));
  if (normalized === '元' || normalized === '人民币元') return '元';
  if (normalized === '万' || normalized === '万元' || normalized === '人民币万元') return '万元';
  if (normalized === '亿' || normalized === '亿元' || normalized === '人民币亿元') return '亿元';
  return '';
};

const toCustomValue = (value: unknown): CustomFieldValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return toDateString(value);
  return String(value).trim();
};

const emptyProject = (): ProjectRow => ({
  sourceKey: '',
  projectId: '',
  projectName: '',
  customerName: '',
  department: '',
  salesManager: '',
  status: '未知',
  amount: null,
  unit: '',
  createdAt: null,
  lastFollowUpAt: null,
  expectedSignAt: null,
  probabilityBand: '未知',
  industry: '',
  region: '',
  projectType: '',
  projectLevel: '',
  latestUpdatedAt: null,
  customFields: {}
});

function assignStandardField(
  row: ProjectRow,
  field: CanonicalFieldKey,
  value: unknown,
  values: ValueMappings
) {
  switch (field) {
    case 'amount': row.amount = toAmount(value); break;
    case 'status': row.status = toStatus(value, values); break;
    case 'probabilityBand': row.probabilityBand = toProbability(value, values); break;
    case 'unit': row.unit = toUnit(value); break;
    case 'createdAt':
    case 'lastFollowUpAt':
    case 'expectedSignAt':
    case 'latestUpdatedAt': row[field] = toDateString(value); break;
    default: row[field] = toText(value); break;
  }
}

const sourceNamespace = (sheetName: string) => encodeURIComponent(fullWidthToHalfWidth(sheetName).trim() || 'sheet');
const sourceIdentity = (projectId: string) => encodeURIComponent(fullWidthToHalfWidth(projectId).trim().toLocaleLowerCase());

/**
 * A sheet is the source namespace. Unique project IDs remain stable across row
 * moves and re-imports; missing or duplicated IDs receive a row suffix so no
 * source record can overwrite another record in review state.
 */
export function applyMappings(
  records: Array<Record<string, unknown>>,
  mappings: ColumnMapping[],
  values: ValueMappings,
  sheetName: string
): ProjectRow[] {
  const mapsUnitColumn = mappings.some((mapping) => mapping.mode === 'standard' && mapping.targetField === 'unit');
  const rows = records.map((record) => {
    const row = emptyProject();
    for (const mapping of mappings) {
      const value = record[mapping.sourceHeader];
      if (mapping.mode === 'standard' && mapping.targetField) {
        assignStandardField(row, mapping.targetField, value, values);
      } else if (mapping.mode === 'custom' && mapping.customName?.trim()) {
        row.customFields[mapping.customName.trim()] = toCustomValue(value);
      }
    }
    if (!row.unit && !mapsUnitColumn) row.unit = toUnit(values.amountUnit);
    return row;
  });

  const idCounts = new Map<string, number>();
  for (const row of rows) {
    const identity = sourceIdentity(row.projectId);
    if (identity) idCounts.set(identity, (idCounts.get(identity) ?? 0) + 1);
  }
  const namespace = sourceNamespace(sheetName);
  rows.forEach((row, index) => {
    const identity = sourceIdentity(row.projectId);
    row.sourceKey = identity && idCounts.get(identity) === 1
      ? `sheet:${namespace}:id:${identity}`
      : `sheet:${namespace}:${identity ? `id:${identity}:` : ''}row:${index + 1}`;
  });
  return rows;
}
