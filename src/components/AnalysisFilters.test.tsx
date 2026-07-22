import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAnalysis } from '../domain/analysis';
import { EMPTY_FILTERS, filterProjectKeys, type FilterState } from '../domain/filters';
import { evaluateRulePack } from '../domain/rules';
import { makeProject } from '../test/fixtures';
import { AnalysisFilters } from './AnalysisFilters';

const today = new Date('2026-07-21T09:00:00+08:00');

afterEach(cleanup);

function FilterHarness({ initial = EMPTY_FILTERS }: { initial?: FilterState }) {
  const rows = Array.from({ length: 12 }, (_, index) => makeProject({
    sourceKey: `row-${index}`,
    projectId: `CRM-${index}`,
    department: index < 10 ? '华东一部' : '华南部',
    salesManager: index < 6 ? '销售甲' : index < 10 ? '销售乙' : '销售丙',
    industry: index % 2 ? '医疗' : '制造',
    customFields: { 项目来源: index % 2 ? '展会' : '转介绍' }
  }));
  const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  const [filters, setFilters] = useState(initial);
  return <AnalysisFilters analysis={analysis} filters={filters} reviews={{}} selectedCount={filterProjectKeys(analysis, {}, filters).size} totalCount={analysis.rows.length} onChange={setFilters} />;
}

describe('AnalysisFilters', () => {
  it('updates department and cascaded seller filters, then clears all conditions', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);

    await user.click(screen.getByRole('checkbox', { name: '华东一部 10个项目' }));
    expect(screen.getByText('部门：华东一部')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '销售丙 2个项目' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: '销售甲 6个项目' }));
    expect(screen.getByText('销售经理：销售甲')).toBeInTheDocument();
    expect(screen.getByText('当前筛选 6 / 全部 12 个项目')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '清除全部筛选' }));
    expect(screen.getByText('当前筛选 12 / 全部 12 个项目')).toBeInTheDocument();
    expect(screen.queryByText('部门：华东一部')).not.toBeInTheDocument();
  });

  it('supports select-all, seller-only shortcut, and removing one active chip', async () => {
    const user = userEvent.setup();
    render(<FilterHarness initial={{ ...EMPTY_FILTERS, departments: ['华东一部'] }} />);

    await user.click(screen.getByRole('button', { name: '只看销售乙' }));
    expect(screen.getByText('销售经理：销售乙')).toBeInTheDocument();
    expect(screen.getByText('当前筛选 4 / 全部 12 个项目')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '移除筛选：销售经理：销售乙' }));
    expect(screen.queryByText('销售经理：销售乙')).not.toBeInTheDocument();
    expect(screen.getByText('当前筛选 10 / 全部 12 个项目')).toBeInTheDocument();

    const industryGroup = screen.getByRole('group', { name: '行业筛选选项' });
    await user.click(within(industryGroup).getByRole('button', { name: '全选行业' }));
    expect(screen.getByText('行业：医疗')).toBeInTheDocument();
    expect(screen.getByText('行业：制造')).toBeInTheDocument();
  });

  it('renders keyword, amount range, rule labels, review states, and low-cardinality custom fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const row = makeProject({ sourceKey: 'one', lastFollowUpAt: '2026-06-01', customFields: { 项目来源: '展会' } });
    const analysis = buildAnalysis([row], evaluateRulePack([row], today), today);
    render(<AnalysisFilters analysis={analysis} filters={EMPTY_FILTERS} reviews={{}} selectedCount={1} totalCount={1} onChange={onChange} />);

    await user.type(screen.getByRole('searchbox', { name: '搜索项目' }), '医院');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: '医' }));
    expect(screen.getByLabelText('最低金额（万元）')).toBeInTheDocument();
    expect(screen.getByLabelText('最高金额（万元）')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /跟进超期/ })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '审查状态筛选选项' })).getByRole('checkbox', { name: /待复核/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '项目来源：展会' })).toBeInTheDocument();
  });

  it('uses the projected count supplied by App instead of recalculating project keys', () => {
    const row = makeProject({ sourceKey: 'one' });
    const analysis = buildAnalysis([row], [], today);

    render(<AnalysisFilters
      analysis={analysis}
      filters={{ ...EMPTY_FILTERS, departments: ['不存在'] }}
      reviews={{}}
      selectedCount={7}
      totalCount={12}
      onChange={vi.fn()}
    />);

    expect(screen.getByText('当前筛选 7 / 全部 12 个项目')).toBeInTheDocument();
  });

  it('keeps prototype-like custom fields selectable and removable as collision-safe chips', async () => {
    const user = userEvent.setup();
    const customFields = Object.create(null) as Record<string, string>;
    customFields.__proto__ = '原型渠道';
    Object.defineProperty(customFields, 'constructor', { value: '构造渠道', enumerable: true, writable: true });
    const row = makeProject({ sourceKey: 'special', customFields });
    const analysis = buildAnalysis([row], [], today);

    function SpecialHarness() {
      const [filters, setFilters] = useState(EMPTY_FILTERS);
      return <AnalysisFilters analysis={analysis} filters={filters} reviews={{}} selectedCount={1} totalCount={1} onChange={setFilters} />;
    }
    render(<SpecialHarness />);

    await user.click(screen.getByRole('checkbox', { name: '__proto__：原型渠道' }));
    await user.click(screen.getByRole('checkbox', { name: 'constructor：构造渠道' }));
    expect(screen.getByText('__proto__：原型渠道')).toBeInTheDocument();
    expect(screen.getByText('constructor：构造渠道')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除筛选：__proto__：原型渠道' }));
    expect(screen.queryByText('__proto__：原型渠道')).not.toBeInTheDocument();
    expect(screen.getByText('constructor：构造渠道')).toBeInTheDocument();
  });
});
