import { emptyValueMappings, parseProbability, suggestMappings, type ColumnMapping, type ValueMappings } from './mapping';
import type { CanonicalFieldKey, ProbabilityBand, ProjectStatus } from './project';
import { readSheetRecords, type RawSheetInspection } from '../lib/workbook';

export type ImportConfirmation =
  | { kind: 'status'; source: string }
  | { kind: 'probability'; source: string }
  | { kind: 'amount-unit' };

export interface ImportDiagnosis {
  state: 'ready' | 'needs-confirmation' | 'blocked';
  headerRowIndex: number;
  records: Array<Record<string, unknown>>;
  mappings: ColumnMapping[];
  valueMappings: ValueMappings;
  confirmations: ImportConfirmation[];
  blockingMessages: string[];
  summary: { standardFields: number; customFields: number; ignoredFields: number; rowCount: number };
}

const present = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';
const text = (value: unknown) => present(value) ? String(value).trim() : '';
const distinct = (records: Array<Record<string, unknown>>, header?: string) =>
  header ? [...new Set(records.map((record) => text(record[header])).filter(Boolean))] : [];

const statusValue = (source: string): ProjectStatus | null => {
  const aliases: Record<string, ProjectStatus> = {
    跟进中: '跟进中', 推进中: '跟进中', 进行中: '跟进中',
    呆滞: '呆滞', 暂缓: '呆滞',
    已签约: '已签约', 赢单: '已签约',
    已丢单: '已丢单', 丢单: '已丢单', 输单: '已丢单'
  };
  return aliases[source] ?? null;
};

const unitValue = (source: string): '' | '元' | '万元' | '亿元' => {
  const value = source.replaceAll('人民币', '').trim();
  if (value === '元') return '元';
  if (value === '万' || value === '万元') return '万元';
  if (value === '亿' || value === '亿元') return '亿元';
  return '';
};

function bestHeaderRow(inspection: RawSheetInspection) {
  const candidates = inspection.candidateHeaderRows.length
    ? inspection.candidateHeaderRows
    : inspection.matrix.map((_, index) => index);
  return candidates
    .map((index) => ({
      index,
      score: suggestMappings(inspection.matrix[index].map(text))
        .filter((mapping) => mapping.mode === 'standard').length
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.index ?? 0;
}

export function diagnoseImport(inspection: RawSheetInspection, mappingOverrides?: ColumnMapping[]): ImportDiagnosis {
  const headerRowIndex = bestHeaderRow(inspection);
  const records = readSheetRecords(inspection.matrix, headerRowIndex);
  const headers = records[0]
    ? Object.keys(records[0])
    : inspection.matrix[headerRowIndex]?.map((value, index) => text(value) || `未命名列${index + 1}`) ?? [];
  const mappings = mappingOverrides ?? suggestMappings(headers);
  const values: ValueMappings = { ...emptyValueMappings, statuses: {}, probabilities: {} };
  const confirmations: ImportConfirmation[] = [];
  const blockingMessages: string[] = [];

  const targetCounts = new Map<CanonicalFieldKey, number>();
  for (const mapping of mappings) {
    if (mapping.mode === 'standard' && mapping.targetField) {
      targetCounts.set(mapping.targetField, (targetCounts.get(mapping.targetField) ?? 0) + 1);
    }
  }
  for (const [field, count] of targetCounts) {
    if (count > 1) blockingMessages.push(`${field} 被多个源字段重复对应`);
  }

  const mappedHeader = (field: CanonicalFieldKey) => mappings
    .find((mapping) => mapping.mode === 'standard' && mapping.targetField === field)?.sourceHeader;

  for (const source of distinct(records, mappedHeader('status'))) {
    const status = statusValue(source);
    if (status) values.statuses[source] = status;
    else confirmations.push({ kind: 'status', source });
  }

  for (const source of distinct(records, mappedHeader('probabilityBand'))) {
    const probability = parseProbability(source);
    if (probability !== '未知') values.probabilities[source] = probability;
    else confirmations.push({ kind: 'probability', source });
  }

  const amountHeader = mappedHeader('amount');
  const unitHeader = mappedHeader('unit');
  if (amountHeader) {
    const sourceUnits = distinct(records, unitHeader);
    const recognizedUnits = [...new Set(sourceUnits.map(unitValue).filter(Boolean))];
    if (recognizedUnits.length > 1) {
      blockingMessages.push(`检测到多个金额单位：${recognizedUnits.join('、')}`);
    } else if (recognizedUnits.length === 1) {
      values.amountUnit = recognizedUnits[0];
    } else if (/亿元|\(亿\)|（亿）/.test(amountHeader)) {
      values.amountUnit = '亿元';
    } else if (/万元|\(万\)|（万）/.test(amountHeader)) {
      values.amountUnit = '万元';
    } else if (/\(元\)|（元）/.test(amountHeader)) {
      values.amountUnit = '元';
    } else {
      confirmations.push({ kind: 'amount-unit' });
    }
  }

  return {
    state: blockingMessages.length ? 'blocked' : confirmations.length ? 'needs-confirmation' : 'ready',
    headerRowIndex,
    records,
    mappings,
    valueMappings: values,
    confirmations,
    blockingMessages,
    summary: {
      standardFields: mappings.filter((mapping) => mapping.mode === 'standard').length,
      customFields: mappings.filter((mapping) => mapping.mode === 'custom').length,
      ignoredFields: mappings.filter((mapping) => mapping.mode === 'ignore').length,
      rowCount: records.length
    }
  };
}

export const probabilityFromConfirmation = (source: string): ProbabilityBand => parseProbability(source);
