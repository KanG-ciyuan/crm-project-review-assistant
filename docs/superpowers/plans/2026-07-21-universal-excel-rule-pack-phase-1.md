# Universal Excel Mapping and Rule Pack Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed Excel headers with a guided field-mapping flow, apply the confirmed To B sales-operations rule pack, present five result areas, and make all metrics, charts, lists, reports, and exports respond to global filters.

**Architecture:** Keep Excel parsing and all deterministic analysis in the browser. Split the current combined implementation into a canonical project model, raw workbook inspection, mapping/value normalization, rule evaluation, analysis projection, and global filtering; React components consume those pure modules and never infer business facts themselves. Rules run once on the complete imported dataset, while filters project the already-computed findings onto a selected project set so filtering cannot change whether a rule originally fired.

**Tech Stack:** React 19, TypeScript, Vite, SheetJS (`xlsx`), Vitest, Testing Library, Lucide React, browser `localStorage`.

---

## Scope Boundary

This plan implements the first-phase product defined in `docs/superpowers/specs/2026-07-21-universal-excel-rule-pack-design.md`:

- arbitrary worksheet/header selection;
- standard/custom/ignored field mapping;
- status, probability, and amount-unit mapping;
- field-dependent rule readiness;
- confirmed To B rules and five result categories;
- global filters with full-page/report synchronization.

The following remain separate later plans: saved enterprise mapping templates, cross-import snapshot comparison, AI semantic-name review, CRM API integration, and Feishu task delivery.

## File Structure

### New domain and library files

- `src/domain/project.ts`: canonical project types, stable row keys, money/date helpers, field definitions.
- `src/domain/mapping.ts`: mapping types, alias suggestions, validation, value mapping, canonical row conversion.
- `src/domain/mapping.test.ts`: deterministic mapping and conversion tests.
- `src/domain/rules.ts`: finding types, rule metadata, dependency checks, confirmed To B rule evaluation.
- `src/domain/rules.test.ts`: rule boundary and interaction tests.
- `src/domain/analysis.ts`: summaries, breakdowns, five result groups, filtered projection.
- `src/domain/analysis.test.ts`: summary and projection tests.
- `src/domain/filters.ts`: filter state, option derivation, row matching, filter summary.
- `src/domain/filters.test.ts`: cascading and compound-filter tests.
- `src/components/ImportWizard.tsx`: sheet/header selection, mapping, value mapping, readiness confirmation.
- `src/components/ImportWizard.test.tsx`: mapping-flow interaction tests.
- `src/components/AnalysisFilters.tsx`: compact global filter controls and active-filter chips.
- `src/components/AnalysisFilters.test.tsx`: filter interaction tests.
- `src/components/AnalysisResults.tsx`: metrics, breakdowns, five result sections, project tables.
- `src/test/fixtures.ts`: complete canonical project fixture shared by domain and component tests.
- `src/mapping.css`: import wizard layout.
- `src/filters.css`: global filter layout and responsive behavior.

### Existing files to modify

- `src/lib/workbook.ts`: stop requiring fixed headers; expose raw worksheet rows and explicit header selection.
- `src/lib/workbook.test.ts`: replace fixed-template gating tests with raw-sheet inspection tests while retaining legacy-template compatibility.
- `src/domain/analyze.ts`: reduce to a compatibility re-export during migration, then remove old rule implementation after consumers move.
- `src/domain/analyze.test.ts`: migrate assertions to `rules.test.ts` and `analysis.test.ts`.
- `src/domain/issues.ts`: group `Finding` records instead of legacy `Issue` records.
- `src/domain/issues.test.ts`: update grouping fixtures and five-category expectations.
- `src/domain/review.ts`: fingerprint the expanded canonical row without changing CRM source-of-truth behavior.
- `src/domain/review.test.ts`: cover customer name and canonical status changes.
- `src/domain/report.ts`: accept a projected analysis and filter summary; render five result areas.
- `src/domain/report.test.ts`: verify filtered scope and new terminology.
- `src/App.tsx`: orchestrate the wizard, one full analysis, filtered projection, report scope, and current/all export.
- `src/App.test.tsx`: add end-to-end state integration checks.
- `src/review.css`: remove styles made obsolete by extracted components and update result-section layout.
- `README.md`: document arbitrary Excel mapping, rule categories, and global filtering.
- `CHANGELOG.md`: record the completed release only after all verification passes.

## Task 1: Introduce the Canonical Project Model

**Files:**
- Create: `src/domain/project.ts`
- Create: `src/test/fixtures.ts`
- Modify: `src/domain/analyze.ts`
- Modify: `src/domain/review.ts`
- Test: `src/domain/review.test.ts`

- [ ] **Step 1: Add a failing fingerprint test for newly required canonical fields**

Add this test to `src/domain/review.test.ts`:

```ts
it('changes the fingerprint when customer ownership or canonical status changes', () => {
  const base = { ...row, customerName: '华城医院', customFields: {} };
  expect(createProjectFingerprint({ ...base, customerName: '北原医院' }))
    .not.toBe(createProjectFingerprint(base));
  expect(createProjectFingerprint({ ...base, status: '呆滞' }))
    .not.toBe(createProjectFingerprint(base));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/domain/review.test.ts
```

Expected: TypeScript reports that `customerName` and `customFields` are not part of `ProjectRow`, or the fingerprint assertion fails.

- [ ] **Step 3: Create the canonical model**

Create `src/domain/project.ts` with these public types and helpers:

```ts
export type ProjectStatus = '跟进中' | '呆滞' | '已签约' | '已丢单' | '未知';
export type ProbabilityBand = '询价类' | '低概率' | '中等概率' | '较高概率' | '临近签约' | '未知';

export type CanonicalFieldKey =
  | 'projectId' | 'projectName' | 'customerName' | 'department' | 'salesManager'
  | 'status' | 'amount' | 'unit' | 'createdAt' | 'lastFollowUpAt'
  | 'expectedSignAt' | 'probabilityBand' | 'industry' | 'region'
  | 'projectType' | 'projectLevel' | 'latestUpdatedAt';

export type CustomFieldValue = string | number | null;

export interface ProjectRow {
  sourceKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  department: string;
  salesManager: string;
  status: ProjectStatus;
  amount: number | null;
  unit: '元' | '万元' | '亿元' | string;
  createdAt: string | null;
  lastFollowUpAt: string | null;
  expectedSignAt: string | null;
  probabilityBand: ProbabilityBand;
  industry: string;
  region: string;
  projectType: string;
  projectLevel: string;
  latestUpdatedAt: string | null;
  customFields: Record<string, CustomFieldValue>;
}

export const projectKey = (row: ProjectRow) =>
  row.sourceKey || row.projectId || `${row.customerName}|${row.projectName}|${row.salesManager}`;

export function amountInWan(row: Pick<ProjectRow, 'amount' | 'unit'>): number | null {
  if (row.amount === null || !Number.isFinite(row.amount)) return null;
  if (row.unit === '元') return row.amount / 10_000;
  if (row.unit === '亿元') return row.amount * 10_000;
  return row.amount;
}

export function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const daysBetween = (earlier: Date, later: Date) =>
  Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
```

