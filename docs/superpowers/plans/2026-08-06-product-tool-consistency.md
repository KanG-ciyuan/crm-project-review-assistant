# Product And Workbench Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product landing page describe the current workbench accurately, unify the worksheet selector with adjacent controls, and explain multi-label counts without changing analysis behavior.

**Architecture:** Keep all analysis and rule data unchanged. Add presentation-only derived counts inside `AnalysisOverview`, apply final control styling in the already-last-loaded theme layer, and update the static landing preview so it mirrors current terminology and report flow while remaining explicitly labelled as demonstration data.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Vite, Browser plugin.

---

### Task 1: Unify The Worksheet Selector

**Files:**
- Modify: `src/review.css.test.ts`
- Modify: `src/tool-theme.css`

- [ ] **Step 1: Write the failing style contract**

Add this assertion to the final-theme tests in `src/review.css.test.ts`:

```ts
it('renders the worksheet selector like the adjacent workbench fields', () => {
  expect(themeCss).toMatch(/\.sidebar\s+select\s*\{[\s\S]*?appearance:\s*none/);
  expect(themeCss).toMatch(/\.sidebar\s+select\s*\{[\s\S]*?background-image:/);
  expect(themeCss).toMatch(/\.source-namespace\s+input,\s*\.sidebar\s+select,\s*\.threshold\s+input\s*\{[\s\S]*?min-height:\s*42px/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/review.css.test.ts`

Expected: FAIL because the final `.sidebar select` rule does not yet set `appearance: none` or a custom arrow.

- [ ] **Step 3: Add the minimal final-theme selector styling**

Append a dedicated rule after the shared control rule in `src/tool-theme.css`:

```css
.sidebar select {
  appearance: none;
  padding-right: 36px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2369707c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-position: right 12px center;
  background-size: 14px 14px;
  background-repeat: no-repeat;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/review.css.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the selector change**

```bash
git add src/review.css.test.ts src/tool-theme.css
git commit -m "fix: unify worksheet selector styling"
```

### Task 2: Explain Multi-Label Counts

**Files:**
- Modify: `src/components/AnalysisWorkspace.test.tsx`
- Modify: `src/components/AnalysisOverview.tsx`
- Modify: `src/review.css`

- [ ] **Step 1: Write the failing behavior test**

Extend the overview test in `src/components/AnalysisWorkspace.test.tsx` with these expectations:

```ts
expect(screen.getByRole('heading', { name: '分析标签命中（可重复）' })).toBeInTheDocument();
expect(screen.getByText(/个项目命中标签，共 .* 次标签命中；同一项目可同时命中多个标签。/)).toBeInTheDocument();
expect(screen.getAllByText(/\d+ 个项目/).length).toBeGreaterThan(0);
```

Remove the old assertion for the heading `分析标签分布`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/components/AnalysisWorkspace.test.tsx`

Expected: FAIL because the old heading and `N 个` labels are still rendered.

- [ ] **Step 3: Implement derived display counts without changing rule data**

Change `LabelBreakdown` to derive a tagged-project union and the sum of per-label project counts:

```tsx
function LabelBreakdown({ items, taggedProjectCount }: { items: BreakdownItem[]; taggedProjectCount: number }) {
  const max = Math.max(...items.map((item) => item.projectCount), 1);
  const totalHits = items.reduce((sum, item) => sum + item.projectCount, 0);
  return <section className="chart-card">
    <div className="chart-card-heading">
      <h2>分析标签命中（可重复）</h2>
      {items.length > 0 && <p>{taggedProjectCount} 个项目命中标签，共 {totalHits} 次标签命中；同一项目可同时命中多个标签。</p>}
    </div>
    {items.length === 0
      ? <p className="no-issues">暂无分析标签。</p>
      : items.slice(0, 8).map((item) => <div className="bar-row" key={item.name}>
        <span>{item.name}</span><div className="track"><i style={{ width: `${(item.projectCount / max) * 100}%` }} /></div><b>{item.projectCount} 个项目</b>
      </div>)}
  </section>;
}
```

Call it with the union count already available from the filtered rows:

```tsx
<LabelBreakdown items={labels} taggedProjectCount={rows.filter((row) => row.findings.length > 0).length} />
```

- [ ] **Step 4: Add compact explanatory styling**

Add to `src/review.css` near the chart-card rules:

```css
.chart-card-heading p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- --run src/components/AnalysisWorkspace.test.tsx`

Expected: PASS, with analysis fixtures still producing the same rule findings.

- [ ] **Step 6: Commit the label explanation**

```bash
git add src/components/AnalysisWorkspace.test.tsx src/components/AnalysisOverview.tsx src/review.css
git commit -m "fix: clarify repeated analysis label counts"
```

