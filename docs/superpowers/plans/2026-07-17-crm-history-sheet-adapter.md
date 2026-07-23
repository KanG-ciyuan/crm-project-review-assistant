# CRM History Sheet Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the application directly read the confirmed CRM historical project sheet, apply the user's operational rules, and present manual-stagnation and low-probability observations without treating them as data errors.

**Architecture:** Add an explicit input profile rather than weakening the existing standard-template validator. The workbook parser will recognize either the original standard headers or the CRM history headers and normalize both into one `ProjectRow` model. Analysis will distinguish hard data-quality issues, hard operating prompts, manual stagnation state, and non-alert observation leads; the report and UI will render those categories separately.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, SheetJS, browser-local storage.

---

## File Structure

- Modify: `src/domain/analyze.ts` - model `呆滞`, CRM visit intervals, probability bands, overview counts, operating prompts, and observation leads.
- Modify: `src/domain/analyze.test.ts` - prove the confirmed CRM operating rules and preserve V0.1 standard rules.
- Modify: `src/lib/workbook.ts` - recognize two input profiles, map CRM history headers, and normalize `无` to missing.
- Modify: `src/lib/workbook.test.ts` - prove CRM headers map without a user renaming columns.
- Modify: `src/domain/issues.ts` - group issue rows by a stable internal project key so multiple missing IDs cannot share one review record.
- Modify: `src/domain/report.ts` and `src/domain/report.test.ts` - report manual stagnation and observation leads separately from risks.
- Modify: `src/App.tsx`, `src/review.css`, and `src/App.test.tsx` - profile-aware labels/metrics, manual-stagnation list, observation list, and review-safe display.
- Modify: `README.md` - explain accepted CRM history input and local-only boundary.

### Task 1: Recognize and normalize the CRM history profile

**Files:**
- Modify: `src/lib/workbook.ts`
- Modify: `src/lib/workbook.test.ts`

- [ ] **Step 1: Write failing parser tests for CRM history headers**

```ts
it('recognizes the CRM history profile and normalizes its confirmed field names', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['序号', '部门', '销售经理', '创建日期', '最近拜访时间', '拜访间隔周期（天）', '项目名称', '项目编码', '项目类型', '项目状态', '行业', '区域', '成单概率', '储备金额（万元）', '预计合同签订时间', '项目等级'],
    [1, '营销一部', '销售甲', '2026-06-01', '2026-07-01', 31, '项目甲', 'CRM-001', '软件项目', '跟进中', '交通', '华东', '1%-50%', 800, '2026-07-10', 'A级'],
    [2, '营销二部', '销售乙', '2026-06-02', '2026-07-02', 2, '无', '无', '在线项目', '呆滞', '水利', '华南', '81%-100%', 120, '2026-08-10', 'B级']
  ]);
  workbook.SheetNames.push('分析表');
  workbook.Sheets['分析表'] = sheet;

  const parsed = parseSelectedSheet(workbook, '分析表');

  expect(parsed.profile).toBe('crm-history');
  expect(parsed.validation.valid).toBe(true);
  expect(parsed.rows[0]).toMatchObject({ projectId: 'CRM-001', unit: '万元', visitIntervalDays: 31, probabilityBand: '低概率', sourceKey: 'crm-history:1' });
  expect(parsed.rows[1]).toMatchObject({ projectId: '', projectName: '', status: '呆滞', probabilityBand: '临近签约' });
});
```

- [ ] **Step 2: Run the parser test and confirm it fails because the profile is unknown**

Run: `npm test -- src/lib/workbook.test.ts`

Expected: FAIL because `profile`, `visitIntervalDays`, and `probabilityBand` do not exist and CRM headers do not validate.

- [ ] **Step 3: Add explicit profile definitions and normalization**

Add these public types in `src/lib/workbook.ts` and route `findHeaderRow`, `validateHeaders`, and `parseSelectedSheet` through the selected profile:

```ts
export type InputProfile = 'standard' | 'crm-history';
const CRM_HISTORY_HEADERS = ['部门', '销售经理', '创建日期', '最近拜访时间', '拜访间隔周期（天）', '项目名称', '项目编码', '项目状态', '成单概率', '储备金额（万元）', '预计合同签订时间'] as const;

const normalizedText = (value: unknown) => {
  const text = toText(value);
  return text === '无' ? '' : text;
};

const probabilityBandFrom = (value: string) => ({
  '询价类': '低概率', '1%-50%': '低概率', '51%-70%': '中等概率', '71%-80%': '较高概率', '81%-100%': '临近签约'
}[value] ?? '未知');
```

For `crm-history`, map `项目编码` to `projectId`, `储备金额（万元）` to `amount`, set `unit: '万元'`, map `最近拜访时间`, `拜访间隔周期（天）`, and `预计合同签订时间`, and keep the original probability label plus its semantic band. Keep the original standard header behavior unchanged.

- [ ] **Step 4: Run parser tests**

Run: `npm test -- src/lib/workbook.test.ts`

Expected: PASS for standard-sheet parsing and CRM-history normalization.

- [ ] **Step 5: Commit parser support**