Move `ProjectStatus`, `ProbabilityBand`, and `ProjectRow` consumers to this file. Leave `src/domain/analyze.ts` temporarily re-exporting these types:

```ts
export type { ProjectRow, ProjectStatus, ProbabilityBand } from './project';
```

Create `src/test/fixtures.ts` so later tests never depend on partial project objects:

```ts
import type { ProjectRow } from '../domain/project';

export function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    sourceKey: 'row-1',
    projectId: 'CRM-001',
    projectName: '华城医院数字化改造',
    customerName: '华城医院',
    department: '华东一部',
    salesManager: '销售甲',
    status: '跟进中',
    amount: 1200,
    unit: '万元',
    createdAt: '2026-01-01',
    lastFollowUpAt: '2026-07-01',
    expectedSignAt: '2026-08-01',
    probabilityBand: '中等概率',
    industry: '医疗',
    region: '华东',
    projectType: '数字化项目',
    projectLevel: 'A级',
    latestUpdatedAt: '2026-07-01',
    customFields: {},
    ...overrides
  };
}
```

- [ ] **Step 4: Update the review fingerprint**

In `src/domain/review.ts`, import `projectKey` and include these ordered values in `createProjectFingerprint`: project ID, customer name, project name, amount, unit, status, probability band, last follow-up date, expected-sign date, created date, and latest-update date.

Use `projectKey(row)` when building `rowByKey` so missing project IDs remain isolated by source row.

- [ ] **Step 5: Replace legacy partial rows with the shared fixture**

Import `makeProject` and replace literal `ProjectRow` objects in the focused tests. Preserve each test's meaningful values as overrides:

```ts
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
```

- [ ] **Step 6: Run focused domain tests**

Run:

```bash
npm test -- src/domain/review.test.ts src/domain/issues.test.ts src/domain/report.test.ts src/domain/analyze.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the canonical model**

```bash
git add src/domain/project.ts src/test/fixtures.ts src/domain/analyze.ts src/domain/review.ts src/domain/review.test.ts src/domain/issues.test.ts src/domain/report.test.ts src/domain/analyze.test.ts
git commit -m "refactor: introduce canonical project model"
```

## Task 2: Read Arbitrary Worksheets and Map Fields

**Files:**
- Create: `src/domain/mapping.ts`
- Create: `src/domain/mapping.test.ts`
- Modify: `src/lib/workbook.ts`
- Modify: `src/lib/workbook.test.ts`

- [ ] **Step 1: Replace fixed-header tests with raw worksheet expectations**

Add tests in `src/lib/workbook.test.ts` for:

```ts
it('returns candidate header rows without requiring known column names', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['华东销售中心项目清单'],
    ['商机名称', '业务负责人', '客户', '最后联系时间', '预计成交时间', '金额'],
    ['医院数改', '销售甲', '华城医院', '2026-07-01', '2026-08-01', 350]
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, '商机明细');

  const inspected = inspectSheet(workbook, '商机明细');
  expect(inspected.candidateHeaderRows).toContain(1);
  expect(readSheetRecords(inspected.matrix, 1)[0]).toMatchObject({ 商机名称: '医院数改' });
});
```

Add this compatibility test proving the old CRM history file can still be read as raw records:

```ts
it('reads the legacy CRM history sample without fixed-profile parsing', () => {
  const workbook = XLSX.readFile('sample-data/CRM历史项目表-脱敏适配样表.xlsx', { cellDates: true });
  const inspected = inspectSheet(workbook, '10-储备项目报备表（跟进中和呆滞）');
  const headerRowIndex = inspected.matrix.findIndex((row) => row.includes('项目编码'));
  const records = readSheetRecords(inspected.matrix, headerRowIndex);
  expect(records.length).toBeGreaterThan(0);
  expect(records[0]).toHaveProperty('项目编码');
  expect(records[0]).toHaveProperty('储备金额（万元）');
});
```

- [ ] **Step 2: Run the workbook test and verify it fails**

```bash
npm test -- src/lib/workbook.test.ts
```

Expected: FAIL because `inspectSheet` and `readSheetRecords` do not exist.

- [ ] **Step 3: Refactor workbook I/O into raw inspection**

In `src/lib/workbook.ts`, keep `inspectWorkbook(file)` and add:

```ts
export interface RawSheetInspection {
  sheetName: string;
  matrix: unknown[][];
  candidateHeaderRows: number[];
}

export function inspectSheet(workbook: XLSX.WorkBook, sheetName: string): RawSheetInspection;
export function readSheetRecords(
  matrix: unknown[][],
  headerRowIndex: number
): Array<Record<string, unknown>>;
```

Candidate rows must be the first ten non-empty rows containing at least two non-empty cells. `readSheetRecords` trims header text, rejects duplicate blank headers, and skips completely empty data rows. Do not validate business field names in this module.

- [ ] **Step 4: Write mapping-engine tests**

Create `src/domain/mapping.test.ts` with these cases:

```ts
it('suggests canonical fields from local aliases without an API call', () => {
  expect(suggestMappings(['商机名称', '业务负责人', '客户', '最后联系时间']))
    .toMatchObject([
      { sourceHeader: '商机名称', mode: 'standard', targetField: 'projectName' },
      { sourceHeader: '业务负责人', mode: 'standard', targetField: 'salesManager' },
      { sourceHeader: '客户', mode: 'standard', targetField: 'customerName' },
      { sourceHeader: '最后联系时间', mode: 'standard', targetField: 'lastFollowUpAt' }
    ]);
});

