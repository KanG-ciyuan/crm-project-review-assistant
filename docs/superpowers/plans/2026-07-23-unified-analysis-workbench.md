# Unified Analysis Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five repeated result sections with one project-level analysis workbench that separates objective facts, manual-review findings, and operating observations, while adding concise Markdown and Excel exports.

**Architecture:** Keep the existing deterministic rule engine and `AnalysisResult` as the source of truth. Add a presentation-domain module that converts rows and findings into one stable `ProjectWorkbenchRow` per source project, derives evidence and relationships, and exposes explicit manual-review helpers used consistently by filters, storage, UI, reports, and exports. Build three focused React views inside a tabbed workspace and keep all processing local in the browser.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, SheetJS (`xlsx`), Lucide React, CSS.

---

## File Map

- Create `src/domain/workbench.ts`: classify findings, build unified project rows, calculate date evidence, related projects, counts, and review keys.
- Create `src/domain/workbench.test.ts`: project grouping, classification, dates, relationships, stable sort, and 400-row behavior.
- Modify `src/domain/rules.ts`: attach stable relationship keys to all duplicate/collision findings.
- Modify `src/domain/rules.test.ts`: verify both ends of each relationship can be joined.
- Modify `src/domain/filters.ts`: use explicit manual-review classification instead of `Finding.level`.
- Modify `src/domain/filters.test.ts`: prove objective facts do not enter the review-status filter.
- Create `src/components/AnalysisWorkspace.tsx`: accessible tab navigation and shared filtered-scope state.
- Create `src/components/AnalysisOverview.tsx`: compact KPI, department, seller, and issue-distribution overview.
- Create `src/components/ProjectIssueList.tsx`: one row per project, evidence, relationships, conditional review controls, selection, and pagination.
- Create `src/components/ReviewSummary.tsx`: on-screen concise management summary and export actions.
- Create `src/components/AnalysisWorkspace.test.tsx`: tab behavior and synchronized scope.
- Create `src/components/ProjectIssueList.test.tsx`: unified row, dates, relationships, review visibility, pagination, and selection.
- Replace `src/components/AnalysisResults.tsx`: remove the legacy five-section renderer after the workspace is integrated.
- Replace `src/components/AnalysisResults.test.tsx`: delete obsolete expectations after equivalent new component coverage is green.
- Modify `src/domain/report.ts`: generate bounded management summary without per-project detail or remediation wording.
- Modify `src/domain/report.test.ts`: fixed structure, fixed limits, review synchronization, and safe Markdown.
- Create `src/domain/projectDetailExport.ts`: create the filtered project-detail workbook.
- Create `src/domain/projectDetailExport.test.ts`: workbook schema, rows, findings, reviews, and relationships.
- Modify `src/App.tsx`: reconcile only ambiguous review keys, mount workspace, and wire Markdown/Excel downloads.
- Modify `src/App.test.tsx`: end-to-end import, tabs, filters, automatic report refresh, and downloads.
- Modify `src/review.css`: new workbench, table, evidence, relationship, summary, responsive, and pagination styles.
- Modify `src/filters.css`: align compact filter toolbar with the workbench.
- Modify `src/styles.css`: update neutral background, deep-teal accents, focus states, and responsive shell polish.
- Modify `README.md`: describe three views, review boundary, and two export formats.

## Task 1: Add Explicit Finding Classification

**Files:**
- Create: `src/domain/workbench.ts`
- Create: `src/domain/workbench.test.ts`

- [ ] **Step 1: Write failing classification tests**

```ts
import { describe, expect, it } from 'vitest';
import { findingKind, manualReviewKeys } from './workbench';
import type { Finding } from './rules';

const finding = (ruleId: string, level: Finding['level'] = 'review'): Finding => ({
  ruleId,
  rowKey: `row-${ruleId}`,
  projectId: ruleId,
  projectName: ruleId,
  customerName: '客户',
  department: '部门',
  salesManager: '销售',
  amountWan: 100,
  category: '数据质量待复核',
  label: ruleId,
  reason: '证据',
  level
});

describe('findingKind', () => {
  it('only sends ambiguous rules to manual review', () => {
    expect(findingKind(finding('follow-up-overdue', 'action'))).toBe('fact');
    expect(findingKind(finding('amount-tier-extreme', 'review'))).toBe('observation');
    expect(findingKind(finding('similar-name', 'info'))).toBe('manual');
    expect(findingKind(finding('amount-placeholder'))).toBe('manual');
  });

  it('returns unique row keys for ambiguous findings only', () => {
    expect(manualReviewKeys([
      finding('follow-up-overdue', 'action'),
      { ...finding('duplicate-project'), rowKey: 'row-manual' },
      { ...finding('similar-name', 'info'), rowKey: 'row-manual' }
    ])).toEqual(['row-manual']);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/domain/workbench.test.ts`

