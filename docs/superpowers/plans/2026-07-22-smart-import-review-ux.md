# Smart Import and Review UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-step default import with a two-action smart path, preserve exact probability percentages, and make filtering, review handling, and result reading efficient at desktop and narrow widths.

**Architecture:** Add pure probability parsing and import-diagnosis functions to the domain layer, then make `ImportWizard` render either a concise ready state or only unresolved items. Keep deterministic rule evaluation and local review storage authoritative; UI components consume derived data and never infer mappings independently.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, SheetJS, CSS.

---

## File Map

- `src/domain/project.ts`: exact probability representation and display helper.
- `src/domain/mapping.ts`: automatic probability/status/unit parsing and mapping validation.
- `src/domain/importDiagnosis.ts`: classify recognition results as ready, needs confirmation, or blocked.
- `src/lib/workbook.ts`: retain enough cell-format information to distinguish ambiguous probability value `1`.
- `src/components/ImportWizard.tsx`: smart ready state, unresolved-only confirmation, collapsed details.
- `src/components/AnalysisFilters.tsx`: controlled filter menus and automatic close behavior.
- `src/components/AnalysisResults.tsx`: five-column result layout.
- `src/App.tsx`: derived report updates and smart import integration.
- `src/domain/rules.ts`, `src/domain/analysis.ts`, `src/domain/filters.ts`, `src/domain/review.ts`, `src/domain/report.ts`: consume exact probability values.
- `src/mapping.css`, `src/filters.css`, `src/review.css`: responsive visual behavior.
- Existing colocated test files: regression and acceptance coverage.

### Task 1: Preserve Exact Probability Values

**Files:**
- Modify: `src/domain/project.ts`
- Modify: `src/domain/mapping.ts`
- Modify: `src/lib/workbook.ts`
- Modify: `src/test/fixtures.ts`
- Test: `src/domain/mapping.test.ts`
- Test: `src/lib/workbook.test.ts`

- [ ] **Step 1: Write failing probability parser tests**

Add table-driven assertions covering numeric decimals, numeric percentages, text percentages, inquiry values, invalid ranges, and ambiguous `1`:

```ts
it.each([
  [0.1, { kind: 'percent', value: 10 }],
  [0.9, { kind: 'percent', value: 90 }],
  [10, { kind: 'percent', value: 10 }],
  ['70%', { kind: 'percent', value: 70 }],
  ['询价类', { kind: 'inquiry' }]
])('parses %p as an exact probability', (source, expected) => {
  expect(parseProbability(source)).toEqual(expected);
});

expect(parseProbability(101)).toEqual({ kind: 'unknown', reason: '超出0%至100%' });
expect(parseProbability(1)).toEqual({ kind: 'ambiguous', source: '1' });
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/domain/mapping.test.ts src/lib/workbook.test.ts`  
Expected: FAIL because exact probability types and `parseProbability` do not exist.

- [ ] **Step 3: Replace bands with an exact discriminated union**

Use one canonical value across the app:

```ts
export type ProjectProbability =
  | { kind: 'percent'; value: number }
  | { kind: 'inquiry' }
  | { kind: 'unknown'; reason?: string };

export const formatProbability = (value: ProjectProbability) =>
  value.kind === 'percent' ? `${value.value}%`
    : value.kind === 'inquiry' ? '询价类'
      : '未知';
```

Rename the canonical field from `probabilityBand` to `probability`, update `ProjectRow`, and export a pure parser. For raw numbers use `0 <= n < 1` as decimal probability and `1 < n <= 100` as percentage. Treat unformatted `1` as ambiguous; use worksheet cell number format to resolve explicit `1%` or `100%` when available.

- [ ] **Step 4: Update legacy workbook parsing and fixtures**

