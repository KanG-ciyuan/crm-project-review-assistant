import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import App from './App';
import { formatLocalDate } from './domain/report';
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
    probabilityBand: '40%'
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

it('opens smart confirmation for an arbitrary worksheet instead of requiring fixed headers', async () => {
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

  expect(await screen.findByRole('heading', { name: '有 1 项需要确认' })).toBeInTheDocument();
  expect(screen.getByLabelText('方案沟通对应状态')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '自定义商机表' })).toBeInTheDocument();
  expect(screen.queryByText('缺少必填字段')).not.toBeInTheDocument();
});

it('restarts the wizard when a same-name file and sheet are uploaded again', async () => {
  const user = userEvent.setup();
  const firstWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(firstWorkbook, XLSX.utils.aoa_to_sheet([
    ['标题'], ['说明'], ['导出时间'], ['空行'],
    ['项目名称', '销售经理', '储备金额', '金额单位'],
    ['旧项目', '销售甲', 0, '万元']
  ]), '商机表');
  const secondWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(secondWorkbook, XLSX.utils.aoa_to_sheet([
    ['项目名称', '销售经理', '储备金额', '金额单位'],
    ['新项目', '销售乙', 0, '万元']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook')
    .mockResolvedValueOnce({ workbook: firstWorkbook, sheetNames: ['商机表'] })
    .mockResolvedValueOnce({ workbook: secondWorkbook, sheetNames: ['商机表'] });

  render(<App />);
  const input = screen.getByLabelText('选择 .xlsx 文件');
  await user.upload(input, new File(['first'], '商机.xlsx'));
  await user.click(await screen.findByRole('button', { name: '开始分析' }));
  expect(screen.getByText('旧项目')).toBeInTheDocument();

  await user.upload(input, new File(['second'], '商机.xlsx'));
  expect(screen.queryByLabelText('经营复盘草稿')).not.toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: '开始分析' }));
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

it('runs a simple workbook through the smart import path', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目名称'],
    ['医院数字化']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.click(await screen.findByRole('button', { name: '开始分析' }));
  expect(screen.getByRole('heading', { name: '数据质量待复核' })).toBeInTheDocument();
});

it('does not create a review status control for objective fact findings', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目编号', '项目名称', '销售经理', '储备金额', '金额单位', '最近跟进日期'],
    ['FACT-1', '超期项目', '销售甲', 5000, '万元', '2026-06-01']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.click(await screen.findByRole('button', { name: '开始分析' }));

  expect(screen.getByText('跟进超期')).toBeInTheDocument();
  expect(screen.queryByLabelText('FACT-1 审查状态')).not.toBeInTheDocument();
});

it('keeps review input visible and offers retry when browser storage fails', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目编号', '项目名称', '销售经理', '储备金额', '金额单位'],
    ['SAVE-1', '待保存项目', '销售甲', 0, '万元'],
    ['SAVE-1', '待保存项目副本', '销售甲', 0, '万元']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.click(await screen.findByRole('button', { name: '开始分析' }));
  const status = screen.getAllByLabelText('SAVE-1 审查状态')[0];
  await user.selectOptions(status, '确认数据错误');

  expect(status).toHaveValue('确认数据错误');
  expect(screen.getByRole('alert')).toHaveTextContent('自动保存失败');
  expect(screen.getByRole('button', { name: '重试保存' })).toBeInTheDocument();
});

