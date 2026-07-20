# Review Status Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-local human review loop so each flagged project can be classified, annotated, retained after refresh, and correctly reconsidered after a new Excel import.

**Architecture:** Keep deterministic analysis unchanged and add a separate review-record domain module. The module derives a stable fingerprint from the business fields defined in the approved design, reconciles current flagged projects with `localStorage` records, and retains a status history whenever a project changes. `App.tsx` owns the visible review state and passes it to the issue table and Markdown report; no uploaded workbook data is sent outside the browser or written back to Excel/CRM.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, browser `localStorage`, existing SheetJS workbook parser.

---

## File Structure

- Create: `src/domain/review.ts` - review status types, deterministic project fingerprinting, reconciliation, status updates, and `localStorage` serialization.
- Create: `src/domain/review.test.ts` - unit tests for persistence, unchanged imports, changed imports, and review history.
- Modify: `src/domain/report.ts` - accept review records and add the review-progress chapter without removing the human-confirmation disclaimer.
- Modify: `src/domain/report.test.ts` - verify the report separates pending, data-error, business-risk, and ignored projects.
- Modify: `src/App.tsx` - hydrate records, reconcile them after analysis, persist edits, filter by review status, and render status/note/history controls.
- Modify: `src/styles.css` - fit the new controls into the existing dense operations-table style and keep them usable on narrow screens.

### Task 1: Define review records and persistence

**Files:**
- Create: `src/domain/review.ts`
- Test: `src/domain/review.test.ts`

- [ ] **Step 1: Write the failing review-domain tests**

```ts
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
  projectId: 'P-2026-024', projectName: '远景综合管廊项目', department: '营销三部', salesManager: '示例经理丙',
  status: '跟进中', amount: 50000, unit: '万元', createdAt: '2026-05-18', lastVisitAt: '2026-07-14',
  expectedSignAt: '2026-11-20', probability: 60
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

    expect(next['P-2026-024']).toMatchObject({ status: '确认数据错误', note: '已通知销售在 CRM 更正金额。', dataUpdated: false });
  });

  it('resets a changed project to pending and preserves its prior decision in history', () => {
    const reviewed = updateReviewRecord(reconcileReviewRecords([row], ['P-2026-024'], {}, new Date('2026-07-17T09:00:00Z')), 'P-2026-024', { status: '确认业务风险', note: '等待客户预算确认。' }, new Date('2026-07-17T10:00:00Z'));
    const changed = { ...row, amount: 60000 };
    const next = reconcileReviewRecords([changed], ['P-2026-024'], reviewed, new Date('2026-07-18T09:00:00Z'));

    expect(next['P-2026-024']).toMatchObject({ status: '待复核', note: '', dataUpdated: true });
    expect(next['P-2026-024'].history).toContainEqual(expect.objectContaining({ status: '确认业务风险', note: '等待客户预算确认。' }));
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
});
```

- [ ] **Step 2: Run the tests to verify the module is absent**

Run: `npm test -- src/domain/review.test.ts`

Expected: FAIL because `./review` does not exist.

- [ ] **Step 3: Implement the minimal, browser-independent review module**