Expected: FAIL because `./workbench` does not exist.

- [ ] **Step 3: Implement the minimal classifier**

```ts
import type { Finding } from './rules';

export type FindingKind = 'fact' | 'manual' | 'observation';

const MANUAL_RULE_IDS = new Set([
  'duplicate-record',
  'duplicate-project',
  'cross-seller-collision',
  'similar-name',
  'amount-placeholder'
]);

const OBSERVATION_RULE_IDS = new Set([
  'probability-observation',
  'reserve-cycle'
]);

export function findingKind(finding: Finding): FindingKind {
  if (MANUAL_RULE_IDS.has(finding.ruleId)) return 'manual';
  if (finding.ruleId.startsWith('amount-tier') || OBSERVATION_RULE_IDS.has(finding.ruleId)) return 'observation';
  return 'fact';
}

export function manualReviewKeys(findings: Finding[]): string[] {
  return [...new Set(findings.filter((item) => findingKind(item) === 'manual').map((item) => item.rowKey))];
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/domain/workbench.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the classification boundary**

```bash
git add src/domain/workbench.ts src/domain/workbench.test.ts
git commit -m "feat: classify analysis findings by review need"
```

## Task 2: Make Duplicate Relationships Joinable

**Files:**
- Modify: `src/domain/rules.ts`
- Modify: `src/domain/rules.test.ts`

- [ ] **Step 1: Add failing relationship-key assertions**

Add tests that evaluate two rows for each relation and assert that both findings share one non-empty key:

```ts
it('assigns one relation key to both ends of a collision', () => {
  const rows = [
    makeProject({ sourceKey: 'a', projectId: 'A', customerName: '同一客户', projectName: '数据平台', salesManager: '销售甲' }),
    makeProject({ sourceKey: 'b', projectId: 'B', customerName: '同一客户', projectName: '数据平台', salesManager: '销售乙' })
  ];
  const related = evaluateRulePack(rows, new Date(2026, 6, 23))
    .filter((item) => item.ruleId === 'cross-seller-collision');
  expect(related).toHaveLength(2);
  expect(new Set(related.map((item) => item.relationKey)).size).toBe(1);
  expect(related[0].relationKey).toBeTruthy();
});
```

Repeat the same assertion for `duplicate-record` and `duplicate-project`.

- [ ] **Step 2: Run the rules test and verify RED**

Run: `npm test -- src/domain/rules.test.ts`

Expected: FAIL because exact duplicate and collision findings have no `relationKey`.

- [ ] **Step 3: Add stable relation keys in `evaluateDuplicates`**

Use rule-scoped keys so unrelated relation types cannot merge:

```ts
const relationFinding = (
  row: ProjectRow,
  ruleId: string,
  category: FindingCategory,
  label: string,
  reason: string,
  level: FindingLevel,
  relationKey: string
): Finding => ({ ...finding(row, ruleId, category, label, reason, level), relationKey });
```

For duplicate IDs use `duplicate-record:${normalizedProjectId}`. For normalized same-client/same-name groups use `duplicate-project:${customerKey}:${projectNameKey}` or `cross-seller-collision:${customerKey}:${projectNameKey}`. Keep the existing pair key for `similar-name`, prefixed with `similar-name:`.

- [ ] **Step 4: Run rules and regression tests**

Run: `npm test -- src/domain/rules.test.ts src/domain/analysis.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit relationship metadata**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts
git commit -m "feat: link related duplicate findings"
```

## Task 3: Build One Workbench Row Per Project

**Files:**
- Modify: `src/domain/workbench.ts`
- Modify: `src/domain/workbench.test.ts`

- [ ] **Step 1: Write failing unified-row tests**

```ts
import { buildAnalysis } from './analysis';
import { buildProjectWorkbenchRows } from './workbench';
import { makeProject } from '../test/fixtures';

