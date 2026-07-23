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

const first = makeProject({ sourceKey: 'first', projectId: 'A', department: '华东部', salesManager: '销售甲', amount: 100 });
const second = makeProject({ sourceKey: 'second', projectId: 'B', department: '华南部', salesManager: '销售乙', amount: 200 });
const findings: Finding[] = [
  { ruleId: 'follow-up-overdue', rowKey: 'first', projectId: 'A', projectName: first.projectName, customerName: first.customerName, department: first.department, salesManager: first.salesManager, amountWan: 100, category: '维护超期待整改', label: '跟进超期', reason: '超过维护周期', level: 'action' },
  { ruleId: 'similar-name', rowKey: 'second', projectId: 'B', projectName: second.projectName, customerName: second.customerName, department: second.department, salesManager: second.salesManager, amountWan: 200, category: '疑似重复与撞单', label: '名称相似待核验', reason: '名称相似', level: 'info' },
  { ruleId: 'amount-tier-large', rowKey: 'second', projectId: 'B', projectName: second.projectName, customerName: second.customerName, department: second.department, salesManager: second.salesManager, amountWan: 200, category: '重点项目复盘', label: '大额项目', reason: '金额达到分档', level: 'info' }
];
const analysis = buildAnalysis([first, second], findings, new Date(2026, 6, 23, 12));

describe('AnalysisWorkspace', () => {
  it('provides three accessible tabs and opens the overview by default', async () => {
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

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['分析总览', '项目问题清单', '复盘摘要']);
    expect(screen.getByRole('tab', { name: '分析总览' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '分析总览' })).toBeVisible();
    expect(screen.queryByText('筛选工具')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '项目问题清单' }));
    expect(screen.getByRole('tabpanel', { name: '项目问题清单' })).toBeVisible();
    expect(screen.getByText('筛选工具')).toBeInTheDocument();
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

    await user.click(screen.getByRole('tab', { name: '复盘摘要' }));
    const panel = screen.getByRole('tabpanel', { name: '复盘摘要' });
    await user.click(within(panel).getByRole('button', { name: '下载复盘摘要.md' }));
    await user.click(within(panel).getByRole('button', { name: '导出项目明细.xlsx' }));

    expect(onDownloadMarkdown).toHaveBeenCalledOnce();
    expect(onDownloadExcel).toHaveBeenCalledWith(new Set());
  });
});
