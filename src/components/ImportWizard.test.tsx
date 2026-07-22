import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RawSheetInspection } from '../lib/workbook';
import { ImportWizard } from './ImportWizard';

afterEach(cleanup);

const inspection = (matrix: unknown[][]): RawSheetInspection => ({
  sheetName: '商机明细',
  candidateHeaderRows: [0],
  matrix
});

async function confirmHeaderAndFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '确认表头行' }));
  await user.click(screen.getByRole('button', { name: '确认字段关系' }));
}

describe('ImportWizard', () => {
  it('lets a user keep an unmatched source column under a custom name', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['商机名称', '业务负责人', '项目状态'],
      ['医院数改', '销售甲', '方案沟通']
    ])} onReady={onReady} />);

    await user.click(screen.getByRole('button', { name: '确认表头行' }));
    expect(screen.getByRole('heading', { name: '确认字段对应关系' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('商机名称处理方式'), 'custom');
    await user.clear(screen.getByLabelText('商机名称自定义字段名称'));
    await user.type(screen.getByLabelText('商机名称自定义字段名称'), '商机标题');
    await user.click(screen.getByRole('button', { name: '确认字段关系' }));

    expect(screen.getByRole('heading', { name: '统一状态、概率和金额单位口径' })).toBeInTheDocument();
    expect(screen.getByText('方案沟通')).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('requires every non-empty status and probability source value to be confirmed', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '项目状态', '成单概率'],
      ['医院数改', '方案沟通', '60%'],
      ['园区改造', '等待采购', '询价阶段'],
      ['空值保留', '', '']
    ])} onReady={onReady} />);

    await confirmHeaderAndFields(user);
    expect(screen.getByLabelText('方案沟通对应状态')).toBeInTheDocument();
    expect(screen.getByLabelText('等待采购对应状态')).toBeInTheDocument();
    expect(screen.getByLabelText('60%对应概率')).toBeInTheDocument();
    expect(screen.getByLabelText('询价阶段对应概率')).toBeInTheDocument();
    expect(screen.queryByLabelText('对应状态')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('方案沟通对应状态'), '跟进中');
    await user.selectOptions(screen.getByLabelText('等待采购对应状态'), '呆滞');
    await user.selectOptions(screen.getByLabelText('60%对应概率'), '中等概率');
    await user.click(screen.getByRole('button', { name: '确认状态口径' }));

    expect(screen.getByText('请确认全部非空状态、概率和金额单位原值。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始规则分析' })).not.toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('blocks a sheet containing multiple non-empty amount units', async () => {
    const user = userEvent.setup();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '储备金额', '金额单位'],
      ['医院数改', 1200, '万元'],
      ['园区改造', 2, '亿元']
    ])} onReady={vi.fn()} />);

    await confirmHeaderAndFields(user);

    expect(screen.getByText('检测到多个金额单位：万元、亿元')).toBeInTheDocument();
    expect(screen.getByText('首版仅支持同一工作表使用统一金额单位，请先在 Excel 中统一后重新导入。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认状态口径' })).toBeDisabled();
  });

  it('applies the confirmed source unit to non-empty cells and keeps blank cells unknown', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '储备金额', '金额单位'],
      ['医院数改', 1200, '千元'],
      ['园区改造', 300, '']
    ])} onReady={onReady} />);

    await confirmHeaderAndFields(user);
    await user.selectOptions(screen.getByLabelText('统一金额单位'), '万元');
    await user.click(screen.getByRole('button', { name: '确认状态口径' }));
    await user.click(screen.getByRole('button', { name: '开始规则分析' }));

    expect(onReady.mock.calls[0][0].rows.map((row: { unit: string }) => row.unit)).toEqual(['万元', '']);
  });

  it('returns canonical rows only after final confirmation', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目编号', '项目名称', '项目状态', '储备金额'],
      ['A-1', '医院数改', '推进中', 1200]
    ])} onReady={onReady} />);

    await confirmHeaderAndFields(user);
    await user.selectOptions(screen.getByLabelText('推进中对应状态'), '跟进中');
    await user.selectOptions(screen.getByLabelText('统一金额单位'), '万元');
    await user.click(screen.getByRole('button', { name: '确认状态口径' }));

    expect(screen.getByRole('heading', { name: '确认分析范围' })).toBeInTheDocument();
    expect(screen.getByText('规则执行范围')).toBeInTheDocument();
    const amountTierRule = screen.getByText('重点项目金额分档').closest('li');
    expect(amountTierRule).not.toBeNull();
    expect(within(amountTierRule!).getByText('可执行')).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '开始规则分析' }));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      rows: [expect.objectContaining({ projectId: 'A-1', status: '跟进中', amount: 1200, unit: '万元' })],
      source: { sheetName: '商机明细', headerRowIndex: 0 }
    }));
  });

  it('shows confirmed value mappings without counting parse failures as missing values', async () => {
    const user = userEvent.setup();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '项目状态', '成单概率', '储备金额', '创建日期', '最近跟进日期'],
      ['格式异常项目', '推进中', '60%', 100, '2026-13-01', '2026-07-01']
    ])} onReady={vi.fn()} />);

    await confirmHeaderAndFields(user);
    await user.selectOptions(screen.getByLabelText('推进中对应状态'), '跟进中');
    await user.selectOptions(screen.getByLabelText('60%对应概率'), '中等概率');
    await user.selectOptions(screen.getByLabelText('统一金额单位'), '万元');
    await user.click(screen.getByRole('button', { name: '确认状态口径' }));

    expect(screen.getByText('推进中 → 跟进中')).toBeInTheDocument();
    expect(screen.getByText('60% → 中等概率')).toBeInTheDocument();
    expect(screen.getByText('金额单位').closest('div')).toHaveTextContent('金额单位万元');
    expect(screen.getByText('字段值为空或未知').closest('article')).toHaveTextContent('字段值为空或未知0 条记录');
    expect(screen.getByText('格式异常').closest('article')).toHaveTextContent('格式异常1 条记录');
  });

  it('shows skipped rules with clear missing field labels', async () => {
    const user = userEvent.setup();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '项目状态', '创建日期'],
      ['医院数改', '跟进中', '2026-01-01']
    ])} onReady={vi.fn()} />);

    await confirmHeaderAndFields(user);
    await user.click(screen.getByRole('button', { name: '确认状态口径' }));

    const signingRule = screen.getByText('签约日期超期未更新').closest('li');
    expect(signingRule).not.toBeNull();
    expect(within(signingRule!).getByText('跳过：缺少预计签约日期')).toBeInTheDocument();
  });

  it('invalidates the previous analysis from every return button', async () => {
    const user = userEvent.setup();
    const onConfigurationChange = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称'],
      ['医院数改']
    ])} onReady={vi.fn()} onConfigurationChange={onConfigurationChange} />);

    await user.click(screen.getByRole('button', { name: '确认表头行' }));
    onConfigurationChange.mockClear();
    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(onConfigurationChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '确认表头行' }));
    await user.click(screen.getByRole('button', { name: '确认字段关系' }));
    onConfigurationChange.mockClear();
    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(onConfigurationChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '确认字段关系' }));
    await user.click(screen.getByRole('button', { name: '确认状态口径' }));
    onConfigurationChange.mockClear();
    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(onConfigurationChange).toHaveBeenCalledTimes(1);
  });

  it('shows source fields, sample values, mapping mode, and targets in the mapping grid', async () => {
    const user = userEvent.setup();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '补充说明'],
      ['医院数改', '客户等待预算']
    ])} onReady={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '确认表头行' }));
    const projectCard = screen.getByTestId('mapping-项目名称');
    expect(within(projectCard).getByText('项目名称', { selector: 'strong' })).toBeInTheDocument();
    expect(within(projectCard).getByText('医院数改')).toBeInTheDocument();
    expect(within(projectCard).getByLabelText('项目名称处理方式')).toHaveValue('standard');
    expect(within(projectCard).getByLabelText('项目名称标准字段')).toHaveValue('projectName');

    const customCard = screen.getByTestId('mapping-补充说明');
    expect(within(customCard).getByText('客户等待预算')).toBeInTheDocument();
    expect(within(customCard).getByLabelText('补充说明处理方式')).toHaveValue('custom');
    expect(within(customCard).getByLabelText('补充说明自定义字段名称')).toHaveValue('补充说明');
  });
});
