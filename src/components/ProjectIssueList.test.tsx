import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '../domain/rules';
import type { ProjectWorkbenchRow } from '../domain/workbench';
import { makeProject } from '../test/fixtures';
import { ProjectIssueList } from './ProjectIssueList';

afterEach(cleanup);

function finding(ruleId: string, rowKey: string, label: string, reason: string): Finding {
  return {
    ruleId, rowKey, projectId: rowKey, projectName: `项目${rowKey}`, customerName: `客户${rowKey}`,
    department: '华东部', salesManager: '销售甲', amountWan: 100, category: '数据质量待复核', label, reason, level: 'info'
  };
}

function makeRow(index: number, overrides: Partial<ProjectWorkbenchRow> = {}): ProjectWorkbenchRow {
  const rowKey = `row-${String(index).padStart(3, '0')}`;
  const fact = finding('follow-up-overdue', rowKey, '跟进超期', '已经 52 天未跟进');
  return {
    rowKey,
    project: makeProject({ sourceKey: rowKey, projectId: `P-${index}`, projectName: `项目${index}`, customerName: `客户${index}`, amount: 100 + index }),
    findings: [fact],
    factFindings: [fact],
    manualFindings: [],
    observationFindings: [],
    relatedProjects: [],
    followUpOverdueDays: 52,
    signingOverdueDays: null,
    priority: 1,
    ...overrides
  };
}

