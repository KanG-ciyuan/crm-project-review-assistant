import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_STATUSES, type ReviewRecord } from '../domain/review';
import { ProjectReviewControl } from './ProjectReviewControl';

afterEach(cleanup);

function makeReview(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    projectId: 'P-1',
    projectName: '项目一',
    status: '确认业务风险',
    note: '等待负责人确认',
    firstReviewedAt: '2026-08-01T00:00:00.000Z',
    lastReviewedAt: '2026-08-02T00:00:00.000Z',
    fingerprint: 'current',
    dataUpdated: false,
    history: [],
    ...overrides
  };
}

describe('ProjectReviewControl', () => {
  it('renders controlled defaults and every review status when review is undefined', () => {
    render(<ProjectReviewControl rowKey="row / 一" projectLabel="项目一" review={undefined} onChange={vi.fn()} />);

    const status = screen.getByRole('combobox', { name: '项目一 审查状态' });
    const note = screen.getByRole('textbox', { name: '项目一 处理说明' });
    expect(status).toHaveValue('待复核');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(REVIEW_STATUSES);
    expect(note).toHaveValue('');
    expect(note).toHaveAttribute('maxlength', '120');
    expect(note).toHaveAttribute('placeholder', '填写处理说明（可选）');
    expect(status.id).not.toBe(note.id);
    expect(status.id).not.toContain(' ');
  });

  it('emits the supplied row key with only the changed status or note field', () => {
    const onChange = vi.fn();
    render(<ProjectReviewControl rowKey="row-1" projectLabel="项目一" review={makeReview()} onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox', { name: '项目一 审查状态' }), { target: { value: '已忽略' } });
    expect(onChange).toHaveBeenNthCalledWith(1, 'row-1', { status: '已忽略' });

    fireEvent.change(screen.getByRole('textbox', { name: '项目一 处理说明' }), { target: { value: '无需处理' } });
    expect(onChange).toHaveBeenLastCalledWith('row-1', { note: '无需处理' });
    expect(onChange.mock.calls.every(([, patch]) => Object.keys(patch).length === 1)).toBe(true);
  });

  it('keeps ids unique for two mounted controls with the same row key and binds each label to its own field', () => {
    render(<>
      <ProjectReviewControl rowKey="shared-row" projectLabel="项目A" review={makeReview({ status: '确认数据错误', note: 'A说明' })} onChange={vi.fn()} />
      <ProjectReviewControl rowKey="shared-row" projectLabel="项目B" review={makeReview({ status: '已忽略', note: 'B说明' })} onChange={vi.fn()} />
    </>);

    const aStatus = screen.getByRole('combobox', { name: '项目A 审查状态' });
    const bStatus = screen.getByRole('combobox', { name: '项目B 审查状态' });
    const aNote = screen.getByRole('textbox', { name: '项目A 处理说明' });
    const bNote = screen.getByRole('textbox', { name: '项目B 处理说明' });
    expect(aStatus).toHaveValue('确认数据错误');
    expect(aNote).toHaveValue('A说明');
    expect(bStatus).toHaveValue('已忽略');
    expect(bNote).toHaveValue('B说明');
    expect(new Set([aStatus.id, bStatus.id, aNote.id, bNote.id])).toHaveProperty('size', 4);
    expect(screen.getByText('项目A 审查状态', { selector: 'label' })).toHaveAttribute('for', aStatus.id);
    expect(screen.getByText('项目A 处理说明', { selector: 'label' })).toHaveAttribute('for', aNote.id);
    expect(screen.getByText('项目B 审查状态', { selector: 'label' })).toHaveAttribute('for', bStatus.id);
    expect(screen.getByText('项目B 处理说明', { selector: 'label' })).toHaveAttribute('for', bNote.id);
    expect(document.getElementById(aStatus.id)).toBe(aStatus);
    expect(document.getElementById(bStatus.id)).toBe(bStatus);
  });

  it('does not collide when row keys are empty and the literal word empty', () => {
    render(<>
      <ProjectReviewControl rowKey="" projectLabel="空键项目" review={undefined} onChange={vi.fn()} />
      <ProjectReviewControl rowKey="empty" projectLabel="字面项目" review={undefined} onChange={vi.fn()} />
    </>);

    const ids = [
      screen.getByRole('combobox', { name: '空键项目 审查状态' }).id,
      screen.getByRole('textbox', { name: '空键项目 处理说明' }).id,
      screen.getByRole('combobox', { name: '字面项目 审查状态' }).id,
      screen.getByRole('textbox', { name: '字面项目 处理说明' }).id
    ];
    expect(new Set(ids)).toHaveProperty('size', 4);
  });

  it('renders a lone-surrogate row key without throwing', () => {
    expect(() => render(<ProjectReviewControl rowKey={'\uD800'} projectLabel="异常键项目" review={undefined} onChange={vi.fn()} />)).not.toThrow();
    expect(screen.getByRole('combobox', { name: '异常键项目 审查状态' })).toBeInTheDocument();
  });

  it('immediately reflects a different project after rerender without retaining prior values', () => {
    const view = render(<ProjectReviewControl rowKey="row-a" projectLabel="项目A" review={makeReview({ status: '确认数据错误', note: 'A说明' })} onChange={vi.fn()} />);
    view.rerender(<ProjectReviewControl rowKey="row-b" projectLabel="项目B" review={makeReview({ status: '待复核', note: 'B说明' })} onChange={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: '项目A 审查状态' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '项目B 审查状态' })).toHaveValue('待复核');
    expect(screen.getByRole('textbox', { name: '项目B 处理说明' })).toHaveValue('B说明');
  });

  it('renders the latest history entry, update marker, and no-note fallback', () => {
    render(<ProjectReviewControl
      rowKey="row-1"
      projectLabel="项目一"
      review={makeReview({
        dataUpdated: true,
        history: [
          { status: '确认数据错误', note: '较早说明', reviewedAt: '2026-07-01T00:00:00.000Z', fingerprint: 'old-1' },
          { status: '已忽略', note: '', reviewedAt: '2026-07-02T00:00:00.000Z', fingerprint: 'old-2' }
        ]
      })}
      onChange={vi.fn()}
    />);

    expect(screen.getByText('数据已更新，待复核')).toBeInTheDocument();
    expect(screen.getByText('历史：已忽略，无说明')).toBeInTheDocument();
    expect(screen.queryByText(/较早说明/)).not.toBeInTheDocument();
  });
});