it('runs the confirmed 30-day rule pack and removes the legacy percentile rule', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目编号', '项目名称', '客户名称', '销售经理', '项目状态', '储备金额', '创建日期', '最近跟进日期', '预计签约日期', '成单概率'],
    ['A', '31天项目', '客户A', '销售甲', '跟进中', 100, '2026-01-01', '2026-06-20', '2026-08-01', '60%'],
    ['B', '21天项目', '客户B', '销售乙', '跟进中', 200, '2026-01-01', '2026-06-30', '2026-08-01', '60%'],
    ['C', '普通项目', '客户C', '销售丙', '跟进中', 300, '2026-01-01', '2026-07-10', '2026-08-01', '60%'],
    ['D', '高金额低概率项目', '客户D', '销售丁', '跟进中', 900, '2026-01-01', '2026-07-10', '2026-08-01', '40%']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 21, 12));

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.selectOptions(await screen.findByLabelText('金额单位'), '万元');
  await user.click(screen.getByRole('button', { name: '开始分析' }));

  const resultsTable = within(screen.getByRole('region', { name: '维护超期待整改' })).getByRole('table');
  expect(within(resultsTable).getAllByText('跟进超期')).toHaveLength(1);
  expect(within(within(resultsTable).getByText('31天项目').closest('tr')!).getByText('跟进超期')).toBeInTheDocument();
  expect(within(resultsTable).queryByText('21天项目')).not.toBeInTheDocument();
  expect(screen.queryByText('高金额低确定性')).not.toBeInTheDocument();
});

it('projects one global filter across metrics and result areas without changing the full analysis', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目编号', '项目名称', '客户名称', '部门', '销售经理', '项目状态', '储备金额', '创建日期', '最近跟进日期', '预计签约日期', '成单概率'],
    ['EAST', '华东超期项目', '客户甲', '华东部', '销售甲', '跟进中', 1200, '2026-01-01', '2026-06-01', '2026-08-01', '60%'],
    ['SOUTH', '华南超期项目', '客户乙', '华南部', '销售乙', '跟进中', 5000, '2026-01-01', '2026-06-01', '2026-08-01', '60%']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 21, 12));

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '商机.xlsx'));
  await user.selectOptions(await screen.findByLabelText('金额单位'), '万元');
  await user.click(screen.getByRole('button', { name: '开始分析' }));

  const projectCountMetric = screen.getByText('项目总数').closest('article')!;
  expect(within(projectCountMetric).getByText('2')).toBeInTheDocument();
  const maintenance = screen.getByRole('region', { name: '维护超期待整改' });
  expect(within(maintenance).getByText('华东超期项目')).toBeInTheDocument();
  expect(within(maintenance).getByText('华南超期项目')).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox', { name: '华东部 1个项目' }));
  expect(screen.getByText('当前筛选 1 / 全部 2 个项目')).toBeInTheDocument();
  expect(within(projectCountMetric).getByText('1')).toBeInTheDocument();
  expect(within(maintenance).getByText('华东超期项目')).toBeInTheDocument();
  expect(within(maintenance).queryByText('华南超期项目')).not.toBeInTheDocument();
  const reportValue = (screen.getByLabelText('经营复盘草稿') as HTMLTextAreaElement).value;
  expect(screen.getByText('当前 1 / 全部 2 个项目')).toBeInTheDocument();
  expect(screen.getByText('筛选范围：部门：华东部')).toBeInTheDocument();
  expect(reportValue).toContain('跟进超期：涉及 1 个项目');
  expect(reportValue).not.toContain('华东超期项目');
  expect(reportValue).not.toContain('华南超期项目');
  expect(reportValue).toContain('筛选范围：部门：华东部');

  const createdUrls: string[] = [];
  const exportedBlobs: Blob[] = [];
  const downloadedNames: string[] = [];
  const attachedDuringClick: boolean[] = [];
  const downloadedAnchors: HTMLAnchorElement[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new TypeError('报告导出必须使用 Blob');
    exportedBlobs.push(blob);
    const url = `blob:test-${createdUrls.length + 1}`;
    createdUrls.push(url);
    return url;
  });
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    attachedDuringClick.push(document.body.contains(this));
    downloadedAnchors.push(this);
    downloadedNames.push(this.download);
  });

  fireEvent.click(screen.getByRole('button', { name: '导出当前筛选结果' }));
  fireEvent.click(screen.getByRole('button', { name: '导出全部结果' }));

  const expectedLocalDate = formatLocalDate(new Date());
  expect(downloadedNames).toEqual([
    `储备项目经营复盘-${expectedLocalDate}-当前筛选.md`,
    `储备项目经营复盘-${expectedLocalDate}-全部.md`
  ]);
  expect(attachedDuringClick).toEqual([true, true]);
  expect(downloadedAnchors.every((anchor) => !anchor.isConnected)).toBe(true);
  expect(revokeObjectURL).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(revokeObjectURL).toHaveBeenNthCalledWith(1, createdUrls[0]);
  expect(revokeObjectURL).toHaveBeenNthCalledWith(2, createdUrls[1]);
  const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
  const currentExport = await readBlob(exportedBlobs[0]);
  const allExport = await readBlob(exportedBlobs[1]);
  expect(currentExport).toContain('筛选范围：部门：华东部');
  expect(currentExport).toContain('跟进超期：涉及 1 个项目');
  expect(currentExport).not.toContain('华东超期项目');
  expect(currentExport).not.toContain('华南超期项目');
  expect(allExport).toContain('跟进超期：涉及 2 个项目');
  expect(allExport).not.toContain('华东超期项目');
  expect(allExport).not.toContain('华南超期项目');
  expect(allExport).not.toContain('筛选范围：');

  await user.click(screen.getByRole('button', { name: '清除全部筛选' }));
  expect(screen.getByText('当前筛选 2 / 全部 2 个项目')).toBeInTheDocument();
  expect(within(projectCountMetric).getByText('2')).toBeInTheDocument();
  expect(within(maintenance).getByText('华南超期项目')).toBeInTheDocument();
});