```ts
import type { ProjectRow } from './analyze';

export const REVIEW_STORAGE_KEY = 'crm-project-review-assistant:review-records:v1';
export type ReviewStatus = '待复核' | '确认数据错误' | '确认业务风险' | '已忽略';
export const REVIEW_STATUSES: ReviewStatus[] = ['待复核', '确认数据错误', '确认业务风险', '已忽略'];

export interface ReviewHistoryEntry { status: ReviewStatus; note: string; reviewedAt: string; fingerprint: string; }
export interface ReviewRecord {
  projectId: string; projectName: string; status: ReviewStatus; note: string; firstReviewedAt: string; lastReviewedAt: string;
  fingerprint: string; dataUpdated: boolean; history: ReviewHistoryEntry[];
}
export type ReviewRecordMap = Record<string, ReviewRecord>;
export type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;

const normalized = (value: unknown) => String(value ?? '').trim();
const nowText = (now: Date) => now.toISOString();

export function createProjectFingerprint(row: ProjectRow) {
  return JSON.stringify([
    normalized(row.projectId), normalized(row.amount), normalized(row.unit), normalized(row.status), normalized(row.probability),
    normalized(row.lastVisitAt), normalized(row.expectedSignAt), normalized(row.createdAt)
  ]);
}

export function reconcileReviewRecords(rows: ProjectRow[], flaggedIds: string[], previous: ReviewRecordMap, now: Date): ReviewRecordMap {
  const rowById = new Map(rows.map((row) => [row.projectId, row]));
  return flaggedIds.reduce<ReviewRecordMap>((next, projectId) => {
    const row = rowById.get(projectId);
    if (!row) return next;
    const fingerprint = createProjectFingerprint(row);
    const prior = previous[projectId];
    if (!prior) {
      next[projectId] = { projectId, projectName: row.projectName, status: '待复核', note: '', firstReviewedAt: nowText(now), lastReviewedAt: nowText(now), fingerprint, dataUpdated: false, history: [] };
      return next;
    }
    if (prior.fingerprint === fingerprint) {
      next[projectId] = { ...prior, projectName: row.projectName };
      return next;
    }
    next[projectId] = {
      ...prior, projectName: row.projectName, status: '待复核', note: '', fingerprint, dataUpdated: true, lastReviewedAt: nowText(now),
      history: [...prior.history, { status: prior.status, note: prior.note, reviewedAt: prior.lastReviewedAt, fingerprint: prior.fingerprint }]
    };
    return next;
  }, {});
}

export function updateReviewRecord(records: ReviewRecordMap, projectId: string, patch: Pick<ReviewRecord, 'status' | 'note'>, now: Date): ReviewRecordMap {
  const record = records[projectId];
  if (!record) return records;
  return { ...records, [projectId]: { ...record, ...patch, dataUpdated: false, lastReviewedAt: nowText(now) } };
}

export function loadReviewRecords(storage: StorageAdapter): ReviewRecordMap {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(REVIEW_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ReviewRecordMap : {};
  } catch { return {}; }
}

export function saveReviewRecords(records: ReviewRecordMap, storage: StorageAdapter) {
  storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(records));
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- src/domain/review.test.ts`

Expected: PASS with three review-record tests.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/domain/review.ts src/domain/review.test.ts
git commit -m "feat: add local review record workflow"
```

### Task 2: Include human review progress in Markdown reports

**Files:**
- Modify: `src/domain/report.ts`
- Modify: `src/domain/report.test.ts`

- [ ] **Step 1: Extend the failing report test with four review outcomes**

```ts
import type { ReviewRecordMap } from './review';

