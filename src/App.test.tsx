import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import App from './App';
import { loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord } from './domain/review';
import * as workbookApi from './lib/workbook';
import { makeProject } from './test/fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('retains a user-selected review status after a page-style storage reload', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
  const row = makeProject({
    sourceKey: 'P-1',
    projectId: 'P-1',
    projectName: '项目',
    department: '部门',
    salesManager: '负责人',
    status: '跟进中',
    amount: 10,
    unit: '万元',
    createdAt: '2026-07-01',
    lastFollowUpAt: '2026-07-10',
    expectedSignAt: '2026-08-01',
    probabilityBand: '低概率'
  });
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

it('copies the feedback email address from the footer', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  render(<App />);
  await user.click(screen.getByRole('button', { name: '复制邮箱' }));

  expect(writeText).toHaveBeenCalledWith('88416563@qq.com');
  expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument();
});

it('opens the guided mapper for an arbitrary worksheet instead of requiring fixed headers', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['商机标题', '负责人姓名', '内部阶段'],
    ['医院数字化', '销售甲', '方案沟通']
  ]), '自定义商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({
    workbook,
    sheetNames: ['自定义商机表']
  });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '客户商机.xlsx'));

  expect(await screen.findByRole('heading', { name: '确认表头行' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '自定义商机表' })).toBeInTheDocument();
  expect(screen.queryByText('缺少必填字段')).not.toBeInTheDocument();
});

it('restarts the wizard when a same-name file and sheet are uploaded again', async () => {
  const user = userEvent.setup();
  const firstWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(firstWorkbook, XLSX.utils.aoa_to_sheet([
    ['标题'], ['说明'], ['导出时间'], ['空行'],
    ['项目名称', '销售经理'],
    ['旧项目', '销售甲']
  ]), '商机表');
  const secondWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(secondWorkbook, XLSX.utils.aoa_to_sheet([
    ['项目名称', '销售经理'],
    ['新项目', '销售乙']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook')
    .mockResolvedValueOnce({ workbook: firstWorkbook, sheetNames: ['商机表'] })
    .mockResolvedValueOnce({ workbook: secondWorkbook, sheetNames: ['商机表'] });

  render(<App />);
  const input = screen.getByLabelText('选择 .xlsx 文件');
  await user.upload(input, new File(['first'], '商机.xlsx'));
  expect(await screen.findByLabelText('表头所在行')).toHaveValue('4');

  await user.upload(input, new File(['second'], '商机.xlsx'));
  expect(await screen.findByLabelText('表头所在行')).toHaveValue('0');
  expect(screen.getByText('新项目')).toBeInTheDocument();
});

it('keeps the file picker reachable from the keyboard', async () => {
  const user = userEvent.setup();
  render(<App />);
  const input = screen.getByLabelText('选择 .xlsx 文件');

  expect(input).not.toHaveAttribute('hidden');
  expect(input).not.toHaveAttribute('tabindex', '-1');
  expect(input).toHaveClass('visually-hidden-file');
  await user.tab();
  expect(input).toHaveFocus();
});

it('clears an existing analysis when the confirmed mapping is edited', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目名称'],
    ['医院数字化']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.click(await screen.findByRole('button', { name: '确认表头行' }));
  await user.click(screen.getByRole('button', { name: '确认字段关系' }));
  await user.click(screen.getByRole('button', { name: '确认状态口径' }));
  await user.click(screen.getByRole('button', { name: '开始规则分析' }));
  expect(screen.getByRole('heading', { name: '数据质量与经营风险' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '返回' }));
  expect(screen.queryByRole('heading', { name: '数据质量与经营风险' })).not.toBeInTheDocument();
});

it('runs the confirmed 30-day rule pack and removes the legacy percentile rule', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目编号', '项目名称', '客户名称', '销售经理', '项目状态', '储备金额', '创建日期', '最近跟进日期', '预计签约日期', '成单概率'],
    ['A', '31天项目', '客户A', '销售甲', '跟进中', 100, '2026-01-01', '2026-06-20', '2026-08-01', '中等概率'],
    ['B', '21天项目', '客户B', '销售乙', '跟进中', 200, '2026-01-01', '2026-06-30', '2026-08-01', '中等概率'],
    ['C', '普通项目', '客户C', '销售丙', '跟进中', 300, '2026-01-01', '2026-07-10', '2026-08-01', '中等概率'],
    ['D', '高金额低概率项目', '客户D', '销售丁', '跟进中', 900, '2026-01-01', '2026-07-10', '2026-08-01', '低概率']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-21T09:00:00+08:00'));

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.click(await screen.findByRole('button', { name: '确认表头行' }));
  await user.click(screen.getByRole('button', { name: '确认字段关系' }));
  await user.selectOptions(screen.getByLabelText('统一金额单位'), '万元');
  await user.click(screen.getByRole('button', { name: '确认状态口径' }));
  await user.click(screen.getByRole('button', { name: '开始规则分析' }));

  const resultsTable = screen.getByRole('table');
  expect(within(resultsTable).getAllByText('跟进超期')).toHaveLength(1);
  expect(within(screen.getByText('31天项目').closest('tr')!).getByText('跟进超期')).toBeInTheDocument();
  expect(within(screen.getByText('21天项目').closest('tr')!).queryByText('跟进超期')).not.toBeInTheDocument();
  expect(screen.queryByText('高金额低确定性')).not.toBeInTheDocument();
});