it('keeps custom fields and ignores unwanted columns', () => {
  const rows = applyMappings(
    [{ 商机名称: '医院数改', 来源渠道: '展会', 内部备注: '不导入' }],
    [
      { sourceHeader: '商机名称', mode: 'standard', targetField: 'projectName' },
      { sourceHeader: '来源渠道', mode: 'custom', customName: '项目来源渠道' },
      { sourceHeader: '内部备注', mode: 'ignore' }
    ],
    emptyValueMappings,
    '商机明细'
  );
  expect(rows[0].projectName).toBe('医院数改');
  expect(rows[0].customFields).toEqual({ 项目来源渠道: '展会' });
});
```

Add these two cases to the same file:

```ts
it('rejects two source columns mapped to the same standard field', () => {
  const validation = validateMappings([
    { sourceHeader: '商机名称', mode: 'standard', targetField: 'projectName' },
    { sourceHeader: '项目标题', mode: 'standard', targetField: 'projectName' }
  ], emptyValueMappings);
  expect(validation).toMatchObject({ valid: false, duplicateTargets: ['projectName'] });
});

it('normalizes mapped dates, amounts, statuses, probabilities, and import units', () => {
  const rows = applyMappings(
    [{ 编号: 'A-1', 金额: '1,200', 创建: '2026/01/02', 状态: '推进中', 概率: '51%-70%' }],
    [
      { sourceHeader: '编号', mode: 'standard', targetField: 'projectId' },
      { sourceHeader: '金额', mode: 'standard', targetField: 'amount' },
      { sourceHeader: '创建', mode: 'standard', targetField: 'createdAt' },
      { sourceHeader: '状态', mode: 'standard', targetField: 'status' },
      { sourceHeader: '概率', mode: 'standard', targetField: 'probabilityBand' }
    ],
    {
      statuses: { 推进中: '跟进中' },
      probabilities: { '51%-70%': '中等概率' },
      amountUnit: '万元'
    },
    '商机明细'
  );
  expect(rows[0]).toMatchObject({
    projectId: 'A-1', amount: 1200, unit: '万元', createdAt: '2026-01-02',
    status: '跟进中', probabilityBand: '中等概率'
  });
});
```

- [ ] **Step 5: Run mapping tests and verify they fail**

```bash
npm test -- src/domain/mapping.test.ts
```

Expected: FAIL because the mapping module does not exist.

- [ ] **Step 6: Implement the mapping engine**

Create `src/domain/mapping.ts` with:

```ts
export type ColumnMode = 'standard' | 'custom' | 'ignore';

export interface ColumnMapping {
  sourceHeader: string;
  mode: ColumnMode;
  targetField?: CanonicalFieldKey;
  customName?: string;
}

export interface ValueMappings {
  statuses: Record<string, ProjectStatus>;
  probabilities: Record<string, ProbabilityBand>;
  amountUnit: ProjectRow['unit'];
}

export interface MappingValidation {
  valid: boolean;
  duplicateTargets: CanonicalFieldKey[];
  unmappedEnumValues: string[];
}

export const emptyValueMappings: ValueMappings = {
  statuses: {},
  probabilities: {},
  amountUnit: '万元'
};

export function suggestMappings(headers: string[]): ColumnMapping[];
export function validateMappings(mappings: ColumnMapping[], values: ValueMappings): MappingValidation;
export function applyMappings(
  records: Array<Record<string, unknown>>,
  mappings: ColumnMapping[],
  values: ValueMappings,
  sheetName: string
): ProjectRow[];
```

Use a checked-in alias dictionary for every canonical field. Normalize aliases with trimmed spaces, full-width-to-half-width conversion, lowercase Latin text, and common punctuation removal. Unknown headers default to `custom` using the original header as `customName`; never silently ignore user data.

- [ ] **Step 7: Run workbook and mapping tests**

```bash
npm test -- src/lib/workbook.test.ts src/domain/mapping.test.ts
```

Expected: both test files pass.

- [ ] **Step 8: Commit raw workbook inspection and mappings**

```bash
git add src/lib/workbook.ts src/lib/workbook.test.ts src/domain/mapping.ts src/domain/mapping.test.ts
git commit -m "feat: map arbitrary excel fields"
```

## Task 3: Build the Guided Import Wizard

**Files:**
- Create: `src/components/ImportWizard.tsx`
- Create: `src/components/ImportWizard.test.tsx`
- Create: `src/mapping.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the wizard interaction test**

Create `src/components/ImportWizard.test.tsx` and test a supplied `RawSheetInspection` without browser file I/O:

```tsx
it('requires mapping and enum confirmation before analysis', async () => {
  const user = userEvent.setup();
  const onReady = vi.fn();
  const inspection: RawSheetInspection = {
    sheetName: '商机明细',
    candidateHeaderRows: [0],
    matrix: [
      ['商机名称', '业务负责人', '项目状态'],
      ['医院数改', '销售甲', '方案沟通']
    ]
  };
  render(<ImportWizard inspection={inspection} onReady={onReady} />);

  await user.click(screen.getByRole('button', { name: '确认表头行' }));
  expect(screen.getByRole('heading', { name: '确认字段对应关系' })).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('商机名称处理方式'), 'custom');
  await user.clear(screen.getByLabelText('商机名称自定义字段名称'));
  await user.type(screen.getByLabelText('商机名称自定义字段名称'), '商机标题');
  await user.click(screen.getByRole('button', { name: '确认字段关系' }));

  expect(screen.getByRole('heading', { name: '统一状态口径' })).toBeInTheDocument();
  expect(onReady).not.toHaveBeenCalled();
});
```

Add a second complete-flow test:

```tsx
it('returns canonical rows only after the final confirmation', async () => {
  const user = userEvent.setup();
  const onReady = vi.fn();
  const inspection: RawSheetInspection = {
    sheetName: '商机明细',
    candidateHeaderRows: [0],
    matrix: [
      ['项目编号', '项目名称', '项目状态', '储备金额'],
      ['A-1', '医院数改', '推进中', 1200]
    ]
  };
  render(<ImportWizard inspection={inspection} onReady={onReady} />);

  await user.click(screen.getByRole('button', { name: '确认表头行' }));
  await user.click(screen.getByRole('button', { name: '确认字段关系' }));
  await user.selectOptions(screen.getByLabelText('推进中对应状态'), '跟进中');
  await user.click(screen.getByRole('button', { name: '确认状态口径' }));
  expect(onReady).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '开始规则分析' }));

  expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
    rows: [expect.objectContaining({ projectId: 'A-1', status: '跟进中', amount: 1200 })],
    source: { sheetName: '商机明细', headerRowIndex: 0 }
  }));
});
```

- [ ] **Step 2: Run the component test and verify it fails**

```bash
npm test -- src/components/ImportWizard.test.tsx
```

