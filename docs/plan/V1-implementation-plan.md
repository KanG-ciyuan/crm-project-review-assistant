# CRM 储备项目运营复盘助手 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent browser-based V1 that reads a standard CRM reserve-project `.xlsx` file locally, applies deterministic review rules, and produces an editable Markdown review draft.

**Architecture:** Create a small Vite + React + TypeScript application under `work/crm-project-review-assistant`. The browser parses the workbook with SheetJS, normalizes rows, and evaluates every quality/risk rule locally. The first build uses a deterministic local report generator; a future Cloudflare Worker can replace only the `reportGenerator` adapter with an AI endpoint without exposing raw records or API keys.

**Tech Stack:** Vite, React, TypeScript, Vitest, SheetJS (`xlsx`), Recharts, Lucide React.

---

## File Structure

| Path | Responsibility |
|---|---|
| `work/crm-project-review-assistant/src/domain/types.ts` | Canonical row, rule, summary and report types |
| `work/crm-project-review-assistant/src/domain/schema.ts` | Required headers, optional headers and validation helpers |
| `work/crm-project-review-assistant/src/domain/analyze.ts` | Pure normalization, data-quality, risk and aggregate calculations |
| `work/crm-project-review-assistant/src/domain/report.ts` | Deterministic Markdown report generator |
| `work/crm-project-review-assistant/src/lib/workbook.ts` | Browser-only `.xlsx` parsing and worksheet selection |
| `work/crm-project-review-assistant/src/components/UploadPanel.tsx` | File import, worksheet selection, row preview and validation state |
| `work/crm-project-review-assistant/src/components/ThresholdPanel.tsx` | Session-only threshold controls |
| `work/crm-project-review-assistant/src/components/Overview.tsx` | KPI cards and simple aggregate charts |
| `work/crm-project-review-assistant/src/components/IssueTable.tsx` | Filterable quality/risk list |
| `work/crm-project-review-assistant/src/components/ReportPanel.tsx` | Report generation, editing and Markdown download |
| `work/crm-project-review-assistant/src/App.tsx` | Screen state and component composition |
| `work/crm-project-review-assistant/src/styles.css` | Responsive operational-tool layout |
| `work/crm-project-review-assistant/src/domain/analyze.test.ts` | Rule-level tests using the expected demo records |
| `work/crm-project-review-assistant/src/domain/report.test.ts` | Report content and human-confirmation disclaimer tests |

## Task 1: Scaffold the independent application

**Files:**
- Create: `work/crm-project-review-assistant/package.json`
- Create: `work/crm-project-review-assistant/vite.config.ts`
- Create: `work/crm-project-review-assistant/tsconfig.json`
- Create: `work/crm-project-review-assistant/index.html`
- Create: `work/crm-project-review-assistant/src/main.tsx`
- Create: `work/crm-project-review-assistant/src/App.tsx`
- Create: `work/crm-project-review-assistant/src/styles.css`

- [ ] **Step 1: Create the Vite React project manifest**

```json
{
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "test": "vitest run" },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "lucide-react": "latest",
    "react": "latest",
    "react-dom": "latest",
    "recharts": "latest",
    "xlsx": "latest"
  },
  "devDependencies": { "typescript": "latest", "vite": "latest", "vitest": "latest" }
}
```

- [ ] **Step 2: Add a minimal entry point and verify the blank application starts**

