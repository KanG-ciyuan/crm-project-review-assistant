import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAnalysis } from '../domain/analysis';
import { EMPTY_FILTERS } from '../domain/filters';
import { createReviewSummary } from '../domain/report';
import type { Finding } from '../domain/rules';
import { makeProject } from '../test/fixtures';
import { AnalysisWorkspace } from './AnalysisWorkspace';

afterEach(cleanup);

const first = makeProject({ sourceKey: 'first', projectId: 'A', projectName: '华东医院数字化改造', department: '华东部', salesManager: '销售甲', amount: 100 });
const second = makeProject({ sourceKey: 'second', projectId: 'B', projectName: '华南医院数字化改造', department: '华南部', salesManager: '销售乙', amount: 200 });
const findings: Finding[] = [
  { ruleId: 'follow-up-overdue', rowKey: 'first', projectId: 'A', projectName: first.projectName, customerName: first.customerName, department: first.department, salesManager: first.salesManager, amountWan: 100, category: '维护超期待整改', label: '跟进超期', reason: '超过维护周期', level: 'action' },
  { ruleId: 'similar-name', rowKey: 'second', projectId: 'B', projectName: second.projectName, customerName: second.customerName, department: second.department, salesManager: second.salesManager, amountWan: 200, category: '疑似重复与撞单', label: '名称相似待核验', reason: '名称相似', level: 'info' },
  { ruleId: 'amount-tier-large', rowKey: 'second', projectId: 'B', projectName: second.projectName, customerName: second.customerName, department: second.department, salesManager: second.salesManager, amountWan: 200, category: '重点项目复盘', label: '大额项目', reason: '金额达到分档', level: 'info' }
];
const analysis = buildAnalysis([first, second], findings, new Date(2026, 6, 23, 12));

