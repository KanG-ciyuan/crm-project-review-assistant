import { useMemo, useState } from 'react';
import type { CanonicalFieldKey, ProbabilityBand, ProjectRow, ProjectStatus } from '../domain/project';
import { applyMappings, type ColumnMapping, type ValueMappings } from '../domain/mapping';
import { diagnoseImport } from '../domain/importDiagnosis';
import { getRuleCapabilities } from '../domain/rules';
import type { RawSheetInspection } from '../lib/workbook';
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
  sourceNamespace?: string;
  onReady: (payload: ImportReadyPayload) => void;
  capabilities?: RuleCapabilityPreview[];
  onConfigurationChange?: () => void;
}

const FIELD_LABELS: Partial<Record<CanonicalFieldKey, string>> = {
  projectId: '项目编号', projectName: '项目名称', customerName: '客户名称', department: '部门',
  salesManager: '销售经理', status: '项目状态', amount: '储备金额', unit: '金额单位',
  createdAt: '创建日期', lastFollowUpAt: '最近跟进日期', expectedSignAt: '预计签约日期',
  probabilityBand: '成单概率', industry: '行业', region: '区域/省份', projectType: '项目类型',
  projectLevel: '项目等级', latestUpdatedAt: '最后更新时间'
};
const STATUSES: ProjectStatus[] = ['跟进中', '呆滞', '已签约', '已丢单', '未知'];
const UNITS: Array<'元' | '万元' | '亿元'> = ['元', '万元', '亿元'];
const STANDARD_FIELDS = Object.entries(FIELD_LABELS) as Array<[CanonicalFieldKey, string]>;

