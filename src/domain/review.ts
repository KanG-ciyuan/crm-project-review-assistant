import { projectKey, type ProjectRow } from './project';

export const REVIEW_STORAGE_KEY = 'crm-project-review-assistant:review-records:v1';

export type ReviewStatus = '待复核' | '确认数据错误' | '确认业务风险' | '已忽略';

export const REVIEW_STATUSES: ReviewStatus[] = ['待复核', '确认数据错误', '确认业务风险', '已忽略'];

export interface ReviewHistoryEntry {
  status: ReviewStatus;
  note: string;
  reviewedAt: string;
  fingerprint: string;
}

export interface ReviewRecord {
  projectId: string;
  projectName: string;
  status: ReviewStatus;
  note: string;
  firstReviewedAt: string;
  lastReviewedAt: string;
  fingerprint: string;
  dataUpdated: boolean;
  history: ReviewHistoryEntry[];
}

export type ReviewRecordMap = Record<string, ReviewRecord>;
export type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;

const normalized = (value: unknown) => String(value ?? '').trim();
const nowText = (now: Date) => now.toISOString();

export function createProjectFingerprint(row: ProjectRow) {
  return JSON.stringify([
    normalized(row.projectId),
    normalized(row.customerName),
    normalized(row.projectName),
    normalized(row.amount),
    normalized(row.unit),
    normalized(row.status),
    normalized(row.probabilityBand),
    normalized(row.lastFollowUpAt),
    normalized(row.expectedSignAt),
    normalized(row.createdAt),
    normalized(row.latestUpdatedAt)
  ]);
}

export function reconcileReviewRecords(
  rows: ProjectRow[],
  flaggedKeys: string[],
  previous: ReviewRecordMap,
  now: Date
): ReviewRecordMap {
  const rowByKey = new Map(rows.map((row) => [projectKey(row), row]));

  return flaggedKeys.reduce<ReviewRecordMap>((next, reviewKey) => {
    const row = rowByKey.get(reviewKey);
    if (!row) return next;

    const fingerprint = createProjectFingerprint(row);
    const prior = previous[reviewKey];

    if (!prior) {
      next[reviewKey] = {
        projectId: row.projectId || '未填写项目编号',
        projectName: row.projectName,
        status: '待复核',
        note: '',
        firstReviewedAt: nowText(now),
        lastReviewedAt: nowText(now),
        fingerprint,
        dataUpdated: false,
        history: []
      };
      return next;
    }

    if (prior.fingerprint === fingerprint) {
      next[reviewKey] = { ...prior, projectName: row.projectName };
      return next;
    }

    next[reviewKey] = {
      ...prior,
      projectId: row.projectId || '未填写项目编号',
      projectName: row.projectName,
      status: '待复核',
      note: '',
      fingerprint,
      dataUpdated: true,
      lastReviewedAt: nowText(now),
      history: [...prior.history, {
        status: prior.status,
        note: prior.note,
        reviewedAt: prior.lastReviewedAt,
        fingerprint: prior.fingerprint
      }]
    };
    return next;
  }, { ...previous });
}

export function updateReviewRecord(
  records: ReviewRecordMap,
  projectId: string,
  patch: Pick<ReviewRecord, 'status' | 'note'>,
  now: Date
): ReviewRecordMap {
  const record = records[projectId];
  if (!record) return records;

  return {
    ...records,
    [projectId]: {
      ...record,
      ...patch,
      dataUpdated: false,
      lastReviewedAt: nowText(now)
    }
  };
}

export function loadReviewRecords(storage: StorageAdapter): ReviewRecordMap {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(REVIEW_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ReviewRecordMap : {};
  } catch {
    return {};
  }
}

export function saveReviewRecords(records: ReviewRecordMap, storage: StorageAdapter) {
  storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(records));
}