```tsx
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

Run: `npm install && npm run dev`

Expected: Vite displays the app at its local URL with no console errors.

- [ ] **Step 3: Commit the scaffold if Git is initialized**

Run: `git rev-parse --is-inside-work-tree && git add work/crm-project-review-assistant && git commit -m "feat: scaffold CRM project review assistant"`

Expected: Commit succeeds in a Git worktree. In the current directory, Git is not initialized, so record the completed files without attempting a commit.

## Task 2: Define canonical data and test the deterministic rules

**Files:**
- Create: `work/crm-project-review-assistant/src/domain/types.ts`
- Create: `work/crm-project-review-assistant/src/domain/schema.ts`
- Create: `work/crm-project-review-assistant/src/domain/analyze.ts`
- Create: `work/crm-project-review-assistant/src/domain/analyze.test.ts`

- [ ] **Step 1: Write the rule tests from the demo workbook expectations**

```ts
it('flags the ten expected quality and risk cases', () => {
  const result = analyzeProjects(demoRows, defaultThresholds, new Date('2026-07-16'));
  expect(result.issues.map(({ projectId, label }) => [projectId, label])).toEqual(
    expect.arrayContaining([
      ['P-017', '跟进停滞'],
      ['P-022', '签约预期失效'],
      ['P-023', '高金额低确定性'],
      ['P-024', '金额需复核'],
      ['P-025', '字段缺失'],
      ['P-026', '疑似重复报备'],
      ['P-027', '长期储备待复盘']
    ])
  );
});
```

- [ ] **Step 2: Run the test before implementing analysis**

Run: `npm test -- analyze.test.ts`

Expected: FAIL because `analyzeProjects` has not been implemented.

- [ ] **Step 3: Implement pure domain functions**

```ts
export function analyzeProjects(
  rows: ProjectRow[], thresholds: Thresholds, today: Date
): AnalysisResult {
  const issues = [
    ...findQualityIssues(rows, thresholds),
    ...findBusinessRisks(rows, thresholds, today)
  ];
  return { rows, issues, overview: buildOverview(rows, issues), breakdowns: buildBreakdowns(rows) };
}
```

Implement `findQualityIssues` and `findBusinessRisks` exactly as the PRD rules specify. An issue must contain `projectId`, `label`, `category`, `reason`, `department`, `salesManager`, `amount` and `status: '待人工确认' | '待跟进'`.

- [ ] **Step 4: Run domain tests**

Run: `npm test -- analyze.test.ts`

Expected: PASS, including the rule that P-024 is flagged but its source amount is unchanged.

## Task 3: Parse and validate workbooks locally

**Files:**
- Create: `work/crm-project-review-assistant/src/lib/workbook.ts`
- Create: `work/crm-project-review-assistant/src/lib/workbook.test.ts`

- [ ] **Step 1: Write workbook validation tests**

```ts
it('returns missing headers without analyzing invalid files', () => {
  expect(validateHeaders(['项目编号', '项目名称'])).toEqual(
    expect.objectContaining({ valid: false, missing: expect.arrayContaining(['销售经理', '储备金额']) })
  );
});
```

- [ ] **Step 2: Run the workbook test before implementation**

Run: `npm test -- workbook.test.ts`

Expected: FAIL because `validateHeaders` has not been implemented.

- [ ] **Step 3: Implement local parsing and header validation**

```ts
export async function inspectWorkbook(file: File): Promise<WorkbookInspection> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('请选择 .xlsx 格式的标准 Excel 文件');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return { sheetNames: workbook.SheetNames, workbook };
}
```

`readSelectedSheet` must convert only the selected worksheet into rows, preserve empty cells so missing-value validation works, and never upload the file.

- [ ] **Step 4: Run workbook tests**

Run: `npm test -- workbook.test.ts`

Expected: PASS.

## Task 4: Build the upload and threshold experience

**Files:**
- Create: `work/crm-project-review-assistant/src/components/UploadPanel.tsx`
- Create: `work/crm-project-review-assistant/src/components/ThresholdPanel.tsx`
- Modify: `work/crm-project-review-assistant/src/App.tsx`
- Modify: `work/crm-project-review-assistant/src/styles.css`

- [ ] **Step 1: Add screen-state tests for invalid input**

```tsx
expect(screen.getByText('缺少必填字段')).toBeVisible();
expect(screen.queryByText('开始分析')).not.toBeVisible();
```

- [ ] **Step 2: Implement the upload flow**

The upload panel must show: file name, sheet selector, valid-row count, first-five-row preview, header errors and a disabled analysis button until required headers exist. It must show a clear message for non-`.xlsx`, unreadable and no-valid-row files.

- [ ] **Step 3: Implement session-only thresholds**

Use number inputs for `followUpDays`, `longReserveDays`, and `absoluteAmountLimitWan`; initialize them to `14`, `90`, `10000`. Pass the typed values into `analyzeProjects`; do not persist them to local storage or the file.

- [ ] **Step 4: Verify manually with the simulation workbook**

Run: `npm run dev`

Expected: Uploading `outputs/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx` allows selection of `项目明细（标准导入）`, previews five rows and enables analysis.

## Task 5: Build the operational dashboard and issue list

**Files:**
- Create: `work/crm-project-review-assistant/src/components/Overview.tsx`
- Create: `work/crm-project-review-assistant/src/components/IssueTable.tsx`
- Modify: `work/crm-project-review-assistant/src/App.tsx`
- Modify: `work/crm-project-review-assistant/src/styles.css`

- [ ] **Step 1: Write component tests for rule visibility and filtering**

```tsx
render(<IssueTable issues={analysis.issues} />);
await user.selectOptions(screen.getByLabelText('风险类型'), '跟进停滞');
expect(screen.getByText('P-017')).toBeVisible();
expect(screen.queryByText('P-024')).not.toBeInTheDocument();
```

- [ ] **Step 2: Implement KPI and summary views**

Show six stable KPI values: project count, total reserve amount, in-progress count, signed count, lost count and risk-project count. Show bar charts for departments and sales managers; show industry and region only when those optional fields have usable values.

- [ ] **Step 3: Implement filterable lists**

Use category, label, department and sales-manager filters. Each row must show project ID, project name, manager, amount, label, reason and its human-action status. Do not add an edit, correction or deletion action.

- [ ] **Step 4: Run application tests and verify the acceptance workbook**

Run: `npm test && npm run build`

Expected: Tests pass and Vite builds without TypeScript errors. With the supplied workbook, the screen displays all expected labels from `测试预期结果`.

## Task 6: Produce an editable report and Markdown download

**Files:**
- Create: `work/crm-project-review-assistant/src/domain/report.ts`
- Create: `work/crm-project-review-assistant/src/domain/report.test.ts`
- Create: `work/crm-project-review-assistant/src/components/ReportPanel.tsx`
- Modify: `work/crm-project-review-assistant/src/App.tsx`

- [ ] **Step 1: Write the report tests**

```ts
it('includes the fixed human confirmation disclaimer', () => {
  const report = createReviewReport(analysis, new Date('2026-07-16'));
  expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
  expect(report).toContain('## 重点风险项目摘要');
});
```

- [ ] **Step 2: Run the report test before implementation**

Run: `npm test -- report.test.ts`

Expected: FAIL because `createReviewReport` has not been implemented.

- [ ] **Step 3: Implement a local deterministic report generator**

```ts
export function createReviewReport(analysis: AnalysisResult, today: Date): string {
  return [
    '# 储备项目经营复盘',
    `生成日期：${formatDate(today)}`,
    '> 本报告基于导入数据和规则标签生成，金额、日期、项目状态及业务结论须由业务人员确认。',
    '## 经营概览',
    renderOverview(analysis.overview),
    '## 数据质量提醒',
    renderIssues(analysis.issues, '数据质量'),
    '## 重点风险项目摘要',
    renderIssues(analysis.issues, '经营风险'),
    '## 下期跟进行动',
    renderActions(analysis.issues)
  ].join('\n\n');
}
```

The panel must display the Markdown in a textarea, allow edits, and download it as `储备项目经营复盘-YYYY-MM-DD.md` using a client-created Blob.

- [ ] **Step 4: Verify report behavior**

Run: `npm test && npm run build`

Expected: Tests and production build pass; downloaded Markdown includes the fixed human-confirmation statement.

## Task 7: Visual and privacy verification

**Files:**
- Modify: `work/crm-project-review-assistant/src/styles.css`
- Create: `work/crm-project-review-assistant/README.md`

- [ ] **Step 1: Apply responsive operational-tool styling**

Use a constrained two-column desktop layout that becomes one column on mobile. Keep filters, table headers and KPI cards stable in size; make tables horizontally scrollable instead of overlapping text. Use a neutral light background with dark text, restrained teal/blue for primary actions, amber for review flags and red only for overdue/risk emphasis.

- [ ] **Step 2: Add the local-data handling statement to the README**

```md
## Data handling