Convert old range labels only as compatibility input, not UI output. Range strings such as `1%-50%` cannot represent an exact project probability and must produce an unresolved value instead of silently choosing a band. Update fixtures to use exact values such as `{ kind: 'percent', value: 60 }`.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/domain/mapping.test.ts src/lib/workbook.test.ts`  
Expected: PASS.

Commit:

```bash
git add src/domain/project.ts src/domain/mapping.ts src/lib/workbook.ts src/test/fixtures.ts src/domain/mapping.test.ts src/lib/workbook.test.ts
git commit -m "refactor: preserve exact opportunity probability"
```

### Task 2: Update Rules, Analysis, Filters, Reviews, and Reports

**Files:**
- Modify: `src/domain/rules.ts`
- Modify: `src/domain/analysis.ts`
- Modify: `src/domain/filters.ts`
- Modify: `src/domain/review.ts`
- Modify: `src/domain/report.ts`
- Test: `src/domain/rules.test.ts`
- Test: `src/domain/analysis.test.ts`
- Test: `src/domain/filters.test.ts`
- Test: `src/domain/review.test.ts`
- Test: `src/domain/report.test.ts`

- [ ] **Step 1: Write failing domain regression tests**

Assert that inquiry and exact values at or below the existing low-probability threshold enter the observation rule, while the label and reason show exact values:

```ts
const findings = evaluateRulePack([
  makeProject({ probability: { kind: 'percent', value: 40 } }),
  makeProject({ probability: { kind: 'percent', value: 70 } }),
  makeProject({ probability: { kind: 'inquiry' } })
], today, { mappedFields: new Set(['probability']) });

expect(findings.some((item) => item.reason.includes('40%'))).toBe(true);
expect(findings.some((item) => item.reason.includes('70%'))).toBe(false);
expect(findings.some((item) => item.reason.includes('询价类'))).toBe(true);
```

Add filter/report assertions that options and exported text contain `40%`, `70%`, and `询价类`, and do not contain `中等概率` or `较高概率`.

- [ ] **Step 2: Run focused domain tests and verify failure**

Run: `npm test -- src/domain/rules.test.ts src/domain/analysis.test.ts src/domain/filters.test.ts src/domain/review.test.ts src/domain/report.test.ts`  
Expected: FAIL at old `probabilityBand` assumptions.

- [ ] **Step 3: Migrate domain consumers**

Use `formatProbability(row.probability)` for visible text and stable review fingerprints. Filter exact values by their formatted labels. Keep the existing internal observation threshold from the approved rule pack, but do not create or expose new low/middle/high categories.

```ts
const isProbabilityObservation = (value: ProjectProbability) =>
  value.kind === 'inquiry'
  || (value.kind === 'percent' && value.value >= 1 && value.value <= 50);
```

Rename filter state from `probabilityBands` to `probabilities` and update filter descriptions and option counts.

- [ ] **Step 4: Run focused tests and commit**

Run the command from Step 2.  
Expected: PASS.

Commit:

```bash
git add src/domain src/test/fixtures.ts
git commit -m "refactor: use exact probabilities across analysis"
```

### Task 3: Add Import Diagnosis and Smart Fast Path

**Files:**
- Create: `src/domain/importDiagnosis.ts`
- Create: `src/domain/importDiagnosis.test.ts`
- Modify: `src/components/ImportWizard.tsx`
- Modify: `src/components/ImportWizard.test.tsx`
- Modify: `src/mapping.css`

- [ ] **Step 1: Write failing diagnosis tests**

Cover a fully recognized standard sheet, an ambiguous header, duplicate standard targets, unknown status, missing amount unit, invalid probability, and custom fields:

```ts
const result = diagnoseImport({ inspection, headerRowIndex: 0, mappings, records });
expect(result.state).toBe('ready');
expect(result.summary).toMatchObject({ standardFields: 12, customFields: 2, rowCount: 6 });
expect(result.confirmations).toEqual([]);
```

For unresolved input assert a narrow confirmation payload such as `{ kind: 'status', source: '推进阶段' }`; confirmed items must not appear.

- [ ] **Step 2: Run diagnosis tests and verify failure**

Run: `npm test -- src/domain/importDiagnosis.test.ts src/components/ImportWizard.test.tsx`  
Expected: FAIL because diagnosis and smart-path UI do not exist.

- [ ] **Step 3: Implement the pure diagnosis model**

Define explicit output states:

```ts
export interface ImportDiagnosis {
  state: 'ready' | 'needs-confirmation' | 'blocked';
  headerRowIndex: number;
  mappings: ColumnMapping[];
  valueMappings: ValueMappings;
  confirmations: ImportConfirmation[];
  summary: { standardFields: number; customFields: number; ignoredFields: number; rowCount: number };
}
```

Auto-select a unique best header candidate, auto-accept alias mappings, auto-preserve unmatched columns as custom fields, auto-normalize known statuses and units, and add only unresolved items to `confirmations`.

- [ ] **Step 4: Replace the default four-step wizard**

Render these states:

```tsx
{diagnosis.state === 'ready' && <SmartImportReady diagnosis={diagnosis} onStart={finish} />}
{diagnosis.state === 'needs-confirmation' && <ImportConfirmations items={diagnosis.confirmations} />}
{diagnosis.state === 'blocked' && <ImportErrorList items={diagnosis.confirmations} />}
```

The ready state displays one summary sentence, a primary “开始分析” button, and a collapsed “查看识别详情” section. The confirmation state exposes only unresolved controls. Advanced mapping editing remains inside details and must not be required for the default path.

- [ ] **Step 5: Add component acceptance tests and responsive styles**

Assert a standard sheet has no “第 1 步”, “确认表头行”, or probability mapping selects; clicking “开始分析” calls `onReady`. Assert ambiguous sheets show only the relevant confirmation. Style the ready panel as a restrained work surface with stable button and summary dimensions.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- src/domain/importDiagnosis.test.ts src/components/ImportWizard.test.tsx`  
Expected: PASS.

