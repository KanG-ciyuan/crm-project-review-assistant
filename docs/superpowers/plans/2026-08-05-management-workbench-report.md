# Management Workbench and Review Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the real CRM workbench around analysis, human review, and management output, then replace the rule-list Markdown summary with a preview-first management decision report without changing the Excel/rule engine.

**Architecture:** Keep `ReviewTool` as the only owner of imported analysis, filters, and `ReviewRecordMap`. Build one pure management-report model from the filtered `AnalysisResult`, serialize it once to Markdown, capture that string in an immutable preview snapshot, and render the snapshot as safe React text. Extract the existing review editor into one shared component so the issue list and manual-review view cannot drift or store duplicate state.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, SheetJS/xlsx, Lucide React, existing CSS.

---

## File Map

**Create:**

- `src/domain/reportSnapshot.ts` and test: immutable snapshot and stale comparison.
- `src/components/ProjectReviewControl.tsx` and test: shared controlled review editor.
- `src/components/ManualReviewList.tsx` and test: focused manual-review list.
- `src/components/ReportPreviewContent.tsx` and test: safe renderer for the owned Markdown subset.
- `src/components/ReportPreviewDrawer.tsx` and test: accessible preview drawer and focus lifecycle.

**Modify:**

- `src/domain/report.ts` and test: management report model, ranking, caps, and serializer.
- `src/components/ProjectIssueList.tsx` and test: use shared review control.
- `src/components/ReviewSummary.tsx` and test: management metrics and preview/export actions.
- `src/components/AnalysisWorkspace.tsx` and test: grouped four-view navigation.
- `src/App.tsx` and test: snapshot ownership and real import-to-download flow.
- `src/review.css`, `src/styles.css`: visual hierarchy, drawer, responsiveness, and motion.

**Do not modify:** `src/domain/rules.ts`, Excel recognition modules, `src/domain/review.ts`, `ProductLanding.tsx`, or `landing.css`.

### Task 1: Replace the Report Domain Model

**Files:** Modify `src/domain/report.ts`, `src/domain/report.test.ts`

- [ ] **Step 1: Write failing management-report tests**

```ts
it('builds a concrete management narrative', () => {
  const summary = createReviewSummary(analysis, reviews, ['部门：华东部']);
  const report = createReviewReport(analysis, reviews, reportDate, ['部门：华东部']);
  expect(summary.meta.title).toBe('储备项目经营复盘报告');
  expect(summary.executiveConclusions).toHaveLength(4);
  expect(summary.decisionItems[0]).toMatchObject({ rowKey: 'risk', reviewStatus: '确认业务风险' });
  expect(summary.priorityProjects.length).toBeLessThanOrEqual(10);
  expect(report).toMatch(/## 一、本期经营结论[\s\S]*## 二、需要管理层决策的事项[\s\S]*## 三、重点项目处理清单[\s\S]*## 四、部门责任与后续安排[\s\S]*## 五、附录：数据范围与识别规则/);
  expect(report).toContain('云岭数据中台升级');
  expect(report).toContain('待业务确认');
});

it('ranks risk before pending, excludes ignored, and uses stable tie breakers', () => {
  const summary = createReviewSummary(analysis, reviews);
  expect(summary.decisionItems.map((item) => item.rowKey)).toEqual(['risk', 'pending']);
  expect(summary.decisionItems.some((item) => item.rowKey === 'ignored')).toBe(false);
});

it('caps the body and never invents an unconfirmed cause', () => {
  const summary = createReviewSummary(manyAnalysis, manyReviews);
  const report = createReviewReport(pendingAnalysis, {}, reportDate);
  expect(summary.priorityProjects).toHaveLength(10);
  expect(summary.appendix.remainingProjects).toHaveLength(2);
  expect(report).toContain('待业务确认');
  expect(report).not.toContain('客户预算不足');
});
```