it('keeps all findings and date evidence in one project row', () => {
  const row = makeProject({
    sourceKey: 'row-a',
    projectId: 'A',
    createdAt: '2026-01-01',
    lastFollowUpAt: '2026-06-01',
    expectedSignAt: '2026-07-01'
  });
  const analysis = buildAnalysis([row], [
    { ...finding('follow-up-overdue', 'action'), rowKey: 'row-a', projectId: 'A' },
    { ...finding('amount-tier-large', 'info'), rowKey: 'row-a', projectId: 'A' }
  ], new Date(2026, 6, 23));

  const rows = buildProjectWorkbenchRows(analysis);
  expect(rows).toHaveLength(1);
  expect(rows[0].findings).toHaveLength(2);
  expect(rows[0].factFindings).toHaveLength(1);
  expect(rows[0].observationFindings).toHaveLength(1);
  expect(rows[0].followUpOverdueDays).toBe(52);
  expect(rows[0].signingOverdueDays).toBe(22);
});
```

Add a relationship test where A and B share a `relationKey` and each row exposes the other project with code, name, customer, seller, and relation label. Add a 400-row test asserting 400 unique workbench rows and stable ordering.

- [ ] **Step 2: Run workbench tests and verify RED**

Run: `npm test -- src/domain/workbench.test.ts`

Expected: FAIL because `buildProjectWorkbenchRows` and the row types do not exist.

- [ ] **Step 3: Implement project-level view models**

```ts
export interface RelatedProject {
  rowKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  salesManager: string;
  relationLabel: string;
}

export interface ProjectWorkbenchRow {
  rowKey: string;
  project: ProjectRow;
  findings: Finding[];
  factFindings: Finding[];
  manualFindings: Finding[];
  observationFindings: Finding[];
  relatedProjects: RelatedProject[];
  followUpOverdueDays: number | null;
  signingOverdueDays: number | null;
  priority: number;
}
```

Implementation rules:

- Start from `analysis.rows`, keyed by `projectKey(row)`, so even projects without findings remain representable in the total scope.
- Attach all findings by `finding.rowKey`.
- Build `relationKey -> findings -> distinct row keys`, then attach peers to every row.
- Calculate days against the local calendar date represented by `analysis.generatedAt`.
- Priority order: manual finding, objective fact, observation only, no finding; then project code and source key for stable output.
- Do not merge two source rows merely because their project names match.

- [ ] **Step 4: Run workbench and project tests**

Run: `npm test -- src/domain/workbench.test.ts src/domain/project.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the unified view model**

```bash
git add src/domain/workbench.ts src/domain/workbench.test.ts
git commit -m "feat: build unified project workbench rows"
```

## Task 4: Align Filters and Review Storage With Ambiguous Findings

**Files:**
- Modify: `src/domain/filters.ts`
- Modify: `src/domain/filters.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing filter and app tests**

```ts
it('does not create review status for objective overdue findings', () => {
  const analysis = buildAnalysis([row], [objectiveOverdueFinding], new Date(2026, 6, 23));
  const options = buildFilterOptions(analysis, EMPTY_FILTERS, {});
  expect(options.reviewStatuses.every((item) => item.count === 0)).toBe(true);
});

