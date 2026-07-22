import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import {
  createProjectFingerprint,
  loadReviewRecords,
  reconcileReviewRecords,
  saveReviewRecords,
  updateReviewRecord,
  type ReviewRecordMap
} from './review';

const row = makeProject({
  sourceKey: 'standard:1',
  projectId: 'P-2026-024',
  projectName: '远景综合管廊项目',
  department: '营销三部',
  salesManager: '示例经理丙',
  amount: 50000,
  createdAt: '2026-05-18',
  lastFollowUpAt: '2026-07-14',
  expectedSignAt: '2026-11-20',
  probabilityBand: '中等概率'
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe('review records', () => {
  it('keeps a reviewed project unchanged when its business fingerprint is unchanged', () => {
    const records = reconcileReviewRecords([row], ['standard:1'], {}, new Date('2026-07-17T09:00:00Z'));
    const reviewed = updateReviewRecord(records, 'standard:1', { status: '确认数据错误', note: '已通知销售在 CRM 更正金额。' }, new Date('2026-07-17T10:00:00Z'));
    const next = reconcileReviewRecords([row], ['standard:1'], reviewed, new Date('2026-07-18T09:00:00Z'));

    expect(next['standard:1']).toMatchObject({
      status: '确认数据错误',
      note: '已通知销售在 CRM 更正金额。',
      dataUpdated: false
    });
  });

  it('resets a changed project to pending and preserves its prior decision in history', () => {
    const reviewed = updateReviewRecord(
      reconcileReviewRecords([row], ['standard:1'], {}, new Date('2026-07-17T09:00:00Z')),
      'standard:1',
      { status: '确认业务风险', note: '等待客户预算确认。' },
      new Date('2026-07-17T10:00:00Z')
    );
    const changed = { ...row, amount: 60000 };
    const next = reconcileReviewRecords([changed], ['standard:1'], reviewed, new Date('2026-07-18T09:00:00Z'));

    expect(next['standard:1']).toMatchObject({ status: '待复核', note: '', dataUpdated: true });
    expect(next['standard:1'].history).toContainEqual(expect.objectContaining({
      status: '确认业务风险',
      note: '等待客户预算确认。'
    }));
    expect(createProjectFingerprint(changed)).not.toBe(createProjectFingerprint(row));
  });

  it('changes the fingerprint when customer ownership or canonical status changes', () => {
    const base = { ...row, customerName: '华城医院' };
    expect(createProjectFingerprint({ ...base, customerName: '北原医院' }))
      .not.toBe(createProjectFingerprint(base));
    expect(createProjectFingerprint({ ...base, status: '呆滞' }))
      .not.toBe(createProjectFingerprint(base));
  });

  it('synchronizes a changed project ID and preserves the prior decision in history', () => {
    const reviewed = updateReviewRecord(
      reconcileReviewRecords([row], ['standard:1'], {}, new Date('2026-07-17T09:00:00Z')),
      'standard:1',
      { status: '确认业务风险', note: '等待客户预算确认。' },
      new Date('2026-07-17T10:00:00Z')
    );
    const next = reconcileReviewRecords(
      [{ ...row, projectId: 'P-2026-024-NEW' }],
      ['standard:1'],
      reviewed,
      new Date('2026-07-18T09:00:00Z')
    );

    expect(next['standard:1']).toMatchObject({
      projectId: 'P-2026-024-NEW',
      status: '待复核',
      dataUpdated: true
    });
    expect(next['standard:1'].history).toContainEqual(expect.objectContaining({
      status: '确认业务风险',
      note: '等待客户预算确认。'
    }));
  });

  it('round-trips records through storage and ignores malformed saved values', () => {
    const storage = memoryStorage();
    const records: ReviewRecordMap = reconcileReviewRecords([row], ['standard:1'], {}, new Date('2026-07-17T09:00:00Z'));

    saveReviewRecords(records, storage);
    expect(loadReviewRecords(storage)).toEqual(records);

    storage.setItem('crm-project-review-assistant:review-records:v1', '{bad-json');
    expect(loadReviewRecords(storage)).toEqual({});
  });

  it('keeps historical records that do not appear in the current import', () => {
    const prior = reconcileReviewRecords([row], ['standard:1'], {}, new Date('2026-07-17T09:00:00Z'));
    const next = reconcileReviewRecords([], [], prior, new Date('2026-07-18T09:00:00Z'));

    expect(next['standard:1']).toEqual(prior['standard:1']);
  });

  it('keeps a prior workbook decision without applying it to a different workbook source', () => {
    const first = { ...row, sourceKey: 'source:file-a:sheet:projects:id:p-1' };
    const second = { ...row, sourceKey: 'source:file-b:sheet:projects:id:p-1' };
    const firstRecords = reconcileReviewRecords([first], [first.sourceKey], {}, new Date('2026-07-17T09:00:00Z'));
    const reviewed = updateReviewRecord(firstRecords, first.sourceKey, { status: '已忽略', note: '文件 A 已确认。' }, new Date('2026-07-17T10:00:00Z'));
    const next = reconcileReviewRecords([second], [second.sourceKey], reviewed, new Date('2026-07-18T09:00:00Z'));

    expect(next[first.sourceKey]).toMatchObject({ status: '已忽略', note: '文件 A 已确认。' });
    expect(next[second.sourceKey]).toMatchObject({ status: '待复核', note: '' });
  });
});