Keep and update the existing local-date, 400-row bound, and Markdown-injection tests.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/domain/report.test.ts`

Expected: FAIL because the management fields and headings do not exist.

- [ ] **Step 3: Define the model**

```ts
export interface ManagementProjectItem {
  rowKey: string; projectId: string; projectName: string; amountWan: number | null;
  stage: string; department: string; salesManager: string; evidence: string[];
  reviewStatus: ReviewStatus | '无需人工复核'; reviewConclusion: string;
  decisionQuestion: string; suggestedAction: string;
}
export interface DepartmentActionItem {
  department: string; projectCount: number; amountWan: number; mainIssue: string;
  suggestedAction: string; reviewedCount: number; pendingCount: number;
}
export interface ReviewSummaryData {
  meta: { title: string; generatedDate: string; disclaimer: string };
  scope: string[]; executiveConclusions: string[]; decisionItems: ManagementProjectItem[];
  priorityProjects: ManagementProjectItem[]; departmentActions: DepartmentActionItem[];
  appendix: { projectCount: number; totalAmountWan: number; categories: ReviewSummaryItem[];
    reviewStatuses: Array<{ status: ReviewStatus; count: number }>;
    remainingProjects: ManagementProjectItem[] };
}
```

- [ ] **Step 4: Implement deterministic ranking and safe actions**

```ts
const statusRank = { 确认业务风险: 0, 待复核: 1, 确认数据错误: 2, 已忽略: 3, 无需人工复核: 4 } as const;
const conclusion = (status: ReviewStatus | '无需人工复核', note: string) =>
  status === '待复核' ? '待业务确认' : status === '无需人工复核' ? '基于客观规则识别，无需人工复核' : note.trim() || `${status}，未填写处理说明`;
const action = (status: ReviewStatus | '无需人工复核') =>
  status === '确认业务风险' ? '请管理层确认继续推进、调整阶段或暂停跟进。'
    : status === '确认数据错误' ? '请责任部门修正源数据并重新导入验证。'
      : status === '待复核' ? '请责任部门补充真实原因并完成人工复核。'
        : status === '已忽略' ? '保留本次复核记录，无需继续处理。'
          : '请责任部门核对客观证据并更新 CRM。';