const reviews: ReviewRecordMap = {
  'P-2026-024': { projectId: 'P-2026-024', projectName: '远景综合管廊项目', status: '确认数据错误', note: '已通知销售修正金额。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'x', dataUpdated: false, history: [] },
  'P-2026-025': { projectId: 'P-2026-025', projectName: '云川河道治理项目', status: '确认业务风险', note: '安排本周拜访。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'y', dataUpdated: false, history: [] },
  'P-2026-026': { projectId: 'P-2026-026', projectName: '星港轨道维保项目', status: '已忽略', note: '已在专项流程处理。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'z', dataUpdated: false, history: [] }
};

it('adds grouped human-review progress while keeping the confirmation disclaimer', () => {
  const report = createReviewReport(analysis, reviews, new Date('2026-07-16'));
  expect(report).toContain('## 审查处理进度');
  expect(report).toContain('已通知销售修正金额。');
  expect(report).toContain('安排本周拜访。');
  expect(report).toContain('本期已忽略 1 个项目');
  expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
});
```

- [ ] **Step 2: Run the report test to demonstrate the signature/section gap**

Run: `npm test -- src/domain/report.test.ts`

Expected: FAIL because `createReviewReport` does not accept review records and does not render `审查处理进度`.

- [ ] **Step 3: Make report generation group by project and review status**

```ts
import { groupIssuesByProject } from './issues';
import type { ReviewRecordMap, ReviewStatus } from './review';

const reviewLine = (group: ReturnType<typeof groupIssuesByProject>[number], review: ReviewRecordMap[string]) => {
  const labels = group.issues.map((issue) => issue.label).join('、');
  return `- **${group.projectId} ${group.projectName}**：${labels}${review.note ? `。${review.note}` : ''}`;
};

function renderReviewProgress(analysis: AnalysisResult, reviews: ReviewRecordMap) {
  const groups = groupIssuesByProject(analysis.issues);
  const sections: Array<[ReviewStatus, string]> = [
    ['待复核', '待复核项目'], ['确认数据错误', '已确认数据错误项目'], ['确认业务风险', '已确认业务风险项目']
  ];
  const lines = sections.flatMap(([status, heading]) => {
    const matched = groups.filter((group) => (reviews[group.projectId]?.status ?? '待复核') === status);
    return [`### ${heading}`, matched.length ? matched.map((group) => reviewLine(group, reviews[group.projectId] ?? { note: '' } as ReviewRecordMap[string])).join('\n') : '本期无项目。'];
  });
  const ignored = groups.filter((group) => reviews[group.projectId]?.status === '已忽略');
  return [...lines, '### 已忽略项目', `本期已忽略 ${ignored.length} 个项目。`].join('\n\n');
}
```

Then change the public signature to:

```ts
export function createReviewReport(analysis: AnalysisResult, reviews: ReviewRecordMap, today: Date): string
```

Insert `## 审查处理进度` and `renderReviewProgress(analysis, reviews)` before `## 下期跟进行动`. Update the existing unit test's baseline call to pass `{}`.

- [ ] **Step 4: Run focused report tests**

Run: `npm test -- src/domain/report.test.ts`

Expected: PASS with the original disclaimer assertion and the new review-progress assertion.

- [ ] **Step 5: Commit report changes**

```bash
git add src/domain/report.ts src/domain/report.test.ts
git commit -m "feat: add review progress to markdown report"
```

### Task 3: Wire review records into the application and controls

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a failing App-level behavior test for storage-backed review state**

Create `src/App.test.tsx` and test the pure boundary through a small mocked storage adapter rather than parsing a real Excel file in jsdom:

```ts
import { describe, expect, it } from 'vitest';
import type { ProjectRow } from './domain/analyze';
import { loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord } from './domain/review';

it('retains a user-selected review status after a page-style storage reload', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const row = { projectId: 'P-1', projectName: '项目', department: '部门', salesManager: '负责人', status: '跟进中', amount: 10, unit: '万元', createdAt: '2026-07-01', lastVisitAt: '2026-07-10', expectedSignAt: '2026-08-01', probability: 50 } satisfies ProjectRow;
  const pending = reconcileReviewRecords([row], ['P-1'], {}, new Date('2026-07-17T09:00:00Z'));
  const reviewed = updateReviewRecord(pending, 'P-1', { status: '已忽略', note: '已处理。' }, new Date('2026-07-17T10:00:00Z'));
  saveReviewRecords(reviewed, storage);
  expect(loadReviewRecords(storage)['P-1']).toMatchObject({ status: '已忽略', note: '已处理。' });
});
```

- [ ] **Step 2: Run the new test before application wiring**

Run: `npm test -- src/App.test.tsx`

Expected: PASS once Task 1 is complete; this confirms the browser refresh contract before UI integration begins.

- [ ] **Step 3: Hydrate, reconcile, persist, filter, and report from `App.tsx`**

Add these imports:

```ts
import { REVIEW_STATUSES, loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord, type ReviewRecordMap, type ReviewStatus } from './domain/review';
```

Add state initialized from the browser storage and a review-status filter:

```ts
const [reviewRecords, setReviewRecords] = useState<ReviewRecordMap>(() => loadReviewRecords(window.localStorage));
const [reviewStatusFilter, setReviewStatusFilter] = useState<'全部' | ReviewStatus>('全部');
```

Replace `startAnalysis` with a version that reconciles only the currently flagged project IDs, saves the result, and uses the same records for the generated report:

```ts
function startAnalysis() {
  if (!parsed?.validation.valid) return;
  const now = new Date();
  const result = analyzeProjects(parsed.rows, thresholds, now);
  const groups = groupIssuesByProject(result.issues);
  const nextReviews = reconcileReviewRecords(result.rows, groups.map((group) => group.projectId), reviewRecords, now);
  saveReviewRecords(nextReviews, window.localStorage);
  setAnalysis(result);
  setReviewRecords(nextReviews);
  setReport(createReviewReport(result, nextReviews, now));
  setCategory('全部');
  setReviewStatusFilter('全部');
}
```

Add `changeReview` so every control change immediately persists and refreshes the report:

```ts
function changeReview(projectId: string, patch: { status?: ReviewStatus; note?: string }) {
  if (!analysis) return;
  const current = reviewRecords[projectId];
  if (!current) return;
  const next = updateReviewRecord(reviewRecords, projectId, { status: patch.status ?? current.status, note: patch.note ?? current.note }, new Date());
  saveReviewRecords(next, window.localStorage);
  setReviewRecords(next);
  setReport(createReviewReport(analysis, next, new Date()));
}
```

Filter `visibleIssueGroups` after grouping by category:

```ts
const visibleIssueGroups = useMemo(() => groupIssuesByProject(visibleIssues).filter((group) => reviewStatusFilter === '全部' || (reviewRecords[group.projectId]?.status ?? '待复核') === reviewStatusFilter), [visibleIssues, reviewRecords, reviewStatusFilter]);
```

Update the table-card heading with a second native select labelled `审查状态筛选`, and change `IssueTable` to receive `reviews` and `onChangeReview`. Its final two columns must render:

```tsx
<select value={review?.status ?? '待复核'} onChange={(event) => onChangeReview(group.projectId, { status: event.target.value as ReviewStatus })}>
  {REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}
</select>
{review?.dataUpdated && <small className="review-updated">数据已更新，待复核</small>}
<input value={review?.note ?? ''} maxLength={120} placeholder="填写处理说明（可选）" onChange={(event) => onChangeReview(group.projectId, { note: event.target.value })} />
{review?.history.at(-1) && <small className="review-history">历史：{review.history.at(-1).status}，{review.history.at(-1).note || '无说明'}</small>}
```

Do not add any network request, workbook write operation, CRM write operation, login, or cross-device synchronization.

- [ ] **Step 4: Add focused styles without changing the app's visual direction**

Append styles that keep controls compact inside the existing table:

```css
.review-control{min-width:150px;display:grid;gap:6px}.review-control select,.review-control input{width:100%;border:1px solid #cbd9d9;background:#fff;padding:7px;font-size:12px;color:#34454b}.review-updated{color:#a56a08;font-size:11px}.review-history{display:block;color:#718188;font-size:11px;line-height:1.45;white-space:normal}.table-filters{display:flex;gap:8px;flex-wrap:wrap}
@media(max-width:520px){.table-filters{margin-top:12px}.review-control{min-width:180px}}
```

Use the `.review-control` wrapper for both status and note cells. Keep the old category filter; it remains useful for distinguishing data-quality versus business-risk labels.

- [ ] **Step 5: Run the complete automated suite and production build**

Run: `npm test && npm run build`

Expected: all existing V0.1 tests plus `review.test.ts` and `App.test.tsx` pass, and Vite emits a production build successfully.

- [ ] **Step 6: Manually verify the six approved acceptance scenarios**

Run: `npm run dev -- --host 127.0.0.1`

Verify in the browser using `sample-data/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx`:

1. Select a status and note, refresh, and confirm both persist.
2. Re-upload the unchanged sample and confirm the chosen status/note remain.
3. Change one project amount or probability in a copy of the sample, re-upload, and confirm `数据已更新，待复核` plus a visible history note.
4. Confirm a project with multiple labels remains in a single row.
5. Confirm downloaded Markdown separates pending, confirmed data errors, confirmed business risks, and ignored count.
6. Confirm no browser download/upload modifies the original `.xlsx`; use browser developer network view only if a request appears unexpectedly.

- [ ] **Step 7: Commit the integrated feature**

```bash
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add local review status controls"
```

### Task 4: Final verification and handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the V0.2 boundary in the README**

Add a short `V0.2 审查闭环` section:

```md
## V0.2 审查闭环

- 审查状态和处理说明仅保存在当前浏览器；刷新页面会保留，跨浏览器和跨设备不会同步。
- 同一项目关键字段未变化时保留审查结论；变化时保留历史并回到“待复核”。
- 页面不会修改 Excel，也不会回写 CRM；业务人员仍应在 CRM 中完成真实的数据修正与跟进动作。
```

- [ ] **Step 2: Run final verification from a clean working tree**

Run: `npm test && npm run build && git status --short`

Expected: tests and build pass; status lists only the intended README change before the final commit.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain local review workflow"
```
