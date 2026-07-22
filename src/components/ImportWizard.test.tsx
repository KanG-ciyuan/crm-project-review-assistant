import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RawSheetInspection } from '../lib/workbook';
import { ImportWizard } from './ImportWizard';

afterEach(cleanup);

const inspection = (matrix: unknown[][], candidateHeaderRows = [0]): RawSheetInspection => ({
  sheetName: '商机明细',
  candidateHeaderRows,
  matrix
});

describe('ImportWizard smart path', () => {
  it('shows one ready summary and starts analysis without the four-step wizard', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目编号', '项目名称', '项目状态', '成单概率', '储备金额', '金额单位', '补充说明'],
      ['A-1', '医院数改', '跟进中', 0.7, 1200, '万元', '客户等待预算']
    ])} onReady={onReady} />);

    expect(screen.getByText('已识别 6 个标准字段，1 个自定义字段，共 1 条项目数据，可以开始分析。')).toBeInTheDocument();
    expect(screen.queryByText('确认表头行')).not.toBeInTheDocument();
    expect(screen.queryByText('字段对应')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('70%对应概率')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '开始分析' }));

    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      rows: [expect.objectContaining({ projectId: 'A-1', probabilityBand: '70%', unit: '万元', customFields: { 补充说明: '客户等待预算' } })],
      source: { sheetName: '商机明细', headerRowIndex: 0 }
    }));
  });

  it('asks only for an unknown status while accepting an exact probability automatically', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '项目状态', '成单概率'],
      ['医院数改', '方案沟通', '60%']
    ])} onReady={onReady} />);

    expect(screen.getByRole('heading', { name: '有 1 项需要确认' })).toBeInTheDocument();
    expect(screen.getByLabelText('方案沟通对应状态')).toBeInTheDocument();
    expect(screen.queryByLabelText('60%对应概率')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('方案沟通对应状态'), '跟进中');
    await user.click(screen.getByRole('button', { name: '开始分析' }));

    expect(onReady.mock.calls[0][0].rows[0]).toMatchObject({ status: '跟进中', probabilityBand: '60%' });
  });

  it('asks for one amount unit when the amount column has no unit information', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '储备金额'],
      ['医院数改', 1200]
    ])} onReady={onReady} />);

    expect(screen.getByLabelText('金额单位')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('金额单位'), '万元');
    await user.click(screen.getByRole('button', { name: '开始分析' }));
    expect(onReady.mock.calls[0][0].rows[0]).toMatchObject({ amount: 1200, unit: '万元' });
  });

  it('blocks mixed amount units with a clear correction message', () => {
    render(<ImportWizard inspection={inspection([
      ['项目名称', '储备金额', '金额单位'],
      ['医院数改', 1200, '万元'],
      ['园区改造', 2, '亿元']
    ])} onReady={vi.fn()} />);

    expect(screen.getByText('检测到多个金额单位：万元、亿元')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始分析' })).toBeDisabled();
  });

  it('automatically finds a clear header below a title row', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['华东销售中心项目清单'],
      ['商机名称', '业务负责人', '项目状态'],
      ['医院数改', '销售甲', '跟进中']
    ], [0, 1, 2])} onReady={onReady} />);

    await user.click(screen.getByRole('button', { name: '开始分析' }));
    expect(onReady.mock.calls[0][0]).toMatchObject({ source: { headerRowIndex: 1 } });
  });

  it('asks only for the header row when two candidates have the same recognition score', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '部门'],
      ['商机名称', '所属部门'],
      ['医院数改', '华东部']
    ], [0, 1, 2])} onReady={onReady} />);

    expect(screen.getByLabelText('表头行')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('表头行'), '1');
    await user.click(screen.getByRole('button', { name: '开始分析' }));

    expect(onReady.mock.calls[0][0]).toMatchObject({ source: { headerRowIndex: 1 } });
    expect(onReady.mock.calls[0][0].rows[0]).toMatchObject({ projectName: '医院数改', department: '华东部' });
  });

  it('keeps recognition details collapsed and exposes skipped rule reasons on demand', async () => {
    const user = userEvent.setup();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '项目状态', '创建日期'],
      ['医院数改', '跟进中', '2026-01-01']
    ])} onReady={vi.fn()} />);

    expect(screen.queryByText('规则执行范围')).not.toBeVisible();
    await user.click(screen.getByText('查看识别详情'));
    const signingRule = screen.getByText('签约日期超期未更新').closest('li');
    expect(signingRule).not.toBeNull();
    expect(within(signingRule!).getByText('跳过：缺少预计签约日期')).toBeInTheDocument();
  });

  it('lets advanced users map an unmatched source field from recognition details', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '我司经办人'],
      ['医院数改', '销售甲']
    ])} onReady={onReady} />);

    await user.click(screen.getByText('查看识别详情'));
    await user.selectOptions(screen.getByLabelText('我司经办人字段对应'), 'salesManager');
    await user.click(screen.getByRole('button', { name: '开始分析' }));

    expect(onReady.mock.calls[0][0].rows[0]).toMatchObject({ projectName: '医院数改', salesManager: '销售甲' });
  });

  it('syncs the inferred unit after an advanced user maps an amount column', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '合同规模（万元）'],
      ['医院数改', 1200]
    ])} onReady={onReady} />);

    await user.click(screen.getByText('查看识别详情'));
    await user.selectOptions(screen.getByLabelText('合同规模（万元）字段对应'), 'amount');
    await user.click(screen.getByRole('button', { name: '开始分析' }));

    expect(onReady.mock.calls[0][0].rows[0]).toMatchObject({ amount: 1200, unit: '万元' });
  });

  it('lets advanced users rename a retained custom field', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<ImportWizard inspection={inspection([
      ['项目名称', '我司备注'],
      ['医院数改', '等待预算']
    ])} onReady={onReady} />);

    await user.click(screen.getByText('查看识别详情'));
    await user.clear(screen.getByLabelText('我司备注自定义名称'));
    await user.type(screen.getByLabelText('我司备注自定义名称'), '跟进备注');
    await user.click(screen.getByRole('button', { name: '开始分析' }));

    expect(onReady.mock.calls[0][0].rows[0].customFields).toEqual({ 跟进备注: '等待预算' });
  });
});