Expected: FAIL because `ImportWizard` does not exist.

- [ ] **Step 3: Implement the four-step wizard**

Implement `ImportWizard` with this public contract:

```ts
export interface ImportReadyPayload {
  rows: ProjectRow[];
  mappings: ColumnMapping[];
  valueMappings: ValueMappings;
  source: { sheetName: string; headerRowIndex: number };
}

export interface ImportWizardProps {
  inspection: RawSheetInspection;
  onReady: (payload: ImportReadyPayload) => void;
}
```

The four explicit screens are:

1. confirm header row and preview;
2. standard/custom/ignore field mapping;
3. status, probability, and unit mapping;
4. mapping validation and rule-capability preview.

Do not call `onReady` before the user clicks “开始规则分析”. Show field dependencies and skipped rules using metadata from Task 4; until Task 4 lands, accept a `capabilities` prop with an empty default and replace it in Task 5.

- [ ] **Step 4: Add responsive wizard styling**

Create `src/mapping.css`. Use a stable two-column mapping grid above 760px and one column below it. Keep source field, sample values, mode selector, and target/custom name visible without horizontal scrolling. Use existing color and spacing conventions from `src/styles.css`; do not redesign the whole application.

- [ ] **Step 5: Integrate raw sheet inspection in App**

In `src/App.tsx`:

- keep upload and sheet selection in the sidebar;
- replace `parseSelectedSheet` with `inspectSheet`;
- show `ImportWizard` after a worksheet is selected;
- store only the `ImportReadyPayload` needed to start full analysis;
- clear previous analysis when file, sheet, header, or mappings change.

- [ ] **Step 6: Run wizard and existing App tests**

```bash
npm test -- src/components/ImportWizard.test.tsx src/App.test.tsx src/lib/workbook.test.ts src/domain/mapping.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the import wizard**

```bash
git add src/components/ImportWizard.tsx src/components/ImportWizard.test.tsx src/mapping.css src/App.tsx
git commit -m "feat: add guided excel import wizard"
```

## Task 4: Implement the Confirmed To B Rule Pack

**Files:**
- Create: `src/domain/rules.ts`
- Create: `src/domain/rules.test.ts`
- Modify: `src/domain/analyze.ts`
- Modify: `src/components/ImportWizard.tsx`
- Modify: `src/components/ImportWizard.test.tsx`
- Delete after migration: `src/domain/analyze.test.ts`

- [ ] **Step 1: Write rule boundary tests**

Create `src/domain/rules.test.ts`, import `makeProject` from `src/test/fixtures.ts`, and define `const today = new Date('2026-07-21')`. Use these exact cases:

```ts
it('flags both active and dormant projects after 30 days without follow-up', () => {
  const rows = [
    makeProject({ sourceKey: 'a', status: '跟进中', lastFollowUpAt: '2026-06-20' }),
    makeProject({ sourceKey: 'b', status: '呆滞', lastFollowUpAt: '2026-06-20' })
  ];
  const findings = evaluateRulePack(rows, new Date('2026-07-21'));
  expect(findings.filter((item) => item.label === '跟进超期').map((item) => item.rowKey))
    .toEqual(['a', 'b']);
});

it('prioritizes impossible signing dates over overdue signing dates', () => {
  const findings = evaluateRulePack([
    makeProject({ createdAt: '2026-06-01', expectedSignAt: '2026-05-01' })
  ], new Date('2026-07-21'));
  expect(findings.map((item) => item.label)).toContain('签约日期逻辑异常');
  expect(findings.map((item) => item.label)).not.toContain('签约日期超期未更新');
});

it.each([
  [999.99, null],
  [1000, '大额重点项目'],
  [5000, '超大金额待复核'],
  [10000, '极端金额待核实']
])('classifies %s 万元 at the confirmed boundary', (amount, label) => {
  const findings = evaluateRulePack([makeProject({ amount, unit: '万元' })], today);
  expect(findings.find((item) => item.ruleId.startsWith('amount-tier'))?.label ?? null).toBe(label);
});
```

Add these compact boundary cases:

```ts
it.each([
  [null, '储备金额待补充'],
  [0, '储备金额待补充'],
  [-1, '金额格式异常']
])('checks invalid amount %s', (amount, label) => {
  expect(evaluateRulePack([makeProject({ amount })], today).map((item) => item.label)).toContain(label);
});

it('flags the fifth repeated seller amount as a possible placeholder pattern', () => {
  const rows = Array.from({ length: 5 }, (_, index) => makeProject({
    sourceKey: `repeat-${index}`, projectId: `R-${index}`, amount: 10, salesManager: '销售甲'
  }));
  expect(evaluateRulePack(rows, today).filter((item) => item.label === '疑似占位金额')).toHaveLength(5);
});

it('separates duplicate records, duplicate creation, and cross-seller collision', () => {
  const rows = [
    makeProject({ sourceKey: 'a', projectId: 'DUP-1' }),
    makeProject({ sourceKey: 'b', projectId: 'DUP-1' }),
    makeProject({ sourceKey: 'c', projectId: 'NEW-2', salesManager: '销售甲' }),
    makeProject({ sourceKey: 'd', projectId: 'NEW-3', salesManager: '销售乙' })
  ];
  const labels = evaluateRulePack(rows, today).map((item) => item.label);
  expect(labels).toEqual(expect.arrayContaining([
    '重复记录待核实', '疑似重复立项', '疑似撞单待核验'
  ]));
});

it('normalizes spacing but keeps phase, lot, and year differences distinct', () => {
  expect(normalizeProjectName('医院 数字化-改造')).toBe(normalizeProjectName('医院数字化改造'));
  expect(distinctProjectMarkers('医院改造一期', '医院改造二期')).toBe(true);
  expect(distinctProjectMarkers('园区A包', '园区B包')).toBe(true);
  expect(distinctProjectMarkers('年度项目2025', '年度项目2026')).toBe(true);
});