it('creates review records only for ambiguous projects', async () => {
  // Import one overdue row and one suspected duplicate pair.
  // The overdue row must have no review select; duplicate rows must have one each.
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/domain/filters.test.ts src/App.test.tsx`

Expected: FAIL because filters and `startAnalysis` still use `level === 'review' || level === 'action'`.

- [ ] **Step 3: Replace level checks with the classifier**

In `filters.ts`, derive the actionable/manual set with:

```ts
const manualRowKeys = new Set(manualReviewKeys(analysis.findings));
```

Use this set for review-status options and matching. In `App.tsx`, change reconciliation to:

```ts
const reviewKeys = manualReviewKeys(nextFindings);
const nextReviews = reconcileReviewRecords(result.rows, reviewKeys, reviewRecords, now);
```

Keep existing localStorage records intact; merely stop rendering or filtering stale records when the current findings are not ambiguous.

- [ ] **Step 4: Run filter, review, and app tests**

Run: `npm test -- src/domain/filters.test.ts src/domain/review.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the review-boundary correction**

```bash
git add src/domain/filters.ts src/domain/filters.test.ts src/App.tsx src/App.test.tsx
git commit -m "fix: limit manual review to ambiguous findings"
```

## Task 5: Create the Three-Tab Analysis Workspace

**Files:**
- Create: `src/components/AnalysisWorkspace.tsx`
- Create: `src/components/AnalysisOverview.tsx`
- Create: `src/components/AnalysisWorkspace.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing accessible-tab tests**

```tsx
render(<AnalysisWorkspace analysis={analysis} fullCount={150} filters={EMPTY_FILTERS}
  reviews={{}} filterControls={<div>筛选工具</div>} report="摘要"
  onChangeReview={vi.fn()} onDownloadMarkdown={vi.fn()} onDownloadExcel={vi.fn()} />);

expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
  '分析总览', '项目问题清单', '复盘摘要'
]);
expect(screen.getByRole('tab', { name: '分析总览' })).toHaveAttribute('aria-selected', 'true');
await user.click(screen.getByRole('tab', { name: '项目问题清单' }));
expect(screen.getByRole('tabpanel', { name: '项目问题清单' })).toBeVisible();
expect(screen.getByText('筛选工具')).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/components/AnalysisWorkspace.test.tsx`

Expected: FAIL because the workspace components do not exist.

- [ ] **Step 3: Implement accessible tabs and overview**

Use a local union state:

```ts
type WorkspaceTab = 'overview' | 'projects' | 'summary';
```

Render `role="tablist"`, three `role="tab"` buttons with `aria-controls`, and one visible `role="tabpanel"`. `AnalysisOverview` displays exactly five primary metrics: project count, total amount, objective-problem projects, manual-review projects, and observation projects. Reuse the existing department and seller amount breakdowns and add a top issue-label distribution computed from `ProjectWorkbenchRow` data.

- [ ] **Step 4: Mount the workspace in `App.tsx`**

Replace the sequential `AnalysisFilters`, `AnalysisResults`, and editable report textarea with one `AnalysisWorkspace`. Pass `AnalysisFilters` as the project-list toolbar so its scope still drives `visibleAnalysis`, overview counts, summary, and exports.

- [ ] **Step 5: Run workspace and app tests**

Run: `npm test -- src/components/AnalysisWorkspace.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the workspace shell**

```bash
git add src/components/AnalysisWorkspace.tsx src/components/AnalysisOverview.tsx src/components/AnalysisWorkspace.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: add three-tab analysis workspace"
```

## Task 6: Implement the Unified Project Problem List

**Files:**
- Create: `src/components/ProjectIssueList.tsx`
- Create: `src/components/ProjectIssueList.test.tsx`
- Modify: `src/components/AnalysisWorkspace.tsx`
- Delete: `src/components/AnalysisResults.tsx`
- Delete: `src/components/AnalysisResults.test.tsx`

- [ ] **Step 1: Write failing one-row and evidence tests**

```tsx
it('renders one row with all findings, dates, and related projects', () => {
  render(<ProjectIssueList rows={[workbenchRow]} reviews={reviews} onChangeReview={vi.fn()} onExportSelection={vi.fn()} />);
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText(workbenchRow.project.projectName)).toBeInTheDocument();
  expect(screen.getByText('最近跟进 2026-06-01')).toBeInTheDocument();
  expect(screen.getByText('跟进超期 52 天')).toBeInTheDocument();
  expect(screen.getByText(/关联项目：B/)).toBeInTheDocument();
  expect(screen.getByText('跟进超期')).toBeInTheDocument();
  expect(screen.getByText('疑似撞单待核验')).toBeInTheDocument();
});

it('only renders review controls for manual findings', () => {
  render(<ProjectIssueList rows={[factOnlyRow, observationOnlyRow, manualRow]} reviews={reviews} onChangeReview={vi.fn()} onExportSelection={vi.fn()} />);
  expect(screen.getAllByRole('combobox')).toHaveLength(1);
  expect(screen.getByLabelText(`${manualRow.project.projectId} 审查状态`)).toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing pagination and selection tests**

```tsx
it('shows 50 projects per page and keeps selection for export', async () => {
  const rows = Array.from({ length: 120 }, (_, index) => makeWorkbenchRow(index));
  const onExportSelection = vi.fn();
  render(<ProjectIssueList rows={rows} reviews={{}} onChangeReview={vi.fn()} onExportSelection={onExportSelection} />);
  expect(screen.getAllByRole('checkbox', { name: /选择项目/ })).toHaveLength(50);
  expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
  await user.click(screen.getAllByRole('checkbox', { name: /选择项目/ })[0]);
  await user.click(screen.getByRole('button', { name: '导出所选 1 个项目' }));
  expect(onExportSelection).toHaveBeenCalledWith(new Set([rows[0].rowKey]));
});
```

- [ ] **Step 3: Run list tests and verify RED**

Run: `npm test -- src/components/ProjectIssueList.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement the fixed six-column list**