it('analyzes an arbitrary Excel workflow and keeps seller filters, findings, metrics, and report in sync', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['销售机会运营台账'],
    ['机会主键', '机会主题', '客户主体', '负责团队', '业务人员', '推进阶段', '预计规模', '登记时间', '末次联系', '计划成交日', '成功可能性'],
    ['OP-001', '甲方超期商机', '客户甲', '企业一部', '销售甲', '持续推进', 100, '2026-01-01', '2026-06-01', '2026-09-01', '40%'],
    ['OP-002', '乙方正常商机', '客户乙', '企业二部', '销售乙', '持续推进', 200, '2026-02-01', '2026-07-15', '2026-09-15', '70%'],
    ['OP-003', '丙方正常商机', '客户丙', '企业二部', '销售乙', '持续推进', 300, '2026-03-01', '2026-07-18', '2026-10-01', '80%']
  ]), '自定义机会表');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 21, 12));

  render(<App />);
  await user.upload(
    screen.getByLabelText('选择 .xlsx 文件'),
    new File([bytes], '企业机会台账.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  );

  const sourceInput = screen.getByLabelText('数据来源标识（企业/账套）');
  expect(sourceInput).toHaveValue('企业机会台账');
  await user.clear(sourceInput);
  await user.type(sourceInput, '华东企业 CRM');
  await user.selectOptions(await screen.findByLabelText('持续推进对应状态'), '跟进中');
  await user.selectOptions(screen.getByLabelText('金额单位'), '万元');
  await user.click(screen.getByRole('button', { name: '开始分析' }));

  const overview = screen.getByRole('region', { name: '经营概览' });
  const projectCountMetric = within(overview).getByText('项目总数').closest('article')!;
  const amountMetric = within(overview).getByText('储备金额').closest('article')!;
  expect(screen.getByText('当前筛选 3 / 全部 3 个项目')).toBeInTheDocument();
  expect(within(projectCountMetric).getByText('3')).toBeInTheDocument();
  expect(within(amountMetric).getByText('600')).toBeInTheDocument();
  const maintenance = screen.getByRole('region', { name: '维护超期待整改' });
  expect(within(maintenance).getByText('甲方超期商机')).toBeInTheDocument();
  expect(within(maintenance).getByText('跟进超期')).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox', { name: '客户甲 1个项目' }));
  expect(screen.getByText('当前筛选 1 / 全部 3 个项目')).toBeInTheDocument();
  expect((screen.getByLabelText('经营复盘草稿') as HTMLTextAreaElement).value).toContain('客户名称：客户甲');
  await user.click(screen.getByRole('button', { name: '清除全部筛选' }));

  await user.click(screen.getByRole('checkbox', { name: '销售甲 1个项目' }));

  expect(screen.getByText('当前筛选 1 / 全部 3 个项目')).toBeInTheDocument();
  expect(within(projectCountMetric).getByText('1')).toBeInTheDocument();
  expect(within(amountMetric).getByText('100')).toBeInTheDocument();
  const report = (screen.getByLabelText('经营复盘草稿') as HTMLTextAreaElement).value;
  expect(report).toContain('销售经理：销售甲');
  expect(report).not.toContain('甲方超期商机');
  expect(report).toContain('跟进超期');
  expect(report).not.toContain('乙方正常商机');
});