```

Build items from `buildProjectWorkbenchRows`. Decision items are `确认业务风险` or `待复核`; order by rank, amount descending with null last, then project ID and `rowKey`. Priority projects add non-ignored objective-action rows, de-duplicate, and slice to 10.

- [ ] **Step 5: Serialize the same model**

Generate exactly five headings, project decision blocks, the seven-column project table, department action bullets, and appendix counts. Pass every imported/user string through `safeMarkdownInline`; use explicit empty-state lines. Keep `createReviewSummary` and `createReviewReport` as the public entry points.

- [ ] **Step 6: Run and commit**

Run: `npm test -- src/domain/report.test.ts`

Expected: PASS, including safety and bounded-length coverage.

```bash
git add src/domain/report.ts src/domain/report.test.ts
git commit -m "feat: generate management review reports"
```

---

### Task 2: Add Immutable Preview Snapshots

**Files:** Create `src/domain/reportSnapshot.ts`, `src/domain/reportSnapshot.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('captures exact markdown and detects stale sources', () => {
  const now = new Date('2026-08-05T04:00:00.000Z');
  const snapshot = createReportSnapshot('# 报告', 'sig-1', now);
  expect(snapshot).toEqual({ markdown: '# 报告', fileName: '储备项目经营复盘-2026-08-05-当前筛选.md', generatedAt: now.toISOString(), sourceSignature: 'sig-1' });
  expect(isReportSnapshotStale(snapshot, 'sig-1')).toBe(false);
  expect(isReportSnapshotStale(snapshot, 'sig-2')).toBe(true);
});
```

- [ ] **Step 2: Verify missing module**

Run: `npm test -- src/domain/reportSnapshot.test.ts`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement**

```ts
export interface ReportPreviewSnapshot { markdown: string; fileName: string; generatedAt: string; sourceSignature: string }
export function createReportSnapshot(markdown: string, sourceSignature: string, now: Date): ReportPreviewSnapshot {
  return { markdown, fileName: `储备项目经营复盘-${formatLocalDate(now)}-当前筛选.md`, generatedAt: now.toISOString(), sourceSignature };
}
export const isReportSnapshotStale = (snapshot: ReportPreviewSnapshot | null, signature: string) => snapshot !== null && snapshot.sourceSignature !== signature;
```

- [ ] **Step 4: Run and commit**

Run: `npm test -- src/domain/reportSnapshot.test.ts`

Expected: PASS.

```bash
git add src/domain/reportSnapshot.ts src/domain/reportSnapshot.test.ts
git commit -m "feat: add immutable report preview snapshots"
```

---

### Task 3: Extract the Shared Review Control

**Files:** Create `ProjectReviewControl.tsx` and test; modify `ProjectIssueList.tsx` and test.

- [ ] **Step 1: Write failing project-key isolation test**

```tsx
const view = render(<ProjectReviewControl rowKey="cloud" projectLabel="CLOUD" review={review('待复核', '云岭说明')} onChange={onChange} />);
await user.type(screen.getByLabelText('CLOUD 处理说明'), '新结论');
expect(onChange).toHaveBeenLastCalledWith('cloud', { note: '云岭说明新结论' });
view.rerender(<ProjectReviewControl rowKey="morning" projectLabel="MORNING" review={review('确认业务风险', '晨光结论')} onChange={onChange} />);
expect(screen.getByLabelText('MORNING 处理说明')).toHaveValue('晨光结论');
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/components/ProjectReviewControl.test.tsx`

Expected: FAIL with missing component.

- [ ] **Step 3: Implement the controlled component**

```tsx
export function ProjectReviewControl({ rowKey, projectLabel, review, onChange }: Props) {
  const latest = review?.history[review.history.length - 1];
  return <div className="review-control">
    <select aria-label={`${projectLabel} 审查状态`} value={review?.status ?? '待复核'} onChange={(e) => onChange(rowKey, { status: e.target.value as ReviewStatus })}>{REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
    <input aria-label={`${projectLabel} 处理说明`} value={review?.note ?? ''} maxLength={120} placeholder="填写处理说明（可选）" onChange={(e) => onChange(rowKey, { note: e.target.value })} />
    {latest && <small className="review-history">历史：{latest.status}，{latest.note || '无说明'}</small>}
  </div>;
}
```

- [ ] **Step 4: Reuse it in `ProjectIssueList`**

```tsx
{row.manualFindings.length > 0
  ? <ProjectReviewControl rowKey={row.rowKey} projectLabel={projectLabel} review={review} onChange={onChangeReview} />
  : <span className="information-state">无需人工判断</span>}
```

Remove duplicate option/history markup.

- [ ] **Step 5: Run and commit**

Run: `npm test -- src/components/ProjectReviewControl.test.tsx src/components/ProjectIssueList.test.tsx`

Expected: PASS; pagination, evidence, selection, and export stay green.

```bash
git add src/components/ProjectReviewControl.tsx src/components/ProjectReviewControl.test.tsx src/components/ProjectIssueList.tsx src/components/ProjectIssueList.test.tsx
git commit -m "refactor: share project review controls"
```

---

### Task 4: Add Manual Review and Grouped Navigation

**Files:** Create `ManualReviewList.tsx` and test; modify `AnalysisWorkspace.tsx` and test.

- [ ] **Step 1: Write failing focused-review test**

```tsx
render(<ManualReviewList rows={[objectiveRow, cloudRow, morningRow]} reviews={{ cloud: review('待复核', '云岭说明'), morning: review('确认业务风险', '晨光说明') }} onChangeReview={onChangeReview} />);
expect(screen.queryByText('客观事实项目')).not.toBeInTheDocument();
expect(screen.getByLabelText('CLOUD 处理说明')).toHaveValue('云岭说明');
expect(screen.getByLabelText('MORNING 处理说明')).toHaveValue('晨光说明');
```

- [ ] **Step 2: Implement focused list**

Filter `rows` by `manualFindings.length > 0`, calculate pending count from the supplied `reviews`, and render one article per `rowKey` with project identity, manual evidence, and `ProjectReviewControl`. Return “当前筛选范围没有需要人工复核的项目” when empty.

- [ ] **Step 3: Write grouped-navigation tests**

```tsx
expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['数据总览', '问题项目1', '人工复核1', '复盘报告']);
for (const group of ['分析', '处理', '输出']) expect(screen.getByText(group)).toBeInTheDocument();
```

Extend ArrowLeft/Right, Home, and End coverage across all four tabs.

- [ ] **Step 4: Implement grouped views**

```ts
type WorkspaceTab = 'overview' | 'projects' | 'reviews' | 'summary';
const tabs = [
  { id: 'overview', label: '数据总览', group: '分析' },
  { id: 'projects', label: '问题项目', group: '分析' },
  { id: 'reviews', label: '人工复核', group: '处理' },
  { id: 'summary', label: '复盘报告', group: '输出' }
] satisfies Array<{ id: WorkspaceTab; label: string; group: '分析' | '处理' | '输出' }>;
```

Use the same `rows`, `reviews`, and `onChangeReview` in `ManualReviewList`. Add real count spans only for projects and reviews. Do not add local review state.

- [ ] **Step 5: Run and commit**

Run: `npm test -- src/components/ManualReviewList.test.tsx src/components/AnalysisWorkspace.test.tsx`

Expected: PASS; four accessible views share one review map.

```bash
git add src/components/ManualReviewList.tsx src/components/ManualReviewList.test.tsx src/components/AnalysisWorkspace.tsx src/components/AnalysisWorkspace.test.tsx
git commit -m "feat: organize analysis and manual review views"
```

---

### Task 5: Render the Snapshot Safely

**Files:** Create `ReportPreviewContent.tsx`, `ReportPreviewContent.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