it('treats low probability and long cycles as observations rather than standalone risks', () => {
  const rows = [
    makeProject({ sourceKey: 'low', probabilityBand: '询价类' }),
    makeProject({ sourceKey: 'long', createdAt: '2026-01-21' }),
    makeProject({ sourceKey: 'term', createdAt: '2025-07-20' })
  ];
  const findings = evaluateRulePack(rows, today);
  expect(findings.find((item) => item.rowKey === 'low' && item.category === '经营结构分析')?.label).toBe('询价及低概率项目');
  expect(findings.find((item) => item.rowKey === 'long' && item.category === '经营结构分析')?.label).toBe('长周期项目');
  expect(findings.find((item) => item.rowKey === 'term' && item.category === '经营结构分析')?.label).toBe('长期储备项目');
  expect(findings.filter((item) => ['low', 'long', 'term'].includes(item.rowKey)).every((item) => item.level === 'info')).toBe(true);
});
```

- [ ] **Step 2: Run rule tests and verify they fail**

```bash
npm test -- src/domain/rules.test.ts
```

Expected: FAIL because the rules module does not exist.

- [ ] **Step 3: Define rule metadata and finding types**

Create these types in `src/domain/rules.ts`:

```ts
export type FindingCategory =
  | '数据质量待复核'
  | '维护超期待整改'
  | '疑似重复与撞单'
  | '重点项目复盘'
  | '经营结构分析';

export type FindingLevel = 'info' | 'review' | 'action';

export interface Finding {
  ruleId: string;
  rowKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  department: string;
  salesManager: string;
  amountWan: number | null;
  category: FindingCategory;
  label: string;
  reason: string;
  level: FindingLevel;
}

export interface RuleDefinition {
  id: string;
  name: string;
  category: FindingCategory;
  requiredFields: CanonicalFieldKey[];
  adjustable: boolean;
}

export interface RuleCapability {
  ruleId: string;
  available: boolean;
  missingFields: CanonicalFieldKey[];
}

export function getRuleCapabilities(mappedFields: Set<CanonicalFieldKey>): RuleCapability[];
export function normalizeProjectName(value: string): string;
export function distinctProjectMarkers(left: string, right: string): boolean;
export function evaluateRulePack(rows: ProjectRow[], today: Date): Finding[];
```

- [ ] **Step 4: Implement deterministic rules**

Implement each confirmed rule as a focused private function and concatenate results in `evaluateRulePack`. Use exactly these constants:

```ts
const FOLLOW_UP_LIMIT_DAYS = 30;
const LARGE_AMOUNT_WAN = 1000;
const VERY_LARGE_AMOUNT_WAN = 5000;
const EXTREME_AMOUNT_WAN = 10000;
const REPEATED_AMOUNT_COUNT = 5;
const LONG_CYCLE_DAYS = 180;
const LONG_TERM_DAYS = 365;
```

Name normalization may remove spacing, punctuation, width differences, and Latin case. It must not remove phase, lot, package, or year tokens. Fuzzy semantic names only create an informational `名称相似待核验` candidate when a conservative local similarity threshold is met; they never create a collision finding in Phase 1.

- [ ] **Step 5: Show real rule capabilities in the import wizard**

Derive the mapped standard fields from `ColumnMapping[]`, call `getRuleCapabilities`, and render every available rule plus each skipped rule's missing fields on the fourth wizard screen. Add this assertion to `ImportWizard.test.tsx` after mapping a sheet without an expected-sign date:

```tsx
expect(screen.getByText('签约日期超期未更新')).toBeInTheDocument();
expect(screen.getByText('跳过：缺少预计签约日期')).toBeInTheDocument();
```

- [ ] **Step 6: Convert analyze.ts to compatibility exports**

After all current consumers use `ProjectRow`, `Finding`, and `evaluateRulePack`, replace `src/domain/analyze.ts` with re-exports from `project.ts` and `rules.ts`. Task 5 adds the `analysis.ts` exports after that file exists. Remove `src/domain/analyze.test.ts` only after its useful assertions are present in the new tests.

- [ ] **Step 7: Run rule and wizard tests**

```bash
npm test -- src/domain/rules.test.ts src/domain/review.test.ts src/domain/issues.test.ts src/components/ImportWizard.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit the rule pack**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts src/domain/analyze.ts src/domain/analyze.test.ts src/components/ImportWizard.tsx src/components/ImportWizard.test.tsx
git commit -m "feat: implement tob sales rule pack"
```

## Task 5: Build Analysis Summaries and Five Result Areas

**Files:**
- Create: `src/domain/analysis.ts`
- Create: `src/domain/analysis.test.ts`
- Create: `src/components/AnalysisResults.tsx`
- Modify: `src/domain/issues.ts`
- Modify: `src/domain/issues.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/review.css`

- [ ] **Step 1: Write analysis projection tests**

Create `src/domain/analysis.test.ts`:

```ts
it('keeps five result categories separate and recalculates summaries for selected rows', () => {
  const today = new Date('2026-07-21');
  const rows = [
    makeProject({ sourceKey: 'row-a', amount: 1200, department: '华东一部' }),
    makeProject({ sourceKey: 'row-b', projectId: 'CRM-002', amount: 300, department: '华南部' }),
    makeProject({ sourceKey: 'row-c', projectId: 'CRM-003', amount: 500, department: '华北部' })
  ];
  const findings = evaluateRulePack(rows, today);
  const full = buildAnalysis(rows, findings, today);
  const selected = projectAnalysis(full, new Set(['row-a']));

  expect(full.rows).toHaveLength(3);
  expect(selected.rows).toHaveLength(1);
  expect(selected.overview.totalAmountWan).toBe(1200);
  expect(Object.keys(selected.results)).toEqual([
    '数据质量待复核', '维护超期待整改', '疑似重复与撞单', '重点项目复盘', '经营结构分析'
  ]);
});
```

Add this aggregation case:

```ts
it('builds department, seller, follow-up, reserve, probability, and top amount summaries', () => {
  const today = new Date('2026-07-21');
  const rows = [
    makeProject({ sourceKey: 'a', department: '华东部', salesManager: '销售甲', amount: 1000, lastFollowUpAt: '2026-07-20', createdAt: '2026-07-01', probabilityBand: '中等概率' }),
    makeProject({ sourceKey: 'b', projectId: 'B', department: '华东部', salesManager: '销售乙', amount: 5000, lastFollowUpAt: '2026-05-01', createdAt: '2025-01-01', probabilityBand: '低概率' })
  ];
  const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  expect(analysis.byDepartment).toContainEqual({ name: '华东部', projectCount: 2, amountWan: 6000 });
  expect(analysis.bySalesManager.map((item) => item.name)).toEqual(['销售乙', '销售甲']);
  expect(analysis.followUpBuckets.find((item) => item.name === '61天以上')?.projectCount).toBe(1);
  expect(analysis.reserveCycleBuckets.find((item) => item.name === '超过365天')?.projectCount).toBe(1);
  expect(analysis.probabilityBreakdown.find((item) => item.name === '低概率')?.projectCount).toBe(1);
  expect(analysis.results['重点项目复盘'].find((item) => item.rowKey === 'b')?.label).toBe('超大金额待复核');
});
```

- [ ] **Step 2: Run the analysis test and verify it fails**

```bash
npm test -- src/domain/analysis.test.ts
```

Expected: FAIL because `buildAnalysis` and `projectAnalysis` do not exist.

- [ ] **Step 3: Implement pure analysis construction and projection**

Create `src/domain/analysis.ts` with:

```ts
export interface AnalysisOverview {
  projectCount: number;
  totalAmountWan: number;
  inProgressCount: number;
  dormantCount: number;
  signedCount: number;
  lostCount: number;
}