it('isolates review decisions by confirmed data source instead of file name', async () => {
  const user = userEvent.setup();
  window.localStorage.clear();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目编号', '项目名称', '销售经理', '储备金额'],
    ['SAME-1', '同编号待复核项目', '销售甲', 0],
    ['SAME-1', '同编号待复核项目副本', '销售甲', 0]
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });

  render(<App />);
  const input = screen.getByLabelText('选择 .xlsx 文件');
  const setSource = async (source: string) => {
    const sourceInput = screen.getByLabelText('数据来源标识（企业/账套）');
    await user.clear(sourceInput);
    await user.type(sourceInput, source);
  };
  const analyze = async () => {
    await user.selectOptions(await screen.findByLabelText('金额单位'), '万元');
    await user.click(screen.getByRole('button', { name: '开始分析' }));
  };

  await user.upload(input, new File(['first'], '同名项目台账.xlsx'));
  await setSource('客户甲 CRM账套');
  await analyze();
  const firstReview = screen.getAllByLabelText('SAME-1 审查状态')[0];
  await user.selectOptions(firstReview, '已忽略');
  expect(firstReview).toHaveValue('已忽略');

  await user.upload(input, new File(['second'], '同名项目台账.xlsx'));
  await setSource('客户乙 CRM账套');
  await analyze();
  expect(screen.getAllByLabelText('SAME-1 审查状态')[0]).toHaveValue('待复核');

  await setSource('客户甲 CRM账套');
  expect(screen.queryByRole('heading', { name: '数据质量待复核' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '有 1 项需要确认' })).toBeInTheDocument();
  await analyze();
  expect(screen.getAllByLabelText('SAME-1 审查状态')[0]).toHaveValue('已忽略');

  await user.upload(input, new File(['renamed'], '已改名台账.xlsx'));
  await setSource('客户甲 CRM账套');
  await analyze();
  expect(screen.getAllByLabelText('SAME-1 审查状态')[0]).toHaveValue('已忽略');
});

it('requires a nonblank confirmed data source before opening the import wizard', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['项目名称'],
    ['医院数字化']
  ]), '商机表');
  vi.spyOn(workbookApi, 'inspectWorkbook').mockResolvedValue({ workbook, sheetNames: ['商机表'] });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), new File(['content'], '某企业台账.xlsx'));
  const sourceInput = screen.getByLabelText('数据来源标识（企业/账套）');
  expect(sourceInput).toHaveValue('某企业台账');
  expect(screen.getByText('同一企业或 CRM 账套每次重导请保持一致；不同企业或账套必须使用不同标识。')).toBeInTheDocument();

  await user.clear(sourceInput);

  expect(screen.getByRole('alert')).toHaveTextContent('请填写数据来源标识后继续导入。');
  expect(screen.queryByRole('heading', { name: '数据已准备好' })).not.toBeInTheDocument();
});