export function ImportWizard({ inspection, sourceNamespace, onReady, capabilities, onConfigurationChange }: ImportWizardProps) {
  const initialDiagnosis = useMemo(() => diagnoseImport(inspection), [inspection]);
  const [mappings, setMappings] = useState<ColumnMapping[]>(initialDiagnosis.mappings);
  const diagnosis = useMemo(() => diagnoseImport(inspection, mappings), [inspection, mappings]);
  const [statusResolutions, setStatusResolutions] = useState<Record<string, ProjectStatus | ''>>({});
  const [probabilityResolutions, setProbabilityResolutions] = useState<Record<string, string>>({});
  const [amountUnit, setAmountUnit] = useState<ValueMappings['amountUnit']>(diagnosis.valueMappings.amountUnit);
  const [message, setMessage] = useState('');

  const unresolvedStatuses = diagnosis.confirmations.filter((item) => item.kind === 'status');
  const unresolvedProbabilities = diagnosis.confirmations.filter((item) => item.kind === 'probability');
  const needsAmountUnit = diagnosis.confirmations.some((item) => item.kind === 'amount-unit');
  const mappedFields = new Set(diagnosis.mappings
    .filter((mapping): mapping is ColumnMapping & { targetField: CanonicalFieldKey } => mapping.mode === 'standard' && Boolean(mapping.targetField))
    .map((mapping) => mapping.targetField));
  if (mappedFields.has('amount') && amountUnit) mappedFields.add('unit');
  const ruleCapabilities = capabilities ?? getRuleCapabilities(mappedFields);

  const canStart = diagnosis.state !== 'blocked'
    && unresolvedStatuses.every((item) => Boolean(statusResolutions[item.source]))
    && unresolvedProbabilities.every((item) => {
      const value = probabilityResolutions[item.source]?.trim();
      if (value === '询价类') return true;
      const numeric = Number(value);
      return value !== '' && Number.isFinite(numeric) && numeric >= 0 && numeric <= 100;
    })
    && (!needsAmountUnit || Boolean(amountUnit));

  function finish() {
    if (!canStart) {
      setMessage('请先完成需要确认的项目。');
      return;
    }
    const probabilities: Record<string, ProbabilityBand> = { ...diagnosis.valueMappings.probabilities };
    for (const item of unresolvedProbabilities) {
      const source = probabilityResolutions[item.source].trim();
      probabilities[item.source] = source === '询价类' ? '询价类' : `${Number(source)}%` as ProbabilityBand;
    }
    const valueMappings: ValueMappings = {
      statuses: {
        ...diagnosis.valueMappings.statuses,
        ...Object.fromEntries(Object.entries(statusResolutions).filter((entry): entry is [string, ProjectStatus] => Boolean(entry[1])))
      },
      probabilities,
      amountUnit
    };
    onReady({
      rows: applyMappings(diagnosis.records, diagnosis.mappings, valueMappings, inspection.sheetName, sourceNamespace),
      mappings: diagnosis.mappings,
      valueMappings,
      source: { sheetName: inspection.sheetName, headerRowIndex: diagnosis.headerRowIndex }
    });
  }

  const { summary } = diagnosis;
  const summaryText = `已识别 ${summary.standardFields} 个标准字段，${summary.customFields} 个自定义字段，共 ${summary.rowCount} 条项目数据，可以开始分析。`;

  return <section className="import-wizard smart-import" aria-label="Excel 导入向导">
    <div className="smart-import-heading">
      <div><p>智能识别完成</p><h2>{diagnosis.confirmations.length ? `有 ${diagnosis.confirmations.length} 项需要确认` : '数据已准备好'}</h2></div>
      <span>{summary.rowCount} 条项目</span>
    </div>
    <p className="smart-import-summary">{summaryText}</p>

    {diagnosis.blockingMessages.map((item) => <div className="import-blocker" role="alert" key={item}><strong>{item}</strong><p>请先在 Excel 中统一后重新导入。</p></div>)}

    {diagnosis.confirmations.length > 0 && <div className="confirmation-list">
      {unresolvedStatuses.map((item) => <label className="confirmation-row" key={`status:${item.source}`}>
        <span><b>项目状态</b><small>原值：{item.source}</small></span>
        <select aria-label={`${item.source}对应状态`} value={statusResolutions[item.source] ?? ''} onChange={(event) => {
          setStatusResolutions((current) => ({ ...current, [item.source]: event.target.value as ProjectStatus }));
          setMessage(''); onConfigurationChange?.();
        }}><option value="">请选择</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
      </label>)}
      {unresolvedProbabilities.map((item) => <label className="confirmation-row" key={`probability:${item.source}`}>
        <span><b>成单概率</b><small>原值：{item.source}</small></span>
        <input aria-label={`${item.source}对应概率`} value={probabilityResolutions[item.source] ?? ''} placeholder="填写0-100或询价类" onChange={(event) => {
          setProbabilityResolutions((current) => ({ ...current, [item.source]: event.target.value }));
          setMessage(''); onConfigurationChange?.();
        }} />
      </label>)}
      {needsAmountUnit && <label className="confirmation-row"><span><b>金额单位</b><small>本次整表统一使用</small></span>
        <select aria-label="金额单位" value={amountUnit} onChange={(event) => { setAmountUnit(event.target.value as ValueMappings['amountUnit']); setMessage(''); onConfigurationChange?.(); }}>
          <option value="">请选择</option>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}
        </select>
      </label>}
    </div>}

    <details className="recognition-details">
      <summary>查看识别详情</summary>
      <div className="recognition-stats"><span>标准字段 <b>{summary.standardFields}</b></span><span>自定义字段 <b>{summary.customFields}</b></span><span>忽略字段 <b>{summary.ignoredFields}</b></span></div>
      <section className="field-recognition"><h3>字段识别</h3><div>{diagnosis.mappings.map((mapping, index) => {
        const value = mapping.mode === 'standard' ? mapping.targetField ?? '' : mapping.mode === 'custom' ? '__custom__' : '__ignore__';
        return <label key={mapping.sourceHeader}><span>{mapping.sourceHeader}</span><select aria-label={`${mapping.sourceHeader}字段对应`} value={value} onChange={(event) => {
          const nextValue = event.target.value;
          setMappings((current) => current.map((item, itemIndex) => itemIndex !== index ? item
            : nextValue === '__custom__' ? { sourceHeader: item.sourceHeader, mode: 'custom', customName: item.sourceHeader }
              : nextValue === '__ignore__' ? { sourceHeader: item.sourceHeader, mode: 'ignore' }
                : { sourceHeader: item.sourceHeader, mode: 'standard', targetField: nextValue as CanonicalFieldKey }));
          setStatusResolutions({});
          setProbabilityResolutions({});
          setMessage('');
          onConfigurationChange?.();
        }}><option value="__custom__">保留为自定义字段</option><option value="__ignore__">忽略此列</option>{STANDARD_FIELDS.map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label>;
      })}</div></section>
      <section className="capability-preview"><h3>规则执行范围</h3><ul>{ruleCapabilities.map((capability) => <li key={capability.ruleId}><b>{capability.name ?? capability.ruleId}</b><span>{capability.available ? '可执行' : `跳过：缺少${capability.missingFields.map((field) => FIELD_LABELS[field] ?? field).join('、')}`}</span></li>)}</ul></section>
    </details>

    {message && <p className="wizard-error" role="alert">{message}</p>}
    <div className="wizard-actions"><button className="primary" type="button" disabled={!canStart} onClick={finish}>开始分析</button></div>
  </section>;
}
