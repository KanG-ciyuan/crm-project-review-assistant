import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewSummaryData } from '../domain/report';
import { ReviewSummary } from './ReviewSummary';

afterEach(cleanup);

const summary: ReviewSummaryData = {
  meta: { title: '储备项目经营复盘', generatedDate: '2026-07-16', disclaimer: '业务结论须由业务人员确认。' },
  scope: ['部门：华东部'],
  executiveConclusions: ['本期分析 12 个项目。'],
  decisionItems: [],
  priorityProjects: [],
  departmentActions: [],
  appendix: {
    projectCount: 12,
    totalAmountWan: 0,
    categories: [{ label: '重复与撞单', projectCount: 3 }],
    reviewStatuses: [{ status: '待复核', count: 3 }, { status: '确认数据错误', count: 0 }, { status: '确认业务风险', count: 0 }, { status: '已忽略', count: 0 }],
    remainingProjects: []
  },
  overallConclusions: ['本期分析 12 个项目。'],
  priorityIssues: [{ label: '名称相似待核验', projectCount: 3 }],
  focusScopes: [{ type: '部门', name: '华东部', projectCount: 3 }],
  ruleDistribution: {
    categories: [{ label: '重复与撞单', projectCount: 3 }],
    reviewStatuses: [{ status: '待复核', count: 3 }, { status: '确认数据错误', count: 0 }, { status: '确认业务风险', count: 0 }, { status: '已忽略', count: 0 }]
  },
  actions: ['优先完成待复核项目。']
};

describe('ReviewSummary', () => {
  it('renders structured summary semantics and accessible export commands', async () => {
    const user = userEvent.setup();
    const onDownloadMarkdown = vi.fn();
    const onDownloadExcel = vi.fn();
    render(<ReviewSummary summary={summary} onDownloadMarkdown={onDownloadMarkdown} onDownloadExcel={onDownloadExcel} />);

    const region = screen.getByRole('region', { name: '经营复盘摘要' });
    expect(within(region).getByRole('heading', { name: '储备项目经营复盘' })).toBeInTheDocument();
    for (const heading of ['一、总体结论', '二、优先关注事项', '三、重点部门与负责人', '四、规则分布摘要', '五、建议行动']) {
      expect(within(region).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(within(region).getAllByRole('list')).toHaveLength(4);
    expect(within(region).getByRole('table', { name: '规则与复核状态分布' })).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: '下载复盘摘要.md' }));
    await user.click(within(region).getByRole('button', { name: '导出项目明细.xlsx' }));
    expect(onDownloadMarkdown).toHaveBeenCalledOnce();
    expect(onDownloadExcel).toHaveBeenCalledOnce();
  });
});
