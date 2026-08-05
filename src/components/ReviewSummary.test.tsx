import { createRef } from 'react';
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
  }
};

describe('ReviewSummary', () => {
  it('renders management metrics, conclusions, and preview-first commands', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    const onDownloadExcel = vi.fn();
    const previewButtonRef = createRef<HTMLButtonElement>();
    render(<ReviewSummary summary={summary} onPreview={onPreview} onDownloadExcel={onDownloadExcel} previewButtonRef={previewButtonRef} />);

    const region = screen.getByRole('region', { name: '经营复盘摘要' });
    expect(within(region).getByRole('heading', { name: '储备项目经营复盘' })).toBeInTheDocument();
    expect(within(region).getByText('分析项目')).toBeInTheDocument();
    expect(within(region).getByText('12', { selector: 'strong' })).toBeInTheDocument();
    expect(within(region).getByText('待决策事项')).toBeInTheDocument();
    expect(within(region).getByText('重点项目')).toBeInTheDocument();
    expect(within(region).getByText('本期分析 12 个项目。')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: /下载.*\.md/ })).not.toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: '预览完整报告' }));
    await user.click(within(region).getByRole('button', { name: '导出项目明细.xlsx' }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onDownloadExcel).toHaveBeenCalledOnce();
    expect(previewButtonRef.current).toBe(within(region).getByRole('button', { name: '预览完整报告' }));
  });
});
