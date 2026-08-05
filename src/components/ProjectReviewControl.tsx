import { useId } from 'react';
import { REVIEW_STATUSES, type ReviewRecord, type ReviewStatus } from '../domain/review';

interface ProjectReviewControlProps {
  rowKey: string;
  projectLabel: string;
  review: ReviewRecord | undefined;
  onChange: (rowKey: string, patch: { status?: ReviewStatus; note?: string }) => void;
}

export function ProjectReviewControl({ rowKey, projectLabel, review, onChange }: ProjectReviewControlProps) {
  const id = useId();
  const statusId = `review-${id}`;
  const noteId = `note-${id}`;
  const latestHistory = review?.history[review.history.length - 1];

  return <div className="review-control">
    <label className="visually-hidden" htmlFor={statusId}>{projectLabel} 审查状态</label>
    <select
      id={statusId}
      aria-label={`${projectLabel} 审查状态`}
      value={review?.status ?? '待复核'}
      onChange={(event) => onChange(rowKey, { status: event.target.value as ReviewStatus })}
    >
      {REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
    {review?.dataUpdated && <small className="review-updated">数据已更新，待复核</small>}
    <label className="visually-hidden" htmlFor={noteId}>{projectLabel} 处理说明</label>
    <input
      id={noteId}
      aria-label={`${projectLabel} 处理说明`}
      value={review?.note ?? ''}
      maxLength={120}
      placeholder="填写处理说明（可选）"
      onChange={(event) => onChange(rowKey, { note: event.target.value })}
    />
    {latestHistory && <small className="review-history">历史：{latestHistory.status}，{latestHistory.note || '无说明'}</small>}
  </div>;
}