```bash
git add src/lib/workbook.ts src/lib/workbook.test.ts src/domain/analyze.ts
git commit -m "feat: support crm history sheet imports"
```

### Task 2: Apply confirmed operating rules without changing project status

**Files:**
- Modify: `src/domain/analyze.ts`
- Modify: `src/domain/analyze.test.ts`

- [ ] **Step 1: Write failing business-rule tests**

```ts
const crmThresholds: Thresholds = { followUpDays: 30, longReserveDays: 90, absoluteAmountLimitWan: 10000 };
const crmRow = (overrides: Partial<ProjectRow>): ProjectRow => ({
  sourceKey: `crm-history:${overrides.projectId ?? 'missing'}`,
  projectId: 'CRM-default', projectName: '脱敏项目', department: '营销一部', salesManager: '销售甲',
  status: '跟进中', amount: 100, unit: '万元', createdAt: '2026-06-01', lastVisitAt: '2026-07-01',
  visitIntervalDays: 1, expectedSignAt: '2026-08-01', probability: null, probabilityLabel: '51%-70%',
  probabilityBand: '中等概率', inputProfile: 'crm-history', ...overrides
});

it('uses CRM visit interval only for active projects and keeps manual stagnation separate', () => {
  const rows: ProjectRow[] = [
    crmRow({ projectId: 'A', status: '跟进中', visitIntervalDays: 31, expectedSignAt: '2026-08-01' }),
    crmRow({ projectId: 'B', status: '呆滞', visitIntervalDays: 90, expectedSignAt: '2026-08-01' }),
    crmRow({ projectId: 'C', status: '呆滞', visitIntervalDays: 1, expectedSignAt: '2026-07-01' }),
    crmRow({ projectId: 'D', status: '跟进中', visitIntervalDays: 1, expectedSignAt: '2026-08-01', probabilityBand: '低概率', amount: 900 })
  ];
  const result = analyzeProjects(rows, crmThresholds, new Date('2026-07-17'));

  expect(result.issues.map((issue) => [issue.projectId, issue.label])).toContainEqual(['A', '跟进停滞']);
  expect(result.issues.map((issue) => [issue.projectId, issue.label])).not.toContainEqual(['B', '跟进停滞']);
  expect(result.issues.map((issue) => [issue.projectId, issue.label])).toContainEqual(['C', '签约预期失效']);
  expect(result.manualStagnationProjects.map((row) => row.projectId)).toEqual(['B', 'C']);
  expect(result.observationProjects.map((row) => row.projectId)).toEqual(['D']);
});
```

- [ ] **Step 2: Run the analysis test and confirm it fails**

Run: `npm test -- src/domain/analyze.test.ts`

Expected: FAIL because `呆滞`, CRM visit interval, manual-stagnation results, and observation results are not modeled.

- [ ] **Step 3: Add the model and deterministic branches**

Add `呆滞` to `ProjectStatus`, then extend `ProjectRow` with:

```ts
export type ProbabilityBand = '低概率' | '中等概率' | '较高概率' | '临近签约' | '未知';
sourceKey: string;
visitIntervalDays?: number | null;
probabilityLabel?: string | null;
probabilityBand?: ProbabilityBand;
inputProfile?: 'standard' | 'crm-history';
```

Add `manualStagnationProjects` and `observationProjects` to `AnalysisResult`, and add `manualStagnationCount`, `delayedFollowUpCount`, and `overdueExpectedSignCount` to `Overview`. Keep `signedCount` and `lostCount` for standard-profile compatibility. For CRM-history rows, follow these exact rules:

```ts
if (row.status === '跟进中' && (row.visitIntervalDays ?? -1) > 30) {
  issues.push(issueFrom(row, '经营风险', '跟进停滞', `CRM 导出的拜访间隔为 ${row.visitIntervalDays} 天，超过 30 天`));
}
if ((row.status === '跟进中' || row.status === '呆滞') && expectedSignAt && expectedSignAt < today) {
  issues.push(issueFrom(row, '经营风险', '签约预期失效', '预计合同签订日期已过，请更新项目预期或状态'));
}
if (row.status === '呆滞') manualStagnationProjects.push(row);
if (row.probabilityBand === '低概率') observationProjects.push(row);
```

Sort `observationProjects` by normalized amount descending. Do not generate the prior `长期储备待复盘` or `高金额低确定性` labels for CRM-history rows. Do not modify an imported status.

Update `Issue` with `projectKey: string`, set it in `issueFrom` as `row.projectId || row.sourceKey`, and group `ProjectIssueGroup` by `projectKey`. Pass this key to local review storage instead of its display identifier. A missing project code then creates an independent, reviewable quality issue instead of merging all missing codes under `未填写项目编号`.

- [ ] **Step 4: Run focused and full analysis tests**

Run: `npm test -- src/domain/analyze.test.ts && npm test`

Expected: PASS. Existing standard-profile tests retain their old behavior; CRM-profile tests prove the confirmed rules.

- [ ] **Step 5: Commit analysis rules**

