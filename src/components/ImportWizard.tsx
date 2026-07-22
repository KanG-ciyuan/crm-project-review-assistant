import { useMemo, useState } from 'react';
import type { CanonicalFieldKey, ProbabilityBand, ProjectRow, ProjectStatus } from '../domain/project';
import {
  applyMappings,
  suggestMappings,
  validateMappings,
  type ColumnMapping,
  type ValueMappings
} from '../domain/mapping';
import { readSheetRecords, type RawSheetInspection } from '../lib/workbook';
import { getRuleCapabilities } from '../domain/rules';
import '../mapping.css';

export interface ImportReadyPayload {
  rows: ProjectRow[];
  mappings: ColumnMapping[];
  valueMappings: ValueMappings;
  source: { sheetName: string; headerRowIndex: number };
}

export interface RuleCapabilityPreview {
  ruleId: string;
  name?: string;
  available: boolean;
  missingFields: CanonicalFieldKey[];
}

export interface ImportWizardProps {
  inspection: RawSheetInspection;
  onReady: (payload: ImportReadyPayload) => void;
  capabilities?: RuleCapabilityPreview[];
  onConfigurationChange?: () => void;
}

const STANDARD_FIELDS: Array<{ value: CanonicalFieldKey; label: string }> = [
  ['projectId', '项目编号'], ['projectName', '项目名称'], ['customerName', '客户名称'],
  ['department', '部门'], ['salesManager', '销售经理'], ['status', '项目状态'],
  ['amount', '储备金额'], ['unit', '金额单位'], ['createdAt', '创建日期'],
  ['lastFollowUpAt', '最近跟进日期'], ['expectedSignAt', '预计签约日期'],
  ['probabilityBand', '成单概率'], ['industry', '行业'], ['region', '区域/省份'],
  ['projectType', '项目类型'], ['projectLevel', '项目等级'], ['latestUpdatedAt', '最后更新时间']
].map(([value, label]) => ({ value: value as CanonicalFieldKey, label }));

const FIELD_LABELS = Object.fromEntries(STANDARD_FIELDS.map(({ value, label }) => [value, label])) as Record<CanonicalFieldKey, string>;
const STATUSES: ProjectStatus[] = ['跟进中', '呆滞', '已签约', '已丢单', '未知'];
const PROBABILITIES: ProbabilityBand[] = ['询价类', '低概率', '中等概率', '较高概率', '临近签约', '未知'];
const UNITS: Array<'元' | '万元' | '亿元'> = ['元', '万元', '亿元'];

const presentText = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const distinctValues = (records: Array<Record<string, unknown>>, header?: string) => {
  if (!header) return [];
  return [...new Set(records.map((record) => presentText(record[header])).filter(Boolean))];
};

const suggestedStatus = (source: string): ProjectStatus | '' =>
  STATUSES.includes(source as ProjectStatus) ? source as ProjectStatus : '';

const suggestedProbability = (source: string): ProbabilityBand | '' => {
  if (PROBABILITIES.includes(source as ProbabilityBand)) return source as ProbabilityBand;
  if (source === '1%-50%' || source === '1-50%') return '低概率';
  if (source === '51%-70%' || source === '51-70%') return '中等概率';
  if (source === '71%-80%' || source === '71-80%') return '较高概率';
  if (source === '81%-100%' || source === '81-100%') return '临近签约';
  return '';
};

const suggestedUnit = (source: string): '' | '元' | '万元' | '亿元' => {
  const value = source.replaceAll('人民币', '').trim();
  if (value === '元') return '元';
  if (value === '万' || value === '万元') return '万元';
  if (value === '亿' || value === '亿元') return '亿元';
  return '';
};