export interface AnalysisResult {
  rows: ProjectRow[];
  findings: Finding[];
  overview: AnalysisOverview;
  byDepartment: BreakdownItem[];
  bySalesManager: BreakdownItem[];
  followUpBuckets: BreakdownItem[];
  reserveCycleBuckets: BreakdownItem[];
  probabilityBreakdown: BreakdownItem[];
  results: Record<FindingCategory, Finding[]>;
  generatedAt: string;
}

export function buildAnalysis(rows: ProjectRow[], findings: Finding[], today: Date): AnalysisResult;
export function projectAnalysis(full: AnalysisResult, selectedRowKeys: Set<string>): AnalysisResult;
```

`projectAnalysis` must only select existing findings and recompute summaries; it must never call `evaluateRulePack`.

After `analysis.ts` exists, add its public types and functions to the compatibility exports in `src/domain/analyze.ts`.

- [ ] **Step 4: Migrate finding grouping**

Update `src/domain/issues.ts` to group `Finding` items by `rowKey`. Include customer name, department, and sales manager in `ProjectIssueGroup`. Update `issues.test.ts` to prove multiple categories remain in one project row while missing project IDs remain separated by source keys.

- [ ] **Step 5: Render five result areas**

Create `src/components/AnalysisResults.tsx` with props:

```ts
interface AnalysisResultsProps {
  analysis: AnalysisResult;
  reviews: ReviewRecordMap;
  onChangeReview: (rowKey: string, patch: { status?: ReviewStatus; note?: string }) => void;
}
```

Render metrics, department/seller breakdowns, and one un-nested section for each `FindingCategory`. Use category-specific explanatory text; do not call every finding a risk. Keep the existing editable review controls for review/action findings and render informational findings without forcing a review status.

- [ ] **Step 6: Integrate the new analysis result in App**

In `startAnalysis`, call `evaluateRulePack(rows, now)` once, then `buildAnalysis(rows, findings, now)`. Reconcile review records only for findings with level `review` or `action`. Replace the legacy CRM-history branch with the common five-area result component.

- [ ] **Step 7: Run analysis and App tests**

```bash
npm test -- src/domain/analysis.test.ts src/domain/issues.test.ts src/App.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit five-category analysis**

```bash
git add src/domain/analysis.ts src/domain/analysis.test.ts src/domain/issues.ts src/domain/issues.test.ts src/components/AnalysisResults.tsx src/App.tsx src/review.css
git commit -m "feat: present five analysis result areas"
```

## Task 6: Add Global Filters and Full-Page Projection

**Files:**
- Create: `src/domain/filters.ts`
- Create: `src/domain/filters.test.ts`
- Create: `src/components/AnalysisFilters.tsx`
- Create: `src/components/AnalysisFilters.test.tsx`
- Create: `src/filters.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write compound filter tests**

Create `src/domain/filters.test.ts`:

```ts
it('uses OR within a dimension and AND across dimensions', () => {
  const today = new Date('2026-07-21');
  const rows = [
    makeProject({ sourceKey: 'row-a', department: '华东一部', salesManager: '销售甲', amount: 1200 }),
    makeProject({ sourceKey: 'row-b', projectId: 'CRM-002', department: '华东一部', salesManager: '销售乙', amount: 5000 }),
    makeProject({ sourceKey: 'row-c', projectId: 'CRM-003', department: '华南部', salesManager: '销售丙', amount: 300 })
  ];
  const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  const filters = {
    ...EMPTY_FILTERS,
    departments: ['华东一部'],
    salesManagers: ['销售甲', '销售乙'],
    amountBands: ['大额', '超大']
  };
  expect(filterProjectKeys(analysis, {}, filters)).toEqual(new Set(['row-a', 'row-b']));
});

it('cascades seller options from selected departments', () => {
  const today = new Date('2026-07-21');
  const rows = [
    makeProject({ sourceKey: 'row-a', department: '华东一部', salesManager: '销售甲' }),
    makeProject({ sourceKey: 'row-c', projectId: 'CRM-003', department: '华南部', salesManager: '销售丙' })
  ];
  const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  const options = buildFilterOptions(analysis, { ...EMPTY_FILTERS, departments: ['华南部'] });
  expect(options.salesManagers.map((item) => item.value)).toEqual(['销售丙']);
});
```

Add these cases:

```ts
it('filters by text, finding label, and review status', () => {
  const rows = [makeProject({ sourceKey: 'a', projectName: '医院数改', customerName: '华城医院' })];
  const analysis = buildAnalysis(rows, [
    { ...evaluateRulePack(rows, new Date('2026-07-21'))[0], label: '跟进超期', category: '维护超期待整改', level: 'action' }
  ], new Date('2026-07-21'));
  const reviews = { a: { status: '待复核' } } as ReviewRecordMap;
  const filters = { ...EMPTY_FILTERS, query: '华城', labels: ['跟进超期'], reviewStatuses: ['待复核'] };
  expect(filterProjectKeys(analysis, reviews, filters)).toEqual(new Set(['a']));
  expect(describeFilters(filters)).toEqual(expect.arrayContaining(['关键词：华城', '标签：跟进超期', '审查状态：待复核']));
});