Render columns: selection, project summary, department/owner, key dates, all findings, manual judgment. Requirements:

- Project name is the only bold title; code, customer, and amount sit below it.
- Show created, latest-follow-up, and expected-sign dates with `—` for missing values.
- Show computed overdue days next to matching findings.
- Stack tag and reason as separate block lines, never side-by-side in a narrow cell.
- Render related projects directly below the corresponding manual finding.
- Review select and note input appear only when `manualFindings.length > 0`.
- Page size is the constant `50`; clamp the current page when filters reduce the row count.
- Checkboxes select export scope only and never show task/remediation language.

- [ ] **Step 5: Run list and workspace tests**

Run: `npm test -- src/components/ProjectIssueList.test.tsx src/components/AnalysisWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Remove the obsolete five-section component**

Delete `AnalysisResults.tsx` and its tests only after no imports remain:

Run: `rg "AnalysisResults" src`

Expected: no output.

- [ ] **Step 7: Commit the unified list**

```bash
git add src/components src/App.tsx
git commit -m "feat: render one analysis row per project"
```

## Task 7: Generate a Bounded Management Summary

**Files:**
- Modify: `src/domain/report.ts`
- Modify: `src/domain/report.test.ts`
- Create: `src/components/ReviewSummary.tsx`

- [ ] **Step 1: Replace linear-report tests with bounded-output tests**

```ts
it('keeps the management summary bounded for 400 projects', () => {
  const report = createReviewReport(analysisWith400Projects, reviews, reportDate);
  expect(report).toContain('## 一、总体结论');
  expect(report).toContain('## 二、优先关注事项');
  expect(report).toContain('## 三、重点部门与负责人');
  expect(report).toContain('## 四、规则分布摘要');
  expect(report).toContain('## 五、建议行动');
  expect(report).not.toContain('项目-399');
  expect(report.split('\n').length).toBeLessThan(90);
});

it('updates review counts without requiring another analysis run', () => {
  const pending = createReviewReport(analysis, pendingReviews, reportDate);
  const confirmed = createReviewReport(analysis, confirmedReviews, reportDate);
  expect(pending).not.toBe(confirmed);
  expect(confirmed).toContain('已确认业务风险 1 个');
});

it('does not use remediation workflow language', () => {
  expect(createReviewReport(analysis, reviews, reportDate)).not.toMatch(/待整改|已通知|整改截止/);
});
```

- [ ] **Step 2: Run report tests and verify RED**

Run: `npm test -- src/domain/report.test.ts`

Expected: FAIL because the report still prints every project and five legacy sections.

- [ ] **Step 3: Implement the fixed summary structure**

Generate only:

1. Up to three overall conclusions.
2. Top four issue labels by distinct project count.
3. Up to five department/seller scopes by objective/manual issue count.
4. A compact rule-distribution table.
5. Up to three deterministic suggested actions.

All dynamic text must continue through `safeMarkdownInline`. Keep the report a pure function of `analysis`, current `reviews`, date, and filter scope; do not keep a separately editable textarea state.

- [ ] **Step 4: Add the on-screen summary component**

`ReviewSummary` renders the same counts and concise sections in HTML, plus `下载复盘摘要.md` and `导出项目明细.xlsx` buttons. It must not attempt to visually render Markdown as the browser UI.

- [ ] **Step 5: Run report and summary tests**

Run: `npm test -- src/domain/report.test.ts src/components/AnalysisWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the bounded summary**