export function ImportWizard({ inspection, onReady, capabilities, onConfigurationChange }: ImportWizardProps) {
  const defaultHeader = inspection.candidateHeaderRows[0] ?? 0;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [headerRowIndex, setHeaderRowIndex] = useState(defaultHeader);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus | ''>>({});
  const [probabilities, setProbabilities] = useState<Record<string, ProbabilityBand | ''>>({});
  const [amountUnit, setAmountUnit] = useState<ValueMappings['amountUnit']>('');
  const [message, setMessage] = useState('');

  const records = useMemo(
    () => readSheetRecords(inspection.matrix, headerRowIndex),
    [inspection.matrix, headerRowIndex]
  );
  const headers = useMemo(() => {
    if (records[0]) return Object.keys(records[0]);
    return inspection.matrix[headerRowIndex]?.map((value, index) => presentText(value) || `未命名列${index + 1}`) ?? [];
  }, [headerRowIndex, inspection.matrix, records]);
  const sourceValuesByHeader = useMemo(
    () => new Map(headers.map((header) => [header, distinctValues(records, header)])),
    [headers, records]
  );
  const statusHeader = mappings.find((mapping) => mapping.mode === 'standard' && mapping.targetField === 'status')?.sourceHeader;
  const probabilityHeader = mappings.find((mapping) => mapping.mode === 'standard' && mapping.targetField === 'probabilityBand')?.sourceHeader;
  const unitHeader = mappings.find((mapping) => mapping.mode === 'standard' && mapping.targetField === 'unit')?.sourceHeader;
  const mapsAmount = mappings.some((mapping) => mapping.mode === 'standard' && mapping.targetField === 'amount');
  const statusValues = statusHeader ? sourceValuesByHeader.get(statusHeader) ?? [] : [];
  const probabilityValues = probabilityHeader ? sourceValuesByHeader.get(probabilityHeader) ?? [] : [];
  const unitValues = unitHeader ? sourceValuesByHeader.get(unitHeader) ?? [] : [];
  const hasMixedUnits = unitValues.length > 1;

  function confirmHeader() {
    const next = suggestMappings(headers);
    setMappings(next);
    setMessage('');
    setStep(2);
  }

  function updateMapping(index: number, patch: Partial<ColumnMapping>) {
    setMappings((current) => current.map((mapping, mappingIndex) => mappingIndex === index ? { ...mapping, ...patch } : mapping));
    setMessage('');
    onConfigurationChange?.();
  }

  function confirmMappings() {
    const validation = validateMappings(mappings, { statuses: {}, probabilities: {}, amountUnit: '' });
    if (validation.duplicateTargets.length || validation.duplicateCustomNames.length || validation.invalidMappings.length) {
      setMessage([
        ...validation.invalidMappings,
        ...validation.duplicateTargets.map((field) => `${FIELD_LABELS[field]}被重复映射`),
        ...validation.duplicateCustomNames.map((name) => `自定义字段“${name}”重复`)
      ].join('；'));
      return;
    }
    setStatuses(Object.fromEntries(statusValues.map((source) => [source, suggestedStatus(source)])));
    setProbabilities(Object.fromEntries(probabilityValues.map((source) => [source, suggestedProbability(source)])));
    setAmountUnit(unitValues.length === 1 ? suggestedUnit(unitValues[0]) : '');
    setMessage('');
    setStep(3);
  }

  function confirmValues() {
    const allStatusesMapped = statusValues.every((source) => Boolean(statuses[source]));
    const allProbabilitiesMapped = probabilityValues.every((source) => Boolean(probabilities[source]));
    const unitConfirmed = !mapsAmount || Boolean(amountUnit);
    if (!allStatusesMapped || !allProbabilitiesMapped || !unitConfirmed) {
      setMessage('请确认全部非空状态、概率和金额单位原值。');
      return;
    }
    if (hasMixedUnits) return;
    setMessage('');
    setStep(4);
  }

  const valueMappings: ValueMappings = {
    statuses: Object.fromEntries(Object.entries(statuses).filter((entry): entry is [string, ProjectStatus] => Boolean(entry[1]))),
    probabilities: Object.fromEntries(Object.entries(probabilities).filter((entry): entry is [string, ProbabilityBand] => Boolean(entry[1]))),
    amountUnit
  };
  const canonicalRows = useMemo(
    () => step === 4 ? applyMappings(records, mappings, valueMappings, inspection.sheetName) : [],
    [amountUnit, inspection.sheetName, mappings, probabilities, records, statuses, step]
  );
  const mappedStandardFields = useMemo(() => {
    const fields = new Set(mappings
      .filter((mapping): mapping is ColumnMapping & { targetField: CanonicalFieldKey } => mapping.mode === 'standard' && Boolean(mapping.targetField))
      .map((mapping) => mapping.targetField));
    if (fields.has('amount') && amountUnit) fields.add('unit');
    return fields;
  }, [amountUnit, mappings]);
  const ruleCapabilities = capabilities ?? getRuleCapabilities(mappedStandardFields);

  function finish() {
    onReady({
      rows: canonicalRows,
      mappings,
      valueMappings,
      source: { sheetName: inspection.sheetName, headerRowIndex }
    });
  }

  function returnTo(nextStep: 1 | 2 | 3) {
    onConfigurationChange?.();
    setStep(nextStep);
  }

  return <section className="import-wizard" aria-label="Excel 导入向导">
    <ol className="wizard-steps" aria-label="导入步骤">
      {['确认表头', '字段对应', '统一口径', '确认分析'].map((label, index) => <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><span>{index + 1}</span>{label}</li>)}
    </ol>

    {step === 1 && <div className="wizard-panel">
      <div className="wizard-heading"><div><p>第 1 步</p><h2>确认表头行</h2></div><span>{records.length} 条数据记录</span></div>
      <label className="header-picker">表头所在行<select aria-label="表头所在行" value={headerRowIndex} onChange={(event) => { setHeaderRowIndex(Number(event.target.value)); onConfigurationChange?.(); }}>
        {(inspection.candidateHeaderRows.length ? inspection.candidateHeaderRows : inspection.matrix.map((_, index) => index)).map((index) => <option key={index} value={index}>第 {index + 1} 行：{inspection.matrix[index].map(presentText).filter(Boolean).slice(0, 4).join('、')}</option>)}
      </select></label>
      <SheetPreview headers={headers} records={records} />
      <div className="wizard-actions"><button className="primary" type="button" onClick={confirmHeader}>确认表头行</button></div>
    </div>}

    {step === 2 && <div className="wizard-panel">
      <div className="wizard-heading"><div><p>第 2 步</p><h2>确认字段对应关系</h2></div><span>{headers.length} 个源字段</span></div>
      <p className="wizard-help">每列可作为标准字段、自定义字段或忽略。未识别的字段默认保留为自定义字段。</p>
      <div className="mapping-grid">{mappings.map((mapping, index) => <article className="mapping-card" key={mapping.sourceHeader} data-testid={`mapping-${mapping.sourceHeader}`}>
        <div className="mapping-source"><span>源字段</span><strong>{mapping.sourceHeader}</strong><small>{sourceValuesByHeader.get(mapping.sourceHeader)?.slice(0, 3).join('、') || '样例为空'}</small></div>
        <label>处理方式<select aria-label={`${mapping.sourceHeader}处理方式`} value={mapping.mode} onChange={(event) => {
          const mode = event.target.value as ColumnMapping['mode'];
          updateMapping(index, mode === 'standard'
            ? { mode, targetField: mapping.targetField ?? 'projectName', customName: undefined }
            : mode === 'custom'
              ? { mode, targetField: undefined, customName: mapping.customName ?? mapping.sourceHeader }
              : { mode, targetField: undefined, customName: undefined });
        }}><option value="standard">标准字段</option><option value="custom">自定义字段</option><option value="ignore">忽略此列</option></select></label>
        {mapping.mode === 'standard' && <label>对应标准字段<select aria-label={`${mapping.sourceHeader}标准字段`} value={mapping.targetField ?? ''} onChange={(event) => updateMapping(index, { targetField: event.target.value as CanonicalFieldKey })}><option value="" disabled>请选择</option>{STANDARD_FIELDS.map((field) => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label>}
        {mapping.mode === 'custom' && <label>自定义字段名称<input aria-label={`${mapping.sourceHeader}自定义字段名称`} value={mapping.customName ?? ''} onChange={(event) => updateMapping(index, { customName: event.target.value })} /></label>}
      </article>)}</div>
      {message && <p className="wizard-error" role="alert">{message}</p>}
      <div className="wizard-actions"><button className="secondary" type="button" onClick={() => returnTo(1)}>返回</button><button className="primary" type="button" onClick={confirmMappings}>确认字段关系</button></div>
    </div>}

    {step === 3 && <div className="wizard-panel">
      <div className="wizard-heading"><div><p>第 3 步</p><h2>统一状态、概率和金额单位口径</h2></div><span>空值保留为未知</span></div>
      <p className="wizard-help">以下项目来自 Excel 中全部非空原值。逐项确认后，规则才能按统一口径运行。</p>
      <EnumSection title="统一状态口径" empty="未映射项目状态字段">
        {statusValues.map((source) => <label className="enum-row" key={source}><span>{source}</span><select aria-label={`${source}对应状态`} value={statuses[source] ?? ''} onChange={(event) => { setStatuses((current) => ({ ...current, [source]: event.target.value as ProjectStatus })); onConfigurationChange?.(); }}><option value="">请选择标准状态</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>)}
      </EnumSection>
      <EnumSection title="统一概率口径" empty="未映射成单概率字段">
        {probabilityValues.map((source) => <label className="enum-row" key={source}><span>{source}</span><select aria-label={`${source}对应概率`} value={probabilities[source] ?? ''} onChange={(event) => { setProbabilities((current) => ({ ...current, [source]: event.target.value as ProbabilityBand })); onConfigurationChange?.(); }}><option value="">请选择标准概率</option>{PROBABILITIES.map((probability) => <option key={probability}>{probability}</option>)}</select></label>)}
      </EnumSection>
      {mapsAmount && <EnumSection title="统一金额单位" empty="">
        {hasMixedUnits ? <div className="unit-block"><strong>检测到多个金额单位：{unitValues.join('、')}</strong><p>首版仅支持同一工作表使用统一金额单位，请先在 Excel 中统一后重新导入。</p></div> : <label className="enum-row"><span>{unitValues[0] ? `源值：${unitValues[0]}` : '该金额列使用'}</span><select aria-label="统一金额单位" value={amountUnit} onChange={(event) => { setAmountUnit(event.target.value as ValueMappings['amountUnit']); onConfigurationChange?.(); }}><option value="">请选择金额单位</option>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label>}
      </EnumSection>}
      {message && <p className="wizard-error" role="alert">{message}</p>}
      <div className="wizard-actions"><button className="secondary" type="button" onClick={() => returnTo(2)}>返回</button><button className="primary" type="button" onClick={confirmValues} disabled={hasMixedUnits}>确认状态口径</button></div>
    </div>}

    {step === 4 && <div className="wizard-panel">
      <div className="wizard-heading"><div><p>第 4 步</p><h2>确认分析范围</h2></div><span>{canonicalRows.length} 条记录</span></div>
      <div className="confirmation-grid"><article><span>标准字段</span><strong>{mappings.filter((mapping) => mapping.mode === 'standard').length}</strong></article><article><span>自定义字段</span><strong>{mappings.filter((mapping) => mapping.mode === 'custom').length}</strong></article><article><span>忽略字段</span><strong>{mappings.filter((mapping) => mapping.mode === 'ignore').length}</strong></article></div>
      <section className="capability-preview"><h3>规则执行范围</h3><ul>{ruleCapabilities.map((capability) => <li key={capability.ruleId}><b>{capability.name ?? capability.ruleId}</b><span>{capability.available ? '可执行' : `跳过：缺少${capability.missingFields.map((field) => FIELD_LABELS[field]).join('、')}`}</span></li>)}</ul></section>
      <p className="wizard-help">点击后将按已确认的字段关系和统一口径直接运行规则分析。</p>
      <div className="wizard-actions"><button className="secondary" type="button" onClick={() => returnTo(3)}>返回</button><button className="primary" type="button" onClick={finish}>开始规则分析</button></div>
    </div>}
  </section>;
}

function EnumSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="enum-section"><h3>{title}</h3>{hasChildren ? children : <p>{empty}</p>}</section>;
}

function SheetPreview({ headers, records }: { headers: string[]; records: Array<Record<string, unknown>> }) {
  const visibleHeaders = headers.slice(0, 6);
  return <div className="wizard-preview"><table><thead><tr>{visibleHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{records.slice(0, 3).map((record, index) => <tr key={index}>{visibleHeaders.map((header) => <td key={header}>{presentText(record[header]) || '—'}</td>)}</tr>)}</tbody></table></div>;
}