describe('AnalysisWorkspace', () => {
  it('groups four accessible tabs with real counts and opens the overview by default', async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace
      analysis={analysis}
      fullCount={150}
      filters={EMPTY_FILTERS}
      reviews={{}}
      filterControls={<div>筛选工具</div>}
      summary={createReviewSummary(analysis, {})}
      onChangeReview={vi.fn()}
      onDownloadMarkdown={vi.fn()}
      onDownloadExcel={vi.fn()}
    />);

    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') ?? tab.textContent)).toEqual(['数据总览', '问题项目', '人工复核', '复盘报告']);
    expect(screen.getByText('分析', { selector: '.workbench-tab-group-label' })).toBeInTheDocument();
    expect(screen.getByText('处理', { selector: '.workbench-tab-group-label' })).toBeInTheDocument();
    expect(screen.getByText('输出', { selector: '.workbench-tab-group-label' })).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: '问题项目' })).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: '人工复核' })).getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '数据总览' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '数据总览' })).toBeVisible();
    expect(screen.queryByText('筛选工具')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '问题项目' }));
    expect(screen.getByRole('tabpanel', { name: '问题项目' })).toBeVisible();
    expect(screen.getByText('筛选工具')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '人工复核' }));
    expect(screen.getByRole('tabpanel', { name: '人工复核' })).toBeVisible();
    expect(screen.getByText('筛选工具')).toBeInTheDocument();
  });

  it('moves selection and focus with arrows, Home, and End, including wraparound', async () => {
    const user = userEvent.setup();
    render(<AnalysisWorkspace
      analysis={analysis}
      fullCount={2}
      filters={EMPTY_FILTERS}
      reviews={{}}
      filterControls={<div />}
      summary={createReviewSummary(analysis, {})}
      onChangeReview={vi.fn()}
      onDownloadMarkdown={vi.fn()}
      onDownloadExcel={vi.fn()}
    />);
    const overview = screen.getByRole('tab', { name: '数据总览' });
    const projects = screen.getByRole('tab', { name: '问题项目' });
    const reviews = screen.getByRole('tab', { name: '人工复核' });
    const summary = screen.getByRole('tab', { name: '复盘报告' });
    overview.focus();

    await user.keyboard('{ArrowRight}');
    expect(projects).toHaveFocus();
    expect(projects).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(reviews).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(summary).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(overview).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(summary).toHaveFocus();
    await user.keyboard('{Home}');
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute('aria-selected', 'true');
  });

  it('shows exactly five filtered-scope metrics and the three distributions', () => {
    render(<AnalysisWorkspace
      analysis={analysis}
      fullCount={150}
      filters={EMPTY_FILTERS}
      reviews={{}}
      filterControls={<div />}
      summary={createReviewSummary(analysis, {})}
      onChangeReview={vi.fn()}
      onDownloadMarkdown={vi.fn()}
      onDownloadExcel={vi.fn()}
    />);

    const overview = screen.getByRole('region', { name: '分析总览指标' });
    expect(within(overview).getAllByRole('article')).toHaveLength(5);
    for (const label of ['项目总数', '储备金额', '客观问题项目', '需要人工判断', '经营观察']) {
      expect(within(overview).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: '部门储备金额分布' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '销售经理储备金额分布' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '分析标签分布' })).toBeInTheDocument();
  });

  it('renders the semantic review summary and forwards both download commands', async () => {
    const user = userEvent.setup();
    const onDownloadMarkdown = vi.fn();
    const onDownloadExcel = vi.fn();
    render(<AnalysisWorkspace
      analysis={analysis}
      fullCount={2}
      filters={EMPTY_FILTERS}
      reviews={{}}
      filterControls={<div />}
      summary={createReviewSummary(analysis, {})}
      onChangeReview={vi.fn()}
      onDownloadMarkdown={onDownloadMarkdown}
      onDownloadExcel={onDownloadExcel}
    />);

    await user.click(screen.getByRole('tab', { name: '复盘报告' }));
    const panel = screen.getByRole('tabpanel', { name: '复盘报告' });
    await user.click(within(panel).getByRole('button', { name: '下载复盘摘要.md' }));
    await user.click(within(panel).getByRole('button', { name: '导出项目明细.xlsx' }));

    expect(onDownloadMarkdown).toHaveBeenCalledOnce();
    expect(onDownloadExcel).toHaveBeenCalledWith(new Set());
  });

  it('keeps related-project evidence from outside the current filtered scope', async () => {
    const user = userEvent.setup();
    const collision: Finding[] = [
      { ...findings[1], ruleId: 'cross-seller-collision', rowKey: 'first', projectId: 'A', projectName: first.projectName, customerName: first.customerName, department: first.department, salesManager: first.salesManager, relationKey: 'collision:one', label: '疑似撞单待核验' },
      { ...findings[1], ruleId: 'cross-seller-collision', rowKey: 'second', projectId: 'B', projectName: second.projectName, customerName: second.customerName, department: second.department, salesManager: second.salesManager, relationKey: 'collision:one', label: '疑似撞单待核验' }
    ];
    const completeAnalysis = buildAnalysis([first, second], collision, new Date(2026, 6, 23, 12));
    const filteredAnalysis = buildAnalysis([first], collision.filter((finding) => finding.rowKey === 'first'), new Date(2026, 6, 23, 12));

    render(<AnalysisWorkspace
      analysis={filteredAnalysis}
      relationAnalysis={completeAnalysis}
      fullCount={2}
      filters={{ ...EMPTY_FILTERS, salesManagers: ['销售甲'] }}
      reviews={{}}
      filterControls={<div />}
      summary={createReviewSummary(filteredAnalysis, {})}
      onChangeReview={vi.fn()}
      onDownloadMarkdown={vi.fn()}
      onDownloadExcel={vi.fn()}
    />);

    await user.click(screen.getByRole('tab', { name: '问题项目' }));
    expect(screen.getByText(/关联项目：B \/ .*销售乙/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /选择项目/ })).toHaveLength(1);
  });

  it('passes the filtered rows, controlled reviews, and review callback to the manual review view', async () => {
    const user = userEvent.setup();
    const onChangeReview = vi.fn();
    render(<AnalysisWorkspace
      analysis={analysis}
      fullCount={2}
      filters={EMPTY_FILTERS}
      reviews={{}}
      filterControls={<div>筛选工具</div>}
      summary={createReviewSummary(analysis, {})}
      onChangeReview={onChangeReview}
      onDownloadMarkdown={vi.fn()}
      onDownloadExcel={vi.fn()}
    />);

    await user.click(screen.getByRole('tab', { name: '人工复核' }));
    expect(screen.getByText('筛选工具')).toBeInTheDocument();
    expect(screen.queryByText(first.projectName)).not.toBeInTheDocument();
    expect(screen.getByText(second.projectName)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'B 审查状态' }), '确认业务风险');
    expect(onChangeReview).toHaveBeenCalledWith('second', { status: '确认业务风险' });
  });
});
