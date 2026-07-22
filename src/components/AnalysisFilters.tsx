import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { AnalysisResult } from '../domain/analysis';
import {
  EMPTY_FILTERS,
  buildFilterOptions,
  type CountedOption,
  type FilterState
} from '../domain/filters';
import type { ReviewRecordMap } from '../domain/review';

interface AnalysisFiltersProps {
  analysis: AnalysisResult;
  filters: FilterState;
  reviews: ReviewRecordMap;
  selectedCount: number;
  totalCount: number;
  onChange: (filters: FilterState) => void;
}

type ArrayFilterKey = Exclude<keyof FilterState, 'query' | 'customValues' | 'amountMinWan' | 'amountMaxWan'>;

interface ActiveChip {
  key: string;
  label: string;
  remove: () => void;
}

export function AnalysisFilters({ analysis, filters, reviews, selectedCount, totalCount, onChange }: AnalysisFiltersProps) {
  const options = useMemo(() => buildFilterOptions(analysis, filters, reviews), [analysis, filters, reviews]);

  function setArray(key: ArrayFilterKey, values: string[]) {
    const next = { ...filters, [key]: values } as FilterState;
    if (key === 'departments') {
      const allowed = new Set(buildFilterOptions(analysis, next).salesManagers.map((item) => item.value));
      next.salesManagers = next.salesManagers.filter((seller) => allowed.has(seller));
    }
    onChange(next);
  }

  function toggleArray(key: ArrayFilterKey, value: string) {
    const current = filters[key] as string[];
    setArray(key, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function setCustom(field: string, values: string[]) {
    const customValues = Object.assign(Object.create(null) as Record<string, string[]>, filters.customValues);
    if (values.length) customValues[field] = values;
    else delete customValues[field];
    onChange({ ...filters, customValues });
  }

  const chips: ActiveChip[] = [];
  if (filters.query.trim()) chips.push({ key: 'query', label: `关键词：${filters.query.trim()}`, remove: () => onChange({ ...filters, query: '' }) });
  const chipGroups: Array<[ArrayFilterKey, string]> = [
    ['departments', '部门'], ['salesManagers', '销售经理'], ['statuses', '项目状态'],
    ['probabilityBands', '成单概率'], ['amountBands', '金额等级'], ['followUpBands', '跟进周期'],
    ['reserveCycleBands', '储备周期'], ['categories', '结果分类'], ['labels', '标签'],
    ['reviewStatuses', '审查状态'], ['industries', '行业'], ['regions', '区域'],
    ['projectTypes', '项目类型'], ['projectLevels', '项目等级']
  ];
  for (const [key, prefix] of chipGroups) {
    for (const value of filters[key] as string[]) {
      chips.push({ key: `${key}:${value}`, label: `${prefix}：${value}`, remove: () => setArray(key, (filters[key] as string[]).filter((item) => item !== value)) });
    }
  }
  if (filters.amountMinWan !== null) chips.push({ key: 'amountMinWan', label: `金额下限：${filters.amountMinWan.toLocaleString()}万元`, remove: () => onChange({ ...filters, amountMinWan: null }) });
  if (filters.amountMaxWan !== null) chips.push({ key: 'amountMaxWan', label: `金额上限：${filters.amountMaxWan.toLocaleString()}万元`, remove: () => onChange({ ...filters, amountMaxWan: null }) });
  for (const [field, values] of Object.entries(filters.customValues)) {
    for (const value of values) chips.push({
      key: JSON.stringify(['custom', field, value]),
      label: `${field}：${value}`,
      remove: () => setCustom(field, values.filter((item) => item !== value))
    });
  }

  return <section className="analysis-filters" aria-label="全局项目筛选">
    <div className="filter-topline">
      <label className="filter-search"><Search size={15} aria-hidden="true" /><span className="visually-hidden">搜索项目</span>
        <input type="search" aria-label="搜索项目" value={filters.query} placeholder="搜索项目、客户、编码或自定义字段" onChange={(event) => onChange({ ...filters, query: event.target.value })} />
      </label>
      <strong aria-live="polite">当前筛选 {selectedCount} / 全部 {totalCount} 个项目</strong>
      <button type="button" className="filter-clear" onClick={() => onChange(EMPTY_FILTERS)} disabled={chips.length === 0}>清除全部筛选</button>
    </div>

    <div className="filter-toolbar">
      <FilterGroup title="部门" fieldLabel="部门" stateKey="departments" options={options.departments} selected={filters.departments} onToggle={(value) => toggleArray('departments', value)} onAll={() => setArray('departments', options.departments.map((item) => item.value))} onClear={() => setArray('departments', [])} />
      <FilterGroup title="销售经理" fieldLabel="销售经理" stateKey="salesManagers" options={options.salesManagers} selected={filters.salesManagers} onToggle={(value) => toggleArray('salesManagers', value)} onAll={() => setArray('salesManagers', options.salesManagers.map((item) => item.value))} onClear={() => setArray('salesManagers', [])} onOnly={(value) => setArray('salesManagers', [value])} />
      <FilterGroup title="项目状态" fieldLabel="项目状态" stateKey="statuses" options={options.statuses} selected={filters.statuses} onToggle={(value) => toggleArray('statuses', value)} onAll={() => setArray('statuses', options.statuses.map((item) => item.value))} onClear={() => setArray('statuses', [])} />
      <FilterGroup title="成单概率" fieldLabel="成单概率" stateKey="probabilityBands" options={options.probabilityBands} selected={filters.probabilityBands} onToggle={(value) => toggleArray('probabilityBands', value)} onAll={() => setArray('probabilityBands', options.probabilityBands.map((item) => item.value))} onClear={() => setArray('probabilityBands', [])} />
      <FilterGroup title="金额" fieldLabel="金额等级" stateKey="amountBands" options={options.amountBands} selected={filters.amountBands} onToggle={(value) => toggleArray('amountBands', value)} onAll={() => setArray('amountBands', options.amountBands.map((item) => item.value))} onClear={() => setArray('amountBands', [])} extra={<div className="amount-range">
        <label>最低金额（万元）<input aria-label="最低金额（万元）" type="number" min="0" value={filters.amountMinWan ?? ''} onChange={(event) => onChange({ ...filters, amountMinWan: numberOrNull(event.target.value) })} /></label>
        <label>最高金额（万元）<input aria-label="最高金额（万元）" type="number" min="0" value={filters.amountMaxWan ?? ''} onChange={(event) => onChange({ ...filters, amountMaxWan: numberOrNull(event.target.value) })} /></label>
      </div>} />
      <FilterGroup title="跟进周期" fieldLabel="跟进周期" stateKey="followUpBands" options={options.followUpBands} selected={filters.followUpBands} onToggle={(value) => toggleArray('followUpBands', value)} onAll={() => setArray('followUpBands', options.followUpBands.map((item) => item.value))} onClear={() => setArray('followUpBands', [])} />
      <FilterGroup title="储备周期" fieldLabel="储备周期" stateKey="reserveCycleBands" options={options.reserveCycleBands} selected={filters.reserveCycleBands} onToggle={(value) => toggleArray('reserveCycleBands', value)} onAll={() => setArray('reserveCycleBands', options.reserveCycleBands.map((item) => item.value))} onClear={() => setArray('reserveCycleBands', [])} />
      <FilterGroup title="结果分类" fieldLabel="结果分类" stateKey="categories" options={options.categories} selected={filters.categories} onToggle={(value) => toggleArray('categories', value)} onAll={() => setArray('categories', options.categories.map((item) => item.value))} onClear={() => setArray('categories', [])} />
      <FilterGroup title="规则标签" fieldLabel="规则标签" stateKey="labels" options={options.labels} selected={filters.labels} onToggle={(value) => toggleArray('labels', value)} onAll={() => setArray('labels', options.labels.map((item) => item.value))} onClear={() => setArray('labels', [])} />
      <FilterGroup title="审查状态" fieldLabel="审查状态" stateKey="reviewStatuses" options={options.reviewStatuses} selected={filters.reviewStatuses} onToggle={(value) => toggleArray('reviewStatuses', value)} onAll={() => setArray('reviewStatuses', options.reviewStatuses.map((item) => item.value))} onClear={() => setArray('reviewStatuses', [])} />
      <FilterGroup title="行业" fieldLabel="行业" stateKey="industries" options={options.industries} selected={filters.industries} onToggle={(value) => toggleArray('industries', value)} onAll={() => setArray('industries', options.industries.map((item) => item.value))} onClear={() => setArray('industries', [])} />
      <FilterGroup title="区域" fieldLabel="区域" stateKey="regions" options={options.regions} selected={filters.regions} onToggle={(value) => toggleArray('regions', value)} onAll={() => setArray('regions', options.regions.map((item) => item.value))} onClear={() => setArray('regions', [])} />
      <FilterGroup title="项目类型" fieldLabel="项目类型" stateKey="projectTypes" options={options.projectTypes} selected={filters.projectTypes} onToggle={(value) => toggleArray('projectTypes', value)} onAll={() => setArray('projectTypes', options.projectTypes.map((item) => item.value))} onClear={() => setArray('projectTypes', [])} />
      <FilterGroup title="项目等级" fieldLabel="项目等级" stateKey="projectLevels" options={options.projectLevels} selected={filters.projectLevels} onToggle={(value) => toggleArray('projectLevels', value)} onAll={() => setArray('projectLevels', options.projectLevels.map((item) => item.value))} onClear={() => setArray('projectLevels', [])} />
      {Object.entries(options.customFields).map(([field, values]) => <CustomFilterGroup key={field} field={field} values={values} selected={Object.prototype.hasOwnProperty.call(filters.customValues, field) ? filters.customValues[field] : []} onChange={(next) => setCustom(field, next)} />)}
    </div>

    {chips.length > 0 && <div className="active-filters" aria-label="已选筛选条件">
      {chips.map((chip) => <span className="filter-chip" key={chip.key}>{chip.label}<button type="button" aria-label={`移除筛选：${chip.label}`} onClick={chip.remove}><X size={13} /></button></span>)}
    </div>}
  </section>;
}

function numberOrNull(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function FilterGroup({ title, fieldLabel, stateKey, options, selected, onToggle, onAll, onClear, onOnly, extra }: {
  title: string;
  fieldLabel: string;
  stateKey: string;
  options: CountedOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  onAll: () => void;
  onClear: () => void;
  onOnly?: (value: string) => void;
  extra?: React.ReactNode;
}) {
  return <details className="filter-menu">
    <summary>{title}{selected.length > 0 && <b>{selected.length}</b>}</summary>
    <div className="filter-popover" role="group" aria-label={`${fieldLabel}筛选选项`}>
      <div className="filter-menu-actions"><button type="button" onClick={onAll}>全选{fieldLabel}</button><button type="button" onClick={onClear}>清空{fieldLabel}</button></div>
      <div className="filter-options">
        {options.length === 0 ? <p>暂无可选项</p> : options.map((option) => <div className="filter-option" key={option.value}>
          <label><input type="checkbox" name={stateKey} checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} /><span>{option.value} {option.count}个项目</span></label>
          {onOnly && <button type="button" className="only-option" aria-label={`只看${option.value}`} onClick={() => onOnly(option.value)}>只看</button>}
        </div>)}
      </div>
      {extra}
    </div>
  </details>;
}

function CustomFilterGroup({ field, values, selected, onChange }: { field: string; values: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <details className="filter-menu">
    <summary>{field}{selected.length > 0 && <b>{selected.length}</b>}</summary>
    <div className="filter-popover" role="group" aria-label={`${field}筛选选项`}>
      <div className="filter-menu-actions"><button type="button" onClick={() => onChange(values)}>全选{field}</button><button type="button" onClick={() => onChange([])}>清空{field}</button></div>
      <div className="filter-options">{values.map((value) => <label className="filter-option custom-option" key={value}>
        <input type="checkbox" checked={selected.includes(value)} aria-label={`${field}：${value}`} onChange={() => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])} />
        <span>{value}</span>
      </label>)}</div>
    </div>
  </details>;
}