```tsx
render(<ReportPreviewContent markdown={'# 标题\n\n> 边界说明\n\n- 第一条\n\n| 项目 | 金额 |\n|---|---:|\n| 云岭 | 2,800 万 |'} />);
expect(screen.getByRole('heading', { level: 1, name: '标题' })).toBeInTheDocument();
expect(screen.getByRole('listitem', { name: '第一条' })).toBeInTheDocument();
expect(screen.getByRole('table')).toBeInTheDocument();
```

Add a second test with `<script>` and `<img>` strings and assert no such DOM nodes exist.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/components/ReportPreviewContent.test.tsx`

Expected: FAIL with missing component.

- [ ] **Step 3: Implement an owned-subset parser**

```tsx
const cells = (line: string) => line.slice(1, -1).split('|').map((value) => value.trim());
const isDivider = (line: string) => /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line);

export function ReportPreviewContent({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (line.startsWith('# ')) { blocks.push(<h1 key={index}>{line.slice(2)}</h1>); index += 1; continue; }
    if (line.startsWith('## ')) { blocks.push(<h2 key={index}>{line.slice(3)}</h2>); index += 1; continue; }
    if (line.startsWith('### ')) { blocks.push(<h3 key={index}>{line.slice(4)}</h3>); index += 1; continue; }
    if (line.startsWith('> ')) { blocks.push(<blockquote key={index}>{line.slice(2)}</blockquote>); index += 1; continue; }
    if (line.startsWith('- ')) {
      const start = index; const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) items.push(lines[index++].trim().slice(2));
      blocks.push(<ul key={start}>{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>); continue;
    }
    if (line.startsWith('|') && index + 1 < lines.length && isDivider(lines[index + 1].trim())) {
      const start = index; const headings = cells(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(cells(lines[index++].trim()));
      blocks.push(<div className="report-table-scroll" key={start}><table><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    blocks.push(<p key={index}>{line}</p>); index += 1;
  }
  return <div className="report-preview-content">{blocks}</div>;
}
```

Never use `dangerouslySetInnerHTML` or a third-party HTML renderer.

- [ ] **Step 4: Run and commit**

Run: `npm test -- src/components/ReportPreviewContent.test.tsx`

Expected: PASS.

```bash
git add src/components/ReportPreviewContent.tsx src/components/ReportPreviewContent.test.tsx
git commit -m "feat: render report previews safely"
```

---

### Task 6: Add Preview Drawer and Summary Entry

**Files:** Create `ReportPreviewDrawer.tsx` and test; modify `ReviewSummary.tsx` and test.

- [ ] **Step 1: Write failing drawer tests**

```tsx
renderDrawer({ stale: true, onDownload });
expect(screen.getByRole('status')).toHaveTextContent('数据已更新，请重新生成预览');
await user.click(screen.getByRole('button', { name: '下载 Markdown' }));
expect(onDownload).toHaveBeenCalledWith(snapshot);
```

Add tests for header close, footer close, Escape, visible backdrop, initial close-button focus, trigger focus restoration, and background `inert` restoration.

- [ ] **Step 2: Implement drawer contract**

```ts
interface Props {
  snapshot: ReportPreviewSnapshot; stale: boolean; downloaded: boolean;
  downloadError: string;
  onClose: () => void; onRegenerate: () => void;
  onDownload: (snapshot: ReportPreviewSnapshot) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  backgroundRef: RefObject<HTMLElement | null>;
}
```

Use a document Escape listener. On mount focus the header close button and set `backgroundRef.current.inert = true`; restore both inert state and trigger focus during cleanup. Render one backdrop button and one `role="dialog"` aside containing `ReportPreviewContent`, stale notice, close, regenerate, and snapshot-download buttons. When `downloadError` is non-empty, show it in a `role="alert"` region without closing the drawer.

- [ ] **Step 3: Write preview-first summary test**

```tsx
expect(screen.getByText('待决策事项')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '预览完整报告' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '导出项目明细.xlsx' })).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /下载.*\.md/ })).not.toBeInTheDocument();
```

- [ ] **Step 4: Rewrite `ReviewSummary`**

Accept `summary`, `onPreview`, `onDownloadExcel`, and `previewButtonRef`. Render analysis project count, decision item count, top-project count, `executiveConclusions`, and the two actions. Markdown download exists only inside the drawer.

- [ ] **Step 5: Run and commit**

Run: `npm test -- src/components/ReportPreviewDrawer.test.tsx src/components/ReviewSummary.test.tsx`

Expected: PASS for four close paths, focus, inert background, snapshot download, and preview-first summary.

```bash
git add src/components/ReportPreviewDrawer.tsx src/components/ReportPreviewDrawer.test.tsx src/components/ReviewSummary.tsx src/components/ReviewSummary.test.tsx
git commit -m "feat: add preview-first management report UI"
```

---

### Task 7: Integrate With the Real Application

**Files:** Modify `src/App.tsx`, `src/App.test.tsx`, `AnalysisWorkspace.tsx`, and its test.

- [ ] **Step 1: Write failing real-flow tests**

```tsx
await importManualReviewWorkbook(user);
await user.click(screen.getByRole('tab', { name: /人工复核/ }));
await user.selectOptions(screen.getByLabelText('CLOUD 审查状态'), '确认业务风险');
await user.type(screen.getByLabelText('CLOUD 处理说明'), '需管理层确认是否继续推进');
await user.selectOptions(screen.getByLabelText('MORNING 审查状态'), '确认数据错误');
await user.type(screen.getByLabelText('MORNING 处理说明'), '阶段字段录入错误');
expect(screen.getByLabelText('CLOUD 处理说明')).toHaveValue('需管理层确认是否继续推进');
expect(screen.getByLabelText('MORNING 处理说明')).toHaveValue('阶段字段录入错误');
await user.click(screen.getByRole('tab', { name: '复盘报告' }));
await user.click(screen.getByRole('button', { name: '预览完整报告' }));
expect(within(screen.getByRole('dialog')).getByText('需管理层确认是否继续推进')).toBeInTheDocument();
```

Add a stale flow: open, close, change a review, reopen, see old text plus stale notice, regenerate, then see new text. Keep landing, feedback, storage failure, filters, and Excel export tests.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/App.test.tsx src/components/AnalysisWorkspace.test.tsx`