Commit:

```bash
git add src/domain/importDiagnosis.ts src/domain/importDiagnosis.test.ts src/components/ImportWizard.tsx src/components/ImportWizard.test.tsx src/mapping.css
git commit -m "feat: add smart Excel import fast path"
```

### Task 4: Close Filter Menus After Selection

**Files:**
- Modify: `src/components/AnalysisFilters.tsx`
- Modify: `src/components/AnalysisFilters.test.tsx`
- Modify: `src/filters.css`

- [ ] **Step 1: Write failing interaction tests**

```ts
await user.click(screen.getByText('部门'));
await user.click(screen.getByLabelText('华东部'));
expect(screen.queryByRole('group', { name: '部门筛选选项' })).not.toBeVisible();
expect(screen.getByText('部门：华东部')).toBeInTheDocument();
```

Repeat for “只看”, 全选, 清空, outside click, and `Escape`; assert only one menu can be open. For amount range, assert the menu stays open while typing and closes after Enter or blur.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- src/components/AnalysisFilters.test.tsx`  
Expected: FAIL because native uncontrolled `details` remains open.

- [ ] **Step 3: Implement controlled menus**

Manage a single `openMenu` key in `AnalysisFilters`. Each `FilterGroup` receives `open`, `onOpenChange`, and an `onApplied` callback. Option, only, all, and clear actions call the existing filter change first and then `onApplied()`.

```tsx
<details open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
```

Add document pointer and key handlers with cleanup for outside click and Escape. Keep active chips as the visible persistent state.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/components/AnalysisFilters.test.tsx src/domain/filters.test.ts`  
Expected: PASS.

Commit:

```bash
git add src/components/AnalysisFilters.tsx src/components/AnalysisFilters.test.tsx src/filters.css
git commit -m "fix: close filters after applying selections"
```