```bash
git add src/domain/report.ts src/domain/report.test.ts src/components/ReviewSummary.tsx src/components/AnalysisWorkspace.tsx
git commit -m "feat: generate concise management summaries"
```

## Task 8: Export Filtered Project Details to Excel

**Files:**
- Create: `src/domain/projectDetailExport.ts`
- Create: `src/domain/projectDetailExport.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write a failing workbook-content test**

```ts
import * as XLSX from 'xlsx';
import { createProjectDetailWorkbook } from './projectDetailExport';

it('exports one row per project with evidence, review, and relationships', () => {
  const workbook = createProjectDetailWorkbook([workbenchRow], reviews);
  expect(workbook.SheetNames).toEqual(['项目明细']);
  const output = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['项目明细']);
  expect(output).toHaveLength(1);
  expect(output[0]).toMatchObject({
    项目编码: 'A',
    项目名称: '项目A',
    最近跟进日期: '2026-06-01',
    人工判断状态: '待复核'
  });
  expect(String(output[0].全部分析结果)).toContain('跟进超期');
  expect(String(output[0].关联项目)).toContain('B');
});
```

- [ ] **Step 2: Run export test and verify RED**

Run: `npm test -- src/domain/projectDetailExport.test.ts`

Expected: FAIL because the export module does not exist.

- [ ] **Step 3: Implement the pure workbook builder**

Use `XLSX.utils.json_to_sheet` and `XLSX.utils.book_append_sheet`. Export columns for department, seller, customer, project code/name/status, amount, probability, three dates, overdue days, objective facts, manual findings, observations, related projects, review status, and note. Set the worksheet name to `项目明细` and practical column widths.

- [ ] **Step 4: Wire downloads in `App.tsx`**

Serialize with:

```ts
const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
```

Use the existing attached-anchor download pattern and a filename such as `CRM项目分析明细-2026-07-23-当前筛选.xlsx`. For checkbox selection, project the visible analysis to selected keys before building the workbook.

- [ ] **Step 5: Test both current-filter and selected-project exports**

Run: `npm test -- src/domain/projectDetailExport.test.ts src/App.test.tsx`

Expected: PASS, with one exported row per included project.

- [ ] **Step 6: Commit Excel detail export**

```bash
git add src/domain/projectDetailExport.ts src/domain/projectDetailExport.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: export filtered project detail workbook"
```

## Task 9: Apply the Approved Visual System and Responsive Layout

**Files:**
- Modify: `src/styles.css`
- Modify: `src/review.css`
- Modify: `src/filters.css`
- Modify: `src/review.css.test.ts`
- Modify: `src/filters.css.test.ts`

- [ ] **Step 1: Add failing structural style assertions**

```ts
it('defines stable workbench table and pagination dimensions', () => {
  expect(css).toContain('.workbench-tabs');
  expect(css).toContain('.project-list-table');
  expect(css).toContain('table-layout: fixed');
  expect(css).toContain('.pagination');
  expect(css).toContain('@media (max-width: 760px)');
});
```

- [ ] **Step 2: Run CSS tests and verify RED**

Run: `npm test -- src/review.css.test.ts src/filters.css.test.ts`

Expected: FAIL because the new selectors do not exist.

- [ ] **Step 3: Implement the approved visual treatment**

Use a restrained neutral palette with deep teal as the action color, not a one-hue page:

```css
:root {
  --surface: #ffffff;
  --canvas: #f3f6f6;
  --ink: #183036;
  --muted: #687d82;
  --line: #d8e2e2;
  --teal: #0c6668;
  --danger-bg: #fde9e7;
  --danger-ink: #a63e38;
  --review-bg: #fff3d6;
  --review-ink: #8a5c08;
  --observe-bg: #e8f2f5;
  --observe-ink: #376b78;
}
```

Keep cards at 0–6px radius, compact type, visible focus rings, and no gradients. On desktop use the six fixed columns from the design. At `760px` and below, transform rows into labeled blocks without allowing labels, dates, controls, or text to overlap. Keep filter popovers above the table and preserve their auto-close behavior.

- [ ] **Step 4: Run CSS and component tests**

Run: `npm test -- src/review.css.test.ts src/filters.css.test.ts src/components/ProjectIssueList.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the visual system**