it('offers low-cardinality custom values and returns an empty set for impossible combinations', () => {
  const rows = Array.from({ length: 21 }, (_, index) => makeProject({
    sourceKey: `row-${index}`,
    projectId: `P-${index}`,
    department: index === 0 ? '华南部' : '华东部',
    customFields: { 项目来源: index % 2 ? '展会' : '转介绍', 唯一备注: `备注-${index}` }
  }));
  const today = new Date('2026-07-21');
  const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  const options = buildFilterOptions(analysis, EMPTY_FILTERS);
  expect(options.customFields['项目来源']).toEqual(['展会', '转介绍']);
  expect(options.customFields['唯一备注']).toBeUndefined();
  expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, departments: ['不存在'] })).toEqual(new Set());
});
```

- [ ] **Step 2: Run filter tests and verify they fail**

```bash
npm test -- src/domain/filters.test.ts
```

Expected: FAIL because the filter module does not exist.

- [ ] **Step 3: Implement filter state and matching**

Create `src/domain/filters.ts` with arrays rather than `Set` in state so React updates are serializable and testable:

```ts
export interface FilterState {
  departments: string[];
  salesManagers: string[];
  statuses: ProjectStatus[];
  probabilityBands: ProbabilityBand[];
  amountBands: string[];
  followUpBands: string[];
  reserveCycleBands: string[];
  categories: FindingCategory[];
  labels: string[];
  reviewStatuses: ReviewStatus[];
  query: string;
  customValues: Record<string, string[]>;
}

export const EMPTY_FILTERS: FilterState = {
  departments: [], salesManagers: [], statuses: [], probabilityBands: [],
  amountBands: [], followUpBands: [], reserveCycleBands: [], categories: [],
  labels: [], reviewStatuses: [], query: '', customValues: {}
};

export interface FilterOptions {
  departments: Array<{ value: string; count: number }>;
  salesManagers: Array<{ value: string; count: number }>;
  statuses: Array<{ value: ProjectStatus; count: number }>;
  probabilityBands: Array<{ value: ProbabilityBand; count: number }>;
  categories: Array<{ value: FindingCategory; count: number }>;
  labels: Array<{ value: string; count: number }>;
  customFields: Record<string, string[]>;
}

export function filterProjectKeys(
  analysis: AnalysisResult,
  reviews: ReviewRecordMap,
  filters: FilterState
): Set<string>;

export function buildFilterOptions(analysis: AnalysisResult, filters: FilterState): FilterOptions;
export function describeFilters(filters: FilterState): string[];
```

Search project ID, project name, and customer name with normalized case and spacing. Custom fields with 20 or fewer distinct values become multi-select options; fields above 20 distinct values remain searchable through the query input.

- [ ] **Step 4: Write filter component tests**

Create `src/components/AnalysisFilters.test.tsx`:

```tsx
it('updates department and seller filters and clears all conditions', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const today = new Date('2026-07-21');
  const rows = Array.from({ length: 12 }, (_, index) => makeProject({
    sourceKey: `row-${index}`,
    projectId: `CRM-${index}`,
    department: '华东一部',
    salesManager: index < 6 ? '销售甲' : '销售乙'
  }));
  const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  render(<AnalysisFilters analysis={analysis} filters={EMPTY_FILTERS} reviews={{}} onChange={onChange} />);

  await user.click(screen.getByRole('checkbox', { name: '华东一部 12个项目' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ departments: ['华东一部'] }));

  await user.click(screen.getByRole('button', { name: '清除全部筛选' }));
  expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTERS);
});
```

- [ ] **Step 5: Implement compact global filter controls**

Create `AnalysisFilters.tsx` with:

- visible keyword search;
- compact buttons opening checkbox groups for department, seller, project status, probability, amount, periods, result categories, labels, and review state;
- option counts;
- selected-condition chips with individual removal;
- “清除全部筛选”;
- `当前筛选 X / 全部 Y 个项目`.

Use department selection when deriving seller options. Do not render a dropdown with more than 20 custom values.

- [ ] **Step 6: Apply one projected analysis to the whole page**

In `src/App.tsx`, compute:

```ts
const selectedKeys = useMemo(
  () => analysis ? filterProjectKeys(analysis, reviewRecords, filters) : new Set<string>(),
  [analysis, reviewRecords, filters]
);
const visibleAnalysis = useMemo(
  () => analysis ? projectAnalysis(analysis, selectedKeys) : null,
  [analysis, selectedKeys]
);
```

Pass `visibleAnalysis` to metrics, charts, five result sections, and report generation. Keep the full `analysis` unchanged for rule truth and “导出全部结果”.

- [ ] **Step 7: Add responsive filter styling**

Create `src/filters.css`. Controls wrap at desktop widths and stack without horizontal overflow below 640px. Keep fixed control heights so option counts and active chips do not shift the results layout unexpectedly.

- [ ] **Step 8: Run filter, component, and App tests**

```bash
npm test -- src/domain/filters.test.ts src/components/AnalysisFilters.test.tsx src/App.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit global filtering**

```bash
git add src/domain/filters.ts src/domain/filters.test.ts src/components/AnalysisFilters.tsx src/components/AnalysisFilters.test.tsx src/filters.css src/App.tsx
git commit -m "feat: add global analysis filters"
```

## Task 7: Regenerate Reports and Exports from the Filtered Scope

