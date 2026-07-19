import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import App from './App';
import type { ProjectRow } from './domain/analyze';
import { loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord } from './domain/review';

it('retains a user-selected review status after a page-style storage reload', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
  const row = {
    projectId: 'P-1',
    projectName: '项目',
    department: '部门',
    salesManager: '负责人',
    status: '跟进中',
    amount: 10,
    unit: '万元',
    createdAt: '2026-07-01',
    lastVisitAt: '2026-07-10',
    expectedSignAt: '2026-08-01',
    probability: 50
  } satisfies ProjectRow;
  const pending = reconcileReviewRecords([row], ['P-1'], {}, new Date('2026-07-17T09:00:00Z'));
  const reviewed = updateReviewRecord(pending, 'P-1', { status: '已忽略', note: '已处理。' }, new Date('2026-07-17T10:00:00Z'));

  saveReviewRecords(reviewed, storage);

  expect(loadReviewRecords(storage)['P-1']).toMatchObject({ status: '已忽略', note: '已处理。' });
});

it('shows email and GitHub feedback links on the import page', () => {
  render(<App />);

  expect(screen.getByRole('link', { name: '邮件反馈' })).toHaveAttribute('href', 'mailto:88416563@qq.com');
  expect(screen.getByRole('link', { name: '代码与版本' })).toHaveAttribute('href', 'https://github.com/KanG-ciyuan/crm-project-review-assistant');
});