### Task 3: Synchronize The Product Landing Preview

**Files:**
- Modify: `src/components/ProductLanding.test.tsx`
- Modify: `src/components/ProductLanding.tsx`
- Modify: `src/landing.css`

- [ ] **Step 1: Write the failing landing contract**

Add this test to `src/components/ProductLanding.test.tsx`:

```tsx
it('describes the current workbench and labels fixed values as demonstration data', () => {
  render(<ProductLanding onStart={vi.fn()} />);

  expect(screen.getAllByText('演示数据').length).toBeGreaterThan(0);
  for (const label of ['数据总览', '问题项目', '人工复核', '复盘报告']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getByText(/先预览完整报告/)).toBeInTheDocument();
  expect(screen.getByText(/下载 Markdown/)).toBeInTheDocument();
  expect(screen.getByText(/导出项目明细 Excel/)).toBeInTheDocument();
  expect(screen.queryByText('已识别 17 个标准字段，共 150 条项目数据，可以开始分析。')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/components/ProductLanding.test.tsx`

Expected: FAIL because the landing preview still uses old tab names and does not label its figures as demonstration data.

- [ ] **Step 3: Update landing terminology and report flow**

In `src/components/ProductLanding.tsx`:

- Add a visible `演示数据` label to both static workbench previews.
- Replace `已识别 17 个标准字段，共 150 条项目数据，可以开始分析。` with `已识别常用字段与项目记录，可以开始分析。`
- Replace the old preview navigation with `数据总览`, `问题项目`, `人工复核`, `复盘报告`.
- Change stage 04 copy to `业务人员确认线索与处理结论；管理层报告先预览完整内容，再下载 Markdown，并可导出项目明细 Excel。`
- Change stage 04 tags to `['人工复核', '报告预览', 'Markdown / Excel']`.
- Replace the lower preview label `本轮重点标签` with `分析标签命中（可重复）` and mark its static values as demonstration data.

- [ ] **Step 4: Align the static preview surface with the current light workbench**

In `src/landing.css`, keep the existing composition and motion but update the two preview sidebars to use the current light palette:

```css
.product-hero-workbench aside,
.product-dashboard-preview > aside {
  color: var(--home-ink);
  background: #f6f7fa;
  border-right: 1px solid var(--home-line);
}

.product-hero-workbench-brand > span,
.product-dashboard-preview > aside > div span {
  color: #fff;
  background: var(--home-blue);
  border-color: var(--home-blue);
}

.product-hero-workbench aside > p,
.product-dashboard-preview > aside small,
.product-hero-file small {
  color: var(--home-muted);
}

.product-hero-upload,
.product-dashboard-preview > aside button {
  color: #fff;
  background: var(--home-blue);
}

.product-hero-file,
.product-dashboard-preview > aside p,
.product-dashboard-preview > aside b,
.product-hero-workbench aside > b,
.product-hero-workbench aside > label {
  color: var(--home-ink);
  background: #fff;
  border-color: var(--home-line);
}

.product-hero-workbench aside > label span {
  color: var(--home-muted);
}
```

Do not change transform, transition, sticky, or IntersectionObserver behavior.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- --run src/components/ProductLanding.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the landing synchronization**

```bash
git add src/components/ProductLanding.test.tsx src/components/ProductLanding.tsx src/landing.css
git commit -m "feat: sync product landing with current workbench"
```

### Task 4: Full Verification And Browser QA

**Files:**
- Verify only; no expected production edits.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test -- --run`

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 2: Run the production build and diff check**

Run: `npm run build && git diff --check && git status --short`

Expected: build exits 0, diff check is clean, and the worktree has no uncommitted files.

- [ ] **Step 3: Verify the landing page in the Browser plugin**

Open `http://127.0.0.1:5176/` at 1440x900 and 390x844. Confirm current tab names, visible `演示数据`, light preview sidebars, preserved scroll transitions, no overflow, and no console errors or warnings.

- [ ] **Step 4: Verify the real tool flow in the Browser plugin**

Import `sample-data/CRM历史项目表-脱敏适配样表.xlsx`, start analysis, and confirm:

- worksheet selector visually matches adjacent fields;
- label heading says `分析标签命中（可重复）`;
- the six-project sample reports the distinct tagged-project count and the summed tag-hit count explicitly;
- each row uses `N 个项目`;
- report preview and existing workbench animations still operate;
- desktop and 390px mobile layouts do not overflow.

- [ ] **Step 5: Finish the branch**

Invoke `superpowers:finishing-a-development-branch`, re-run the required verification, and present the four branch integration choices without merging, pushing, or deleting until the user selects one.