The browser reads the workbook, computes rules and builds charts locally. This V1 does not upload the original workbook. The current report generator also runs locally; any future AI endpoint must receive only an anonymized aggregate payload and keep its API key on the server.
```

- [ ] **Step 3: Perform final verification**

Run: `npm test && npm run build`

Expected: All tests pass and `dist/` is produced. Manually check desktop and mobile layouts with the simulation workbook; verify there is no network request containing raw project rows or the original file.

- [ ] **Step 4: Commit if Git is initialized**

Run: `git rev-parse --is-inside-work-tree && git add work/crm-project-review-assistant docs/superpowers/plans && git commit -m "feat: add CRM project review assistant v1"`

Expected: Commit succeeds only in a Git worktree. The current directory has no Git repository, so preserve the completed files without a commit.

## Coverage Check

- Standard `.xlsx` intake and selected worksheet: Tasks 3-4.
- Local-only validation, rules and thresholds: Tasks 2-4.
- KPIs, breakdowns and filterable risk lists: Task 5.
- Editable Markdown and human-confirmation disclaimer: Task 6.
- No CRM, no source-data mutation, no raw-data AI transfer: Tasks 3, 6 and 7.
- Demo data acceptance: Tasks 2, 4, 5 and 7.

## Self-Review Result

The implementation is deliberately limited to a local deterministic report generator. That makes the first usable demo testable without model quality, API cost or data-handling uncertainty. The future AI call is isolated behind the report-generation boundary and is not required for V1 acceptance.