describe('ProjectIssueList', () => {
  it('renders one project row with all finding blocks, dates, and relationship details', () => {
    const base = makeRow(1);
    const manual = { ...finding('similar-name', base.rowKey, '名称相似待核验', '与另一项目名称接近'), relationKey: 'same' };
    const observation = finding('amount-tier-large', base.rowKey, '大额项目', '金额达到重点分档');
    const row = makeRow(1, {
      findings: [base.factFindings[0], manual, observation],
      manualFindings: [manual],
      observationFindings: [observation],
      relatedProjects: [{ rowKey: 'related', projectId: 'B', projectName: '项目B', customerName: '客户B', salesManager: '销售乙', relationKey: 'same', ruleId: 'similar-name', relationLabel: '名称相似待核验' }],
      project: makeProject({ sourceKey: base.rowKey, projectId: 'A', projectName: '项目A', customerName: '客户A', amount: 188, createdAt: '2026-01-01', lastFollowUpAt: '2026-06-01', expectedSignAt: null })
    });
    render(<ProjectIssueList rows={[row]} reviews={{}} onChangeReview={vi.fn()} onExportSelection={vi.fn()} />);

    expect(screen.getAllByRole('row')).toHaveLength(2);
    const dataRow = screen.getByText('项目A').closest('tr')!;
    expect(within(dataRow).getByText('A')).toBeInTheDocument();
    expect(within(dataRow).getByText('客户A')).toBeInTheDocument();
    expect(within(dataRow).getByText('188 万')).toBeInTheDocument();
    expect(within(dataRow).getByText('创建 2026-01-01')).toBeInTheDocument();
    expect(within(dataRow).getByText('最近跟进 2026-06-01')).toBeInTheDocument();
    expect(within(dataRow).getByText('跟进超期 52 天')).toBeInTheDocument();
    expect(within(dataRow).getByText('预计签约 —')).toBeInTheDocument();
    for (const label of ['跟进超期', '名称相似待核验', '大额项目']) expect(within(dataRow).getByText(label)).toBeInTheDocument();
    expect(within(dataRow).getByText(/B.*项目B.*客户B.*销售乙.*名称相似待核验/)).toBeInTheDocument();
  });

  it('bases manual controls only on manualFindings, including similar-name at info level', () => {
    const factOnly = makeRow(1);
    const observation = finding('amount-tier-large', 'row-002', '大额项目', '经营观察');
    const observationOnly = makeRow(2, { findings: [observation], factFindings: [], observationFindings: [observation], priority: 2 });
    const similar = finding('similar-name', 'row-003', '名称相似待核验', '需要人工核验');
    const manual = makeRow(3, { findings: [similar], factFindings: [], manualFindings: [similar], priority: 0 });

    render(<ProjectIssueList rows={[factOnly, observationOnly, manual]} reviews={{}} onChangeReview={vi.fn()} onExportSelection={vi.fn()} />);

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByLabelText('P-3 审查状态')).toBeInTheDocument();
    expect(screen.getAllByText('无需人工判断')).toHaveLength(2);
    expect(screen.queryByLabelText('P-1 审查状态')).not.toBeInTheDocument();
  });

  it('shows only the peer from the matching relation key under each same-label finding', () => {
    const base = makeRow(1);
    const relationWithB = { ...finding('similar-name', base.rowKey, '名称相似待核验', '与项目 B 名称接近'), relationKey: 'relation-b' };
    const relationWithC = { ...finding('similar-name', base.rowKey, '名称相似待核验', '与项目 C 名称接近'), relationKey: 'relation-c' };
    const row = makeRow(1, {
      findings: [relationWithB, relationWithC],
      factFindings: [],
      manualFindings: [relationWithB, relationWithC],
      relatedProjects: [
        { rowKey: 'row-b', projectId: 'B', projectName: '项目B', customerName: '客户B', salesManager: '销售乙', relationKey: 'relation-b', ruleId: 'similar-name', relationLabel: '名称相似待核验' },
        { rowKey: 'row-c', projectId: 'C', projectName: '项目C', customerName: '客户C', salesManager: '销售丙', relationKey: 'relation-c', ruleId: 'similar-name', relationLabel: '名称相似待核验' }
      ],
      priority: 0
    });

    render(<ProjectIssueList rows={[row]} reviews={{}} onChangeReview={vi.fn()} onExportSelection={vi.fn()} />);

    const findingBlocks = screen.getAllByText('名称相似待核验').map((label) => label.closest('.finding-item') as HTMLElement);
    expect(findingBlocks).toHaveLength(2);
    expect(within(findingBlocks[0]).getByText(/B.*项目B.*客户B.*销售乙/)).toBeInTheDocument();
    expect(within(findingBlocks[0]).queryByText(/C.*项目C.*客户C.*销售丙/)).not.toBeInTheDocument();
    expect(within(findingBlocks[1]).getByText(/C.*项目C.*客户C.*销售丙/)).toBeInTheDocument();
    expect(within(findingBlocks[1]).queryByText(/B.*项目B.*客户B.*销售乙/)).not.toBeInTheDocument();
  });

  it('shows 50 projects per page, keeps cross-page selection, and exports the selected keys', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 120 }, (_, index) => makeRow(index));
    const onExportSelection = vi.fn();
    render(<ProjectIssueList rows={rows} reviews={{}} onChangeReview={vi.fn()} onExportSelection={onExportSelection} />);

    expect(screen.getAllByRole('checkbox', { name: /选择项目/ })).toHaveLength(50);
    expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '选择项目 P-0' }));
    await user.click(screen.getByRole('button', { name: '下一页' }));
    await user.click(screen.getByRole('checkbox', { name: '选择项目 P-50' }));
    expect(screen.getByRole('button', { name: '导出所选 2 个项目' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导出所选 2 个项目' }));
    expect(onExportSelection).toHaveBeenCalledWith(new Set([rows[0].rowKey, rows[50].rowKey]));
  });

  it('exports the current list when nothing is selected and clamps the page after rows shrink', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 120 }, (_, index) => makeRow(index));
    const onExportSelection = vi.fn();
    const view = render(<ProjectIssueList rows={rows} reviews={{}} onChangeReview={vi.fn()} onExportSelection={onExportSelection} />);
    await user.click(screen.getByRole('button', { name: '下一页' }));
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 3 / 3 页')).toBeInTheDocument();

    view.rerender(<ProjectIssueList rows={rows.slice(0, 20)} reviews={{}} onChangeReview={vi.fn()} onExportSelection={onExportSelection} />);
    expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导出当前清单' }));
    expect(onExportSelection).toHaveBeenCalledWith(new Set());
  });

  it('resets to the first page when the filter scope changes even if the rows stay the same', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 120 }, (_, index) => makeRow(index));
    const view = render(<ProjectIssueList rows={rows} reviews={{}} onChangeReview={vi.fn()} onExportSelection={vi.fn()} resetKey="all" />);
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();

    view.rerender(<ProjectIssueList rows={rows} reviews={{}} onChangeReview={vi.fn()} onExportSelection={vi.fn()} resetKey="department-east" />);
    expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
  });
});