**Files:**
- Modify: `src/domain/report.ts`
- Modify: `src/domain/report.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write filtered report tests**

Add to `src/domain/report.test.ts`:

```ts
it('states the filtered scope and excludes projects outside it', () => {
  const today = new Date('2026-07-21');
  const rows = [
    makeProject({ sourceKey: 'east', projectName: '华东项目', department: '华东一部', salesManager: '销售甲' }),
    makeProject({ sourceKey: 'south', projectId: 'CRM-002', projectName: '华南项目', department: '华南部', salesManager: '销售乙' })
  ];
  const full = buildAnalysis(rows, evaluateRulePack(rows, today), today);
  const projectedAnalysis = projectAnalysis(full, new Set(['east']));
  const report = createReviewReport(
    projectedAnalysis,
    {},
    today,
    ['部门：华东一部', '销售经理：销售甲']
  );
  expect(report).toContain('筛选范围：部门：华东一部；销售经理：销售甲');
  expect(report).toContain('华东项目');
  expect(report).not.toContain('华南项目');
});
```

Add a complete five-category report test:

```ts
it('renders all five confirmed result sections with new terminology', () => {
  const row = makeProject({ sourceKey: 'one' });
  const finding = (category: FindingCategory, label: string, level: FindingLevel): Finding => ({
    ruleId: label,
    rowKey: 'one',
    projectId: row.projectId,
    projectName: row.projectName,
    customerName: row.customerName,
    department: row.department,
    salesManager: row.salesManager,
    amountWan: row.amount,
    category,
    label,
    reason: `${label}规则说明`,
    level
  });
  const findings = [
    finding('数据质量待复核', '字段待补充', 'review'),
    finding('维护超期待整改', '跟进超期', 'action'),
    finding('维护超期待整改', '签约日期超期未更新', 'action'),
    finding('疑似重复与撞单', '疑似撞单待核验', 'review'),
    finding('重点项目复盘', '大额重点项目', 'info'),
    finding('经营结构分析', '询价及低概率项目', 'info')
  ];
  const analysis = buildAnalysis([row], findings, new Date('2026-07-21'));
  const report = createReviewReport(analysis, {}, new Date('2026-07-21'));

  expect(report).toContain('## 数据质量待复核');
  expect(report).toContain('## 维护超期待整改');
  expect(report).toContain('## 疑似重复与撞单');
  expect(report).toContain('## 重点项目复盘');
  expect(report).toContain('## 经营结构分析');
  expect(report).toContain('跟进超期');
  expect(report).toContain('签约日期超期未更新');
  expect(report).not.toContain('重点风险项目');
  expect(report).not.toContain('低概率重点项目');
});
```

- [ ] **Step 2: Run report tests and verify they fail**

```bash
npm test -- src/domain/report.test.ts
```

Expected: FAIL because the report function does not accept filter scope and still renders legacy categories.

- [ ] **Step 3: Render five report sections**

Change the signature to:

```ts
export function createReviewReport(
  analysis: AnalysisResult,
  reviews: ReviewRecordMap,
  today: Date,
  filterScope: string[] = []
): string;
```

Render the five result categories with evidence-bound wording. When filters are active, add `筛选范围：...` immediately after the generation date. Replace “重点风险项目” and “低概率重点项目” terminology with the confirmed names.

- [ ] **Step 4: Add explicit current/all report actions**

In `src/App.tsx`, keep two generated strings:

- current view: `visibleAnalysis` plus `describeFilters(filters)`;
- all results: full `analysis` with no filter scope.

The report panel displays the current view. The download menu offers “导出当前筛选结果” and “导出全部结果”, with filenames ending in `-当前筛选.md` and `-全部.md`.

- [ ] **Step 5: Run report and App tests**

```bash
npm test -- src/domain/report.test.ts src/App.test.tsx
```

Expected: both test files pass.

- [ ] **Step 6: Commit filtered reports and exports**

```bash
git add src/domain/report.ts src/domain/report.test.ts src/App.tsx
git commit -m "feat: export filtered review reports"
```

## Task 8: Complete Integration, Documentation, and Release Verification

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `src/review.css`
- Modify: `src/styles.css`

- [ ] **Step 1: Add an integration test for the main workflow**

In `src/App.test.tsx`, import `xlsx` and add this full-flow test:

```tsx
it('maps unfamiliar headers, analyzes rows, and applies one seller to every result', async () => {
  const user = userEvent.setup();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['客户', '商机名称', '业务负责人', '组织', '阶段', '预计合同额', '创建时间', '最后联系时间', '预计成交时间', '概率'],
    ['华城医院', '医院数改', '销售甲', '华东一部', '推进中', 1200, '2026-01-01', '2026-06-01', '2026-08-01', '51%-70%'],
    ['北原医院', '网络改造', '销售乙', '华东一部', '推进中', 300, '2026-02-01', '2026-07-10', '2026-09-01', '1%-50%'],
    ['云川医院', '机房升级', '销售丙', '华南部', '暂缓', 5000, '2025-01-01', '2026-06-01', '2026-06-30', '71%-80%']
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, '商机明细');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const file = new File([bytes], '企业商机表.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  render(<App />);
  await user.upload(screen.getByLabelText('选择 .xlsx 文件'), file);
  await user.click(screen.getByRole('button', { name: '确认表头行' }));
  await user.click(screen.getByRole('button', { name: '确认字段关系' }));
  await user.selectOptions(screen.getByLabelText('推进中对应状态'), '跟进中');
  await user.selectOptions(screen.getByLabelText('暂缓对应状态'), '呆滞');
  await user.click(screen.getByRole('button', { name: '确认状态口径' }));
  await user.click(screen.getByRole('button', { name: '开始规则分析' }));

  await user.click(screen.getByRole('button', { name: '销售经理筛选' }));
  await user.click(screen.getByRole('checkbox', { name: '销售甲 1个项目' }));

  expect(screen.getByText('当前筛选 1 / 全部 3 个项目')).toBeInTheDocument();
  expect(screen.getByLabelText('经营复盘草稿')).toHaveValue(
    expect.stringContaining('销售经理：销售甲')
  );
  expect(screen.getByText('跟进超期')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the integration test and fix only failures caused by this feature**

```bash
npm test -- src/App.test.tsx
```

Expected: PASS with the full upload-to-filter flow.

- [ ] **Step 3: Update product documentation**

In `README.md`, replace fixed-template instructions with:

- upload any `.xlsx` and choose sheet/header;
- confirm standard/custom/ignored mappings;
- map enterprise status values;
- review available/skipped rules;
- use five result areas and global filters;
- keep CRM as the official source of truth.

Do not describe saved templates, snapshot comparison, AI analysis, or CRM write-back as completed features.

- [ ] **Step 4: Run the complete automated suite**

```bash
npm test
```

Expected: all test files pass with zero failed tests.

- [ ] **Step 5: Run the production build**

```bash
npm run build
```

Expected: TypeScript compilation and Vite production build succeed.

- [ ] **Step 6: Run browser smoke tests with both sample profiles**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Verify at desktop `1440x900` and mobile `390x844`:

1. legacy sample opens through the new wizard;
2. unfamiliar column names receive reasonable local suggestions;
3. standard/custom/ignore controls remain readable;
4. both active and dormant projects can show “跟进超期”;
5. five result areas do not overlap;
6. department selection cascades seller options;
7. filtering changes metrics, charts, lists, and report together;
8. current/all exports download the correct scope;
9. no horizontal page overflow or clipped button text occurs.

- [ ] **Step 7: Update the changelog with verified facts**

Add a new release section to `CHANGELOG.md` only after Steps 4-6 pass. State the final test count, build result, browser sizes, arbitrary Excel mapping, confirmed rule pack, five result areas, and global filters. Do not claim CRM integration, AI analysis, or cross-import snapshots.

- [ ] **Step 8: Commit verified documentation and final polish**

```bash
git add README.md CHANGELOG.md src/App.test.tsx src/review.css src/styles.css
git commit -m "docs: document universal crm analysis workflow"
```

- [ ] **Step 9: Verify the final worktree and commit history**

```bash
git status --short
git log --oneline -8
```

Expected: no uncommitted files from this plan and one focused commit per completed task.
