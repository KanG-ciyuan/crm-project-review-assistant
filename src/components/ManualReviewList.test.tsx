import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewRecord } from '../domain/review';
import type { Finding } from '../domain/rules';
import type { ProjectWorkbenchRow } from '../domain/workbench';
import { makeProject } from '../test/fixtures';
import { ManualReviewList } from './ManualReviewList';

afterEach(cleanup);

function finding(ruleId: string, rowKey: string, label: string, reason: string): Finding {
  return {
    ruleId,
    rowKey,
    projectId: `P-${rowKey}`,
    projectName: `项目${rowKey}`,
    customerName: `客户${rowKey}`,
    department: '华东部',
    salesManager: '销售甲',
    amountWan: 100,
    category: '疑似重复与撞单',
    label,
    reason,
    level: 'info'
  };
}

function row(rowKey: string, manualFindings: Finding[], overrides: Partial<ProjectWorkbenchRow> = {}): ProjectWorkbenchRow {
  return {
    rowKey,
    project: makeProject({ sourceKey: rowKey, projectId: `P-${rowKey}`, projectName: `项目${rowKey}` }),
    findings: manualFindings,
    factFindings: [],
    manualFindings,
    observationFindings: [],
    relatedProjects: [],
    followUpOverdueDays: null,
    signingOverdueDays: null,
    priority: manualFindings.length > 0 ? 0 : 3,
    ...overrides
  };
}

function review(status: ReviewRecord['status'], note: string): ReviewRecord {
  return {
    projectId: 'P',
    projectName: '项目',
    status,
    note,
    firstReviewedAt: '2026-08-01T00:00:00.000Z',
    lastReviewedAt: '2026-08-02T00:00:00.000Z',
    fingerprint: 'current',
    dataUpdated: false,
    history: []
  };
}

describe('ManualReviewList', () => {
  it('excludes objective-only rows and shows manual evidence with total and pending counts', () => {
    const objective = finding('follow-up-overdue', 'objective', '跟进超期', '超过维护周期');
    const manualA = finding('similar-name', 'a', '名称相似待核验', '与另一项目名称高度相似');
    const manualB = finding('amount-placeholder', 'b', '金额疑似占位', '金额为常见占位值');

    render(<ManualReviewList
      rows={[
        row('objective', [], { findings: [objective], factFindings: [objective], priority: 1 }),
        row('a', [manualA]),
        row('b', [manualB])
      ]}
      reviews={{ b: review('已忽略', '无需处理') }}
      onChangeReview={vi.fn()}
    />);

    expect(screen.getByRole('heading', { name: '人工复核' })).toBeInTheDocument();
    expect(screen.getByText('共 2 个项目，1 个待复核')).toBeInTheDocument();
    expect(screen.queryByText('P-objective')).not.toBeInTheDocument();
    expect(screen.getByText('名称相似待核验')).toBeInTheDocument();
    expect(screen.getByText('与另一项目名称高度相似')).toBeInTheDocument();
    expect(screen.getByText('金额疑似占位')).toBeInTheDocument();
    expect(screen.getByText('金额为常见占位值')).toBeInTheDocument();
  });

  it('keeps two project values independent and forwards each row key through the shared controls', () => {
    const rows = [
      row('a', [finding('similar-name', 'a', '名称相似待核验', 'A 证据')]),
      row('b', [finding('duplicate-record', 'b', '重复记录待核验', 'B 证据')])
    ];
    const onChangeReview = vi.fn();
    render(<ManualReviewList
      rows={rows}
      reviews={{ a: review('确认业务风险', 'A 说明'), b: review('已忽略', 'B 说明') }}
      onChangeReview={onChangeReview}
    />);

    expect(screen.getByRole('combobox', { name: 'P-a 审查状态' })).toHaveValue('确认业务风险');
    expect(screen.getByRole('textbox', { name: 'P-a 处理说明' })).toHaveValue('A 说明');
    expect(screen.getByRole('combobox', { name: 'P-b 审查状态' })).toHaveValue('已忽略');
    expect(screen.getByRole('textbox', { name: 'P-b 处理说明' })).toHaveValue('B 说明');

    fireEvent.change(screen.getByRole('combobox', { name: 'P-a 审查状态' }), { target: { value: '确认数据错误' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'P-b 处理说明' }), { target: { value: '交由销售乙复核' } });
    expect(onChangeReview).toHaveBeenNthCalledWith(1, 'a', { status: '确认数据错误' });
    expect(onChangeReview).toHaveBeenNthCalledWith(2, 'b', { note: '交由销售乙复核' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  });

  it('updates the pending count from controlled review props after rerender', () => {
    const rows = [
      row('a', [finding('similar-name', 'a', '名称相似待核验', 'A 证据')]),
      row('b', [finding('duplicate-record', 'b', '重复记录待核验', 'B 证据')])
    ];
    const view = render(<ManualReviewList rows={rows} reviews={{}} onChangeReview={vi.fn()} />);
    expect(screen.getByText('共 2 个项目，2 个待复核')).toBeInTheDocument();

    view.rerender(<ManualReviewList rows={rows} reviews={{ a: review('确认业务风险', '已确认') }} onChangeReview={vi.fn()} />);
    expect(screen.getByText('共 2 个项目，1 个待复核')).toBeInTheDocument();
  });

  it('shows explicit fallbacks when project identity and owner fields are missing', () => {
    const manual = finding('similar-name', 'missing', '名称相似待核验', '需要确认项目身份');
    render(<ManualReviewList
      rows={[row('missing', [manual], {
        project: makeProject({ sourceKey: 'missing', projectId: '', projectName: '', department: '', salesManager: '' })
      })]}
      reviews={{}}
      onChangeReview={vi.fn()}
    />);

    const item = screen.getByRole('article');
    expect(within(item).getByText('未填写项目名称')).toBeInTheDocument();
    expect(within(item).getByText('未填写编号')).toBeInTheDocument();
    expect(within(item).getByText('未填写部门')).toBeInTheDocument();
    expect(within(item).getByText('未填写负责人')).toBeInTheDocument();
    expect(within(item).getByRole('combobox', { name: 'missing 审查状态' })).toBeInTheDocument();
  });

  it('shows an empty state when no rows require manual review', () => {
    const objective = finding('follow-up-overdue', 'objective', '跟进超期', '超过维护周期');
    render(<ManualReviewList
      rows={[row('objective', [], { findings: [objective], factFindings: [objective], priority: 1 })]}
      reviews={{}}
      onChangeReview={vi.fn()}
    />);

    expect(screen.getByRole('heading', { name: '人工复核' })).toBeInTheDocument();
    expect(screen.getByText('共 0 个项目，0 个待复核')).toBeInTheDocument();
    expect(screen.getByText('当前筛选范围内没有需要人工复核的项目。')).toBeInTheDocument();
  });
});