```bash
git add src/domain/analyze.ts src/domain/analyze.test.ts
git commit -m "feat: add crm operating rule analysis"
```

### Task 3: Present manual states and observation leads separately

**Files:**
- Modify: `src/domain/report.ts`
- Modify: `src/domain/report.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/review.css`

- [ ] **Step 1: Write a failing report test for separate sections**

```ts
it('reports manual stagnation and low-probability observations outside risk counts', () => {
  const report = createReviewReport(crmAnalysis, {}, new Date('2026-07-17'));
  expect(report).toContain('## 已手动标记呆滞');
  expect(report).toContain('## 低概率重点项目');
  expect(report).toContain('不代表系统自动判定异常');
});
```

- [ ] **Step 2: Run the report test and confirm it fails**

Run: `npm test -- src/domain/report.test.ts`

Expected: FAIL because the current report only renders quality issues and operating risks.

- [ ] **Step 3: Update the report and UI from the structured analysis result**

Add report helpers that render `manualStagnationProjects` and `observationProjects` as project-level lists. Keep the existing human-confirmation notice and state that observation projects are prioritization signals rather than errors.

In `App.tsx`, use the parsed profile to:

```tsx
<Metric label="跟进中" value={analysis.overview.inProgressCount} sub="项目" />
<Metric label="手动标记呆滞" value={analysis.overview.manualStagnationCount} sub="项目" />
<Metric label="跟进停滞" value={analysis.overview.delayedFollowUpCount} sub="需关注" risk />
<Metric label="签约预期失效" value={analysis.overview.overdueExpectedSignCount} sub="需更新" risk />
```

Render two independent table cards after the issue table:

```tsx
<ProjectListCard title="已手动标记呆滞" description="该状态由销售手动维护，不代表系统自动判定异常。" rows={analysis.manualStagnationProjects} />
<ProjectListCard title="低概率重点项目" description="按储备金额排序，作为人工优先复核线索，不计入经营风险数量。" rows={analysis.observationProjects} />
```

The existing review status controls apply only to grouped quality/risk issues. Do not create review records solely because a project appears in a manual-stagnation or observation list.

Replace every review-storage lookup and update in `App.tsx` from `group.projectId` to `group.projectKey`, while continuing to display `group.projectId` in the table. This keeps blank project codes isolated by their `sourceKey` and preserves normal CRM codes as the storage key.

- [ ] **Step 4: Add focused styles and run UI tests/build**

Run: `npm test && npm run build`

Expected: PASS. The main table remains horizontally scrollable on narrow screens and the two new cards do not overlap other content.

- [ ] **Step 5: Commit presentation changes**

```bash
git add src/domain/report.ts src/domain/report.test.ts src/App.tsx src/review.css
git commit -m "feat: present crm operating review sections"
```

### Task 4: Validate with a privacy-safe fixture and document the supported input

**Files:**
- Create: `sample-data/CRM历史项目表-脱敏适配样表.xlsx`
- Modify: `README.md`
- Modify: `docs/product/CRM历史项目表-字段字典与规则确认稿.md`

- [ ] **Step 1: Create a fully synthetic CRM-history fixture**

Build a workbook with the exact CRM-history header row and at least six synthetic records covering: active project with 31-day visit interval, manual stagnation, expired expected-sign date, `无` identifier, low-probability high-amount observation, and a valid ordinary project. Do not copy names, clients, project names, sales staff, dates, or amounts from the user-provided workbook.

- [ ] **Step 2: Add a fixture parsing test**

```ts
it('parses the privacy-safe CRM history fixture without manual header renaming', () => {
  const workbook = XLSX.readFile('sample-data/CRM历史项目表-脱敏适配样表.xlsx', { cellDates: true });
  const parsed = parseSelectedSheet(workbook, '分析表');
  expect(parsed.profile).toBe('crm-history');
  expect(parsed.validation.valid).toBe(true);
  expect(parsed.rows).toHaveLength(6);
});
```

- [ ] **Step 3: Document the supported input and confirm no real data is tracked**

Add a README section identifying the supported CRM sheet name and its local-only processing boundary. Verify before staging:

Run: `git status --short && git diff --cached --name-only`

Expected: the real Desktop workbook is outside the repository and never appears in the staged-file list; only the synthetic fixture and intended documentation are staged.

- [ ] **Step 4: Run final tests, production build, and browser acceptance flow**

Run: `npm test && npm run build`

In a local browser, upload the synthetic fixture and confirm:

1. The CRM-history profile validates without header edits.
2. A 31-day active project is shown as follow-up delayed.
3. A manual-stagnation project is listed separately and does not receive a visit-delay label.
4. An expired expected-sign date produces an update prompt for both statuses.
5. Low-probability projects appear in descending amount order and do not change risk counts.
6. A `无` project code/name produces a data-quality issue and does not overwrite another project's review record.

- [ ] **Step 5: Commit fixture and documentation**

```bash
git add sample-data/CRM历史项目表-脱敏适配样表.xlsx README.md docs/product/CRM历史项目表-字段字典与规则确认稿.md
git commit -m "docs: add crm history import guidance"
```