### Task 5: Make Review Updates Immediate and Derived

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/domain/report.ts`
- Test: `src/domain/report.test.ts`

- [ ] **Step 1: Write failing review-loop tests**

After changing a project review status, assert local storage is updated immediately, the visible review selection changes, and regenerated current/all reports contain the new status without clicking another button. Re-import corrected CRM data and assert the deterministic finding disappears while the rule engine still reruns.

```ts
await user.selectOptions(screen.getByLabelText(/审查状态/), '确认业务风险');
expect(JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY)!)).toBeTruthy();
expect(screen.getByLabelText('经营复盘草稿')).toHaveValue(expect.stringContaining('确认业务风险'));
```

- [ ] **Step 2: Run app/report tests and verify failure**

Run: `npm test -- src/App.test.tsx src/domain/report.test.ts`  
Expected: FAIL where the editable report draft remains stale after review changes.

- [ ] **Step 3: Derive report content from current state**

Remove stale report state as the source of truth. Build current and all reports with `useMemo` from `analysis`, `visibleAnalysis`, `reviewRecords`, and filter scope. Keep export buttons bound to those derived strings. If the report textarea must stay editable, explicitly reset it when its source revision changes and test that behavior; otherwise render it read-only to guarantee automatic synchronization.

Preserve immediate `saveReviewRecords` calls and surface storage failures near the affected review control rather than claiming success.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/App.test.tsx src/domain/report.test.ts src/domain/review.test.ts`  
Expected: PASS.

Commit:

```bash
git add src/App.tsx src/App.test.tsx src/domain/report.ts src/domain/report.test.ts
git commit -m "fix: refresh review summaries after each decision"
```

### Task 6: Rebuild Result Rows as a Five-Column Responsive Layout

**Files:**
- Modify: `src/components/AnalysisResults.tsx`
- Modify: `src/components/AnalysisResults.test.tsx`
- Modify: `src/review.css`
- Test: `src/review.css.test.ts`

- [ ] **Step 1: Write failing structure and CSS contract tests**

Assert the table headers are exactly project summary, department/owner, amount, findings, and review handling. Assert project name, ID, and customer are grouped in one cell; status, note, and history are grouped in one review cell.

```ts
expect(screen.getAllByRole('columnheader').map((node) => node.textContent)).toEqual([
  '项目摘要', '部门 / 负责人', '金额', '发现的问题', '审查处理'
]);
```

Add CSS contract assertions for a wide findings track, normal wrapping, stable controls, and a narrow-screen stacked layout.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/components/AnalysisResults.test.tsx src/review.css.test.ts`  
Expected: FAIL against the existing eight-column table.

- [ ] **Step 3: Implement grouped cells and finding hierarchy**

Render each finding with the tag on its own row and the reason below:

```tsx
<div className="finding-item">
  <span className={`tag finding-${finding.level}`}>{finding.label}</span>
  <p>{finding.reason}</p>
</div>
```

Group project metadata with semantic classes and place review status, note, update warning, and latest history in one stable control stack.

- [ ] **Step 4: Add responsive CSS**

Use a five-column table at widths above `980px` with explicit widths for summary, owner, amount, findings, and review. Remove global nowrap behavior from result cells. At `980px` and below, hide the table header and display each row as a labeled vertical information block; do not nest decorative cards.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/components/AnalysisResults.test.tsx src/review.css.test.ts`  
Expected: PASS.

Commit:

```bash
git add src/components/AnalysisResults.tsx src/components/AnalysisResults.test.tsx src/review.css src/review.css.test.ts
git commit -m "fix: make analysis findings readable and responsive"
```

### Task 7: Integrated Verification

**Files:**
- No planned file changes; this task verifies the files changed in Tasks 1-6.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`  
Expected: all tests pass with no unhandled errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`  
Expected: TypeScript and Vite build succeed. Record the existing bundle-size warning separately if it remains non-blocking.

- [ ] **Step 3: Start the development server and verify in browser**

Run: `npm run dev -- --host 127.0.0.1`  
Expected: a local URL is printed and the application loads.

Verify at desktop and mobile widths:

1. Upload the standard sample and confirm only summary plus “开始分析” appears.
2. Confirm exact percentages appear without manual mapping or probability bands.
3. Apply filters and confirm each menu closes while chips remain.
4. Change a review status and confirm report output updates immediately.
5. Inspect the five-column desktop result and stacked narrow result for overlap.

- [ ] **Step 4: Handle any verification failure through its owning task**

If verification fails, do not make an untested catch-all edit. Return to the task that owns the failing behavior, add a regression assertion to its listed test file, implement the smallest fix in that task's listed source files, rerun the focused command, then rerun `npm test` and `npm run build` before committing those exact files.