Expected: FAIL because snapshot state is not connected.

- [ ] **Step 3: Add state and refs in `ReviewTool`**

```tsx
const [reportSnapshot, setReportSnapshot] = useState<ReportPreviewSnapshot | null>(null);
const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
const [downloadConfirmed, setDownloadConfirmed] = useState(false);
const [reportDownloadError, setReportDownloadError] = useState('');
const previewButtonRef = useRef<HTMLButtonElement | null>(null);
const toolContentRef = useRef<HTMLDivElement | null>(null);
const reportSourceSignature = currentReport;
const reportStale = isReportSnapshotStale(reportSnapshot, reportSourceSignature);
```

- [ ] **Step 4: Add exact snapshot handlers**

```tsx
function generateReportSnapshot() {
  if (!currentReport.trim()) return null;
  const next = createReportSnapshot(currentReport, reportSourceSignature, new Date());
  setReportSnapshot(next); return next;
}
function openReportPreview() {
  if (!reportSnapshot) generateReportSnapshot();
  setDownloadConfirmed(false); setReportPreviewOpen(true);
}
function regenerateReportPreview() { generateReportSnapshot(); setDownloadConfirmed(false); }
function downloadReportSnapshot(snapshot: ReportPreviewSnapshot) {
  try {
    downloadBlob(new Blob([snapshot.markdown], { type: 'text/markdown;charset=utf-8' }), snapshot.fileName);
    setDownloadConfirmed(true); setReportDownloadError('');
  } catch {
    setDownloadConfirmed(false); setReportDownloadError('报告下载失败，请重试。');
  }
}
```

Clear the snapshot only when a new workbook or analysis replaces the source. Filter/review changes retain it and make it stale.

- [ ] **Step 5: Wire workspace and drawer**