```bash
git add src/styles.css src/review.css src/filters.css src/review.css.test.ts src/filters.css.test.ts
git commit -m "style: polish analysis workbench layout"
```

## Task 10: End-to-End Regression and Product Documentation

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Add an end-to-end 150-row workflow test**

Generate rows in memory rather than committing customer-like data. Assert:

- the workspace opens after import;
- the problem list shows at most 50 rows;
- a seller filter changes overview, list, report, and Excel scope together;
- changing a manual review status immediately changes the summary;
- objective facts do not show review controls;
- no legacy five-category result sections or editable report textarea remain.

- [ ] **Step 2: Run the new workflow test and verify RED if any integration is missing**

Run: `npm test -- src/App.test.tsx`

Expected: PASS only after all workspace wiring is complete.

- [ ] **Step 3: Update README usage and boundaries**

Document the three tabs, objective/manual/observation distinction, 50-row pagination, Markdown summary, Excel detail export, and the explicit absence of AI, backend, CRM write-back, notification, and remediation workflow.

- [ ] **Step 4: Run the complete automated verification**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest tests PASS and Vite production build exits successfully with no TypeScript errors.

- [ ] **Step 5: Scan for obsolete product language and placeholders**

Run:

```bash
rg -n "待整改|已通知|整改截止|经营复盘草稿|AnalysisResults|TODO|TBD" src README.md
```

Expected: no obsolete workflow/UI terms, deleted component references, or placeholders. Rule explanations may use “更新” but must not imply an in-tool workflow.

- [ ] **Step 6: Commit documentation and regression coverage**

```bash
git add src/App.test.tsx README.md
git commit -m "test: verify large analysis workbench flow"
```

## Task 11: Browser Validation With Realistic Data

**Files:**
- No committed file changes expected unless validation finds a defect.

- [ ] **Step 1: Start the local app**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite prints a local URL and remains running.

- [ ] **Step 2: Validate the 150-row sample on desktop**

Upload `/Users/kang/Documents/Codex/2026-07-20/ai-crm-ai-ai-1-2/outputs/crm-large-sample-20260723-150/CRM项目运营复盘助手-150条脱敏模拟数据.xlsx` and verify:

- one project row contains all its labels;
- dates and overdue-day evidence are readable without Excel;
- relationship entries identify the linked project;
- only ambiguous findings show review controls;
- each page contains 50 or fewer rows;
- seller filters update all three tabs and both exports.

- [ ] **Step 3: Validate responsive behavior**

Check desktop `1440x900` and mobile `390x844`. Capture screenshots and verify no horizontal text collision, clipped controls, overlapping filter menus, or unreadable labels. On mobile, horizontal scrolling is acceptable for the data table only if row-card mode cannot preserve all evidence cleanly.

- [ ] **Step 4: Validate generated files**

Open the downloaded Markdown as plain text and confirm it remains concise. Open the Excel export and confirm worksheet name `项目明细`, one row per project, and complete evidence columns.

- [ ] **Step 5: Fix defects through a fresh RED-GREEN cycle**

For every discovered defect, add a focused failing test, run it to verify RED, make the minimal fix, and rerun the focused plus full suite.

- [ ] **Step 6: Final verification commit**

```bash
git add src README.md
git commit -m "fix: complete workbench browser validation"
```

Skip this commit if validation requires no file changes.

## Final Self-Review Checklist

- [ ] Every project appears once in the problem list, even with multiple findings.
- [ ] Objective facts, manual review findings, and observations use explicit rule-ID classification.
- [ ] All duplicate, collision, and similar-name findings expose their related projects.
- [ ] Date evidence includes source dates and computed overdue days.
- [ ] Only ambiguous findings create or display review controls.
- [ ] Department and seller filters synchronize overview, list, summary, and exports.
- [ ] Pagination defaults to 50 and is verified with at least 150 and 400 rows.
- [ ] Markdown remains bounded and plain text; Excel contains full project details.
- [ ] No notifications, tasks, remediation tracking, backend, CRM API, or model API are introduced.
- [ ] All dynamic Markdown content remains escaped.
- [ ] `npm test` and `npm run build` pass.
- [ ] Desktop and mobile screenshots show no overlaps or clipped text.
