import { describe, expect, it } from 'vitest';
import type { ProjectRow } from './analyze';
import {
  createProjectFingerprint,
  loadReviewRecords,
  reconcileReviewRecords,
  saveReviewRecords,
  updateReviewRecord,
  type ReviewRecordMap
} from './review';

const row: ProjectRow = {
  projectId: 'P-2026-024',
  projectName: '远景综合管廊项目',
  department: '营销三部',
  salesManager: '示例经理丙',
  status: '跟进中',
  amount: 50000,
  unit: '万元',
  createdAt: '2026-05-18',
  lastVisitAt: '2026-07-14',
  expectedSignAt: '2026-11-20',
  probability: 60
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe('review records', () => {
  it('keeps a reviewed project unchanged when its business fingerprint is unchanged', () => {
    const records = reconcileReviewRecords([row], ['P-2026-024'], {}, new Date('2026-07-17T09:00:00Z'));
    const reviewed = updateReviewRecord(records, 'P-2026-024', { status: '确认数据错误', note: '已通知销售在 CRM 更正金额。' }, new Date('2026-07-17T10:00:00Z'));
    const next = reconcileReviewRecords([row], ['P-2026-024'], reviewed, new Date('2026-07-18T09:00:00Z'));

    expect(next['P-2026-024']).toMatchObject({
      status: '确认数据错误',
      note: '已通知销售在 CRM 更正金额。',
      dataUpdated: false
    });
  });

  it('resets a changed project to pending and preserves its prior decision in history', () => {
    const reviewed = updateReviewRecord(
      reconcileReviewRecords([row], ['P-2026-024'], {}, new Date('2026-07-17T09:00:00Z')),
      'P-2026-024',
      { status: '确认业务风险', note: '等待客户预算确认。' },
      new Date('2026-07-17T10:00:00Z')
    );
    const changed = { ...row, amount: 60000 };
    const next = reconcileReviewRecords([changed], ['P-2026-024'], reviewed, new Date('2026-07-18T09:00:00Z'));

    expect(next['P-2026-024']).toMatchObject({ status: '待复核', note: '', dataUpdated: true });
    expect(next['P-2026-024'].history).toContainEqual(expect.objectContaining({
      status: '确认业务风险',
      note: '等待客户预算确认。'
    }));
    expect(createProjectFingerprint(changed)).not.toBe(createProjectFingerprint(row));
  });

  it('round-trips records through storage and ignores malformed saved values', () => {
    const storage = memoryStorage();
    const records: ReviewRecordMap = reconcileReviewRecords([row], ['P-2026-024'], {}, new Date('2026-07-17T09:00:00Z'));

    saveReviewRecords(records, storage);
    expect(loadReviewRecords(storage)).toEqual(records);

    storage.setItem('crm-project-review-assistant:review-records:v1', '{bad-json');
    expect(loadReviewRecords(storage)).toEqual({});
  });

  it('keeps historical records that do not appear in the current import', () => {
    const prior = reconcileReviewRecords([row], ['P-2026-024'], {}, new Date('2026-07-17T09:00:00Z'));
    const next = reconcileReviewRecords([], [], prior, new Date('2026-07-18T09:00:00Z'));

    expect(next['P-2026-024']).toEqual(prior['P-2026-024']);
  });
});
