import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildAnalysis } from '../domain/analysis';
import type { Finding } from '../domain/rules';
import type { ReviewRecordMap } from '../domain/review';
import { makeProject } from '../test/fixtures';
import { AnalysisResults } from './AnalysisResults';

const row = makeProject({ sourceKey: 'row-a', projectId: 'CRM-A', amount: 5000 });
const findings: Finding[] = [
  { ruleId: 'amount', rowKey: 'row-a', projectId: 'CRM-A', projectName: row.projectName, customerName: row.customerName, department: row.department, salesManager: row.salesManager, amountWan: 5000, category: '重点项目复盘', label: '超大金额待复核', reason: '金额较大', level: 'review' },
  { ruleId: 'reserve', rowKey: 'row-a', projectId: 'CRM-A', projectName: row.projectName, customerName: row.customerName, department: row.department, salesManager: row.salesManager, amountWan: 5000, category: '经营结构分析', label: '长周期项目', reason: '仅作经营观察', level: 'info' }
];
const reviews: ReviewRecordMap = {
  'row-a': { projectId: 'CRM-A', projectName: row.projectName, status: '待复核', note: '', firstReviewedAt: '2026-07-21T00:00:00.000Z', lastReviewedAt: '2026-07-21T00:00:00.000Z', fingerprint: 'x', dataUpdated: false, history: [] }
};

describe('AnalysisResults', () => {
  it('renders five separate result areas and only asks actionable findings to be reviewed', () => {
    render(<AnalysisResults analysis={buildAnalysis([row], findings, new Date('2026-07-21'))} reviews={reviews} onChangeReview={vi.fn()} />);

    for (const title of ['数据质量待复核', '维护超期待整改', '疑似重复与撞单', '重点项目复盘', '经营结构分析']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    const keyProjects = screen.getByRole('region', { name: '重点项目复盘' });
    expect(within(keyProjects).getByLabelText('CRM-A 审查状态')).toBeInTheDocument();
    const observations = screen.getByRole('region', { name: '经营结构分析' });
    expect(within(observations).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(observations).getByText('经营观察')).toBeInTheDocument();
  });
});