Remove direct Markdown download from `AnalysisWorkspace`, pass preview callback/ref to `ReviewSummary`, keep Excel export separate, and render one `ReportPreviewDrawer` beside the app shell. Pass `reportDownloadError` to the drawer, clear it on a successful retry and when a new snapshot is generated. Do not move or remove the feedback footer.

- [ ] **Step 6: Run and commit**

Run: `npm test -- src/App.test.tsx src/components/AnalysisWorkspace.test.tsx`

Expected: PASS for independent reviews, stale preview, exact snapshot download, import, filters, Excel export, storage retry, and feedback controls.

```bash
git add src/App.tsx src/App.test.tsx src/components/AnalysisWorkspace.tsx src/components/AnalysisWorkspace.test.tsx
git commit -m "feat: connect report preview to the real workbench"
```

---

### Task 8: Style and Run the Regression Gate

**Files:** Modify `src/review.css`, `src/styles.css`; change `src/lib/format.ts` and test only if rendered amount units fail.

- [ ] **Step 1: Apply grouped navigation and readable controls**

```css
.workbench-navigation { align-items: stretch; border-bottom: 1px solid #d8e1e1; display: flex; gap: 28px; min-height: 62px; overflow-x: auto; }
.workbench-nav-group { display: flex; gap: 6px; min-width: max-content; }
.workbench-navigation [role="tab"] { min-height: 48px; padding: 0 12px; }
.analysis-workspace, .project-list-table, .manual-review-list, .review-summary { font-size: 14px; }
.review-control select, .review-control input { font-size: 14px; min-height: 42px; }
```

No decorative navigation symbols.

- [ ] **Step 2: Style review and summary surfaces**

```css
.manual-review-list, .review-summary { background: #fff; border: 1px solid #d8e1e1; border-radius: 4px; }
.manual-review-items > article { border-top: 1px solid #e4eaea; display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); padding: 18px 22px; }
.management-summary-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

- [ ] **Step 3: Style drawer and restrained motion**

```css
.report-preview-layer { inset: 0; position: fixed; z-index: 1000; }
.report-preview-backdrop { animation: report-backdrop-in 160ms ease-out; background: rgba(20,29,31,.42); border: 0; inset: 0; position: absolute; width: 100%; }
.report-preview-drawer { animation: report-drawer-in 220ms ease-out; background: #fff; display: grid; grid-template-rows: auto auto minmax(0,1fr) auto; height: 100%; max-width: 760px; overflow: hidden; position: absolute; right: 0; width: min(760px,72vw); }
.report-preview-content { overflow-y: auto; padding: 24px 30px 40px; }
@keyframes report-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes report-drawer-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .report-preview-backdrop, .report-preview-drawer { animation: none; } }
```

At max-width 760px, make the drawer full width, review articles one column, report metrics one column, and action buttons at least 44px high. Avoid gradients, glows, floating decoration, and nested cards.

- [ ] **Step 4: Run all tests and build**

Run: `npm test`

Expected: the 230-test baseline plus new tests PASS; no pre-existing test file is skipped.

Run: `npm run build`

Expected: TypeScript and Vite PASS. Existing chunk warning may remain; add no dependency or material bundle growth.

- [ ] **Step 5: Verify the real anonymized workbook**

Run: `npm run dev -- --host 127.0.0.1`

At 1440×900 and 390×844 verify: unchanged landing; real Excel import; source/sheet/field/unit confirmation; department/manager/amount/rule filtering; project evidence, pagination, selection, and Excel export; two independent review records; management preview; stale warning and regeneration; downloaded Markdown equals visible snapshot; four close paths and focus return; feedback links; no overlap, clipping, blank buttons, unreadably small text, or page-level horizontal scroll.

- [ ] **Step 6: Commit styles and confirm scope**

Save screenshots only in a temporary or ignored folder. Record exact test count, build result, viewports, and workbook path in the handoff.

```bash
git add src/review.css src/styles.css
git commit -m "style: finish management workbench presentation"
git status --short
git log --oneline -8
```

Expected: only pre-existing untracked user files remain. Do not touch `.superpowers/`, the untracked 2026-07-25 plan, or `public/crm-overview-crm.png`.

---

## Execution Checkpoints

- Task 1 fixes report semantics before UI work.
- Task 4 completes navigation and independent review state.
- Task 7 connects the real product and must pass application tests.
- Task 8 completes visual, mobile, keyboard, real-workbook, test, and build evidence.

Do not deploy, push, or open a pull request without separate user approval.
