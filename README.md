# CRM Project Review Assistant

English | [简体中文](README.zh-CN.md)

[![Status: Experimental](https://img.shields.io/badge/status-experimental-orange.svg)](#status)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A browser-based tool that turns a raw CRM pipeline `.xlsx` export into an auditable issue list, a human review queue, and a management review report.** Workbook parsing, rule evaluation, review state and report generation all run inside the browser tab — there is no backend, no API endpoint, no CRM write-back, and no AI.

> **Don't let AI guess business risk. Use explicit rules to flag issues, then let humans review them.**

It is built for sales operations staff, CRM administrators and business managers who currently rebuild the same project review by hand from a CRM export, and who need the result to be explainable line by line rather than merely plausible.

| | |
| --- | --- |
| **Current version** | `0.8.0` (tag `v0.8.0`, 2026-08-09) — see [Status](#status) |
| **Stack** | React + TypeScript + Vite, with SheetJS (`xlsx`) for client-side workbook parsing |
| **Scale** | 101 tracked files, 119 commits, 2026-07-16 → 2026-09-08 |
| **Validation** | 27 test files / 269 tests passing and a clean production build — all run on a developer machine, no CI |
| **Online demo** | <https://crm-project-review.pages.dev> — live, but it serves an **older build**; read [Online Demo](#online-demo) before judging it |
| **Sample data** | [`sample-data/CRM历史项目表-脱敏适配样表.xlsx`](sample-data/CRM历史项目表-脱敏适配样表.xlsx) — fully synthetic |

## Status

- **`0.8.0` is the current version, and it is consistent everywhere it is written down**: `package.json`, `package-lock.json`, `CHANGELOG.md` (`## V0.8 - 2026-08-09`), `docs/product/版本规划.md` (baseline `v0.8.0`, baseline date 2026-08-09) and the annotated git tag `v0.8.0` all agree.
- **The tag is one commit behind `main`.** `main` HEAD is `9ce2bae` (`docs: open source under MIT (#2)`, 2026-09-08). That commit has no `CHANGELOG.md` entry and no version bump, although `docs/product/版本规划.md` prescribes exactly that discipline for release commits.
- **There is no GitHub Release.** The repository has 2 tags (`v0.1.0-demo`, `v0.8.0`) and 0 releases, which is why this README carries a status badge instead of a release badge. A release badge would have nothing to point at.
- **There is no CI.** No `.github/` directory, no workflow files, and no lint or typecheck script. Every result in [Current Validation](#current-validation) was produced by running the command by hand.
- Pre-1.0, single-maintainer, and deliberately not described as production-ready. The in-app language is Chinese; the code, tests and documentation are the shipping surface.

## Why

A CRM pipeline review is normally manual: export the project table, add formulas, filter for anomalies, chart the result, and rewrite the same weekly summary. The work repeats, it depends on who is doing it, and projects that should have been reviewed get missed.

There are two obvious ways to automate that, and only one of them is defensible. A language model can read the export and produce a confident risk narrative — but then nobody can say which value produced which conclusion, and re-running it may tell a different story. The alternative is to write down the parts of the review that can be stated as explicit rules, run them deterministically over the mapped columns, and hand the flags to a person for the business judgement.

This project is the second one. That choice is the whole design, not a limitation waiting to be removed: the rule engine is a pure function with zero model calls, and every flag it produces is a **rule match**, never a confirmed business risk.

## Before / After

| | Wrong way: ask a model which projects are risky | This tool: deterministic flags, then human confirmation |
| --- | --- | --- |
| Origin of the judgement | Model output | 17 declared rules in `src/domain/rules.ts`, evaluated by a pure function |
| Can you see why a project was flagged? | Not reliably | Every finding carries `ruleId`, `category`, a human-readable `reason` and a level |
| Same input, second run | May differ | Same rows plus same reference date produce the same findings |
| What leaves the machine | The export, or a summary of it | Nothing — the file is read from memory in the tab |
| Who decides it is a real business risk | Implicitly, the model | Explicitly, a person, through 4 recorded review statuses |
| What the output proves | That text was generated | Which rule fired on which row, and what a human concluded |

## How It Works

```text
ProductLanding  →  开始分析
        ↓
Select an unencrypted .xlsx  +  required 数据来源标识（企业/账套）  +  worksheet
        ↓
ImportWizard 智能识别   →   数据已准备好   |   有 N 项需要确认
        confirmations:  表头行 · 项目状态 · 成单概率 · 金额单位
        查看识别详情:    字段识别 + 规则执行范围
        ↓
开始分析   →   evaluateRulePack(rows, today, options)   →   buildAnalysis
        ↓
AnalysisWorkspace tabs:   数据总览  |  问题项目  |  人工复核  |  复盘报告
        ↓
人工复核   →   ProjectReviewControl:  待复核 | 确认数据错误 | 确认业务风险 | 已忽略
        +  处理说明
        ↓
复盘报告   →   ReviewSummary   →   预览完整报告 (snapshot)   →   download Markdown
        ↓
导出项目明细.xlsx
```

Step by step, with the real labels from the UI:

| Step | What you do | What you get |
| --- | --- | --- |
| 1 | Open the product landing page and press **开始分析** | The review tool, with an empty import panel |
| 2 | Choose an `.xlsx` file, fill in the required **数据来源标识（企业/账套）**, pick a worksheet | File name and project-row count. Leaving the source identifier empty blocks the import with an alert instead of guessing |
| 3 | Read the **智能识别** result | Either **数据已准备好** or **有 N 项需要确认**; only genuinely ambiguous headers, statuses, probabilities or amount units are asked about |
| 4 | Optionally expand **查看识别详情** | **字段识别** (remap each source column, keep it as a renamed custom field, or ignore it) and **规则执行范围** (which of the 17 rules can run, and which are skipped for a missing field) |
| 5 | Press **开始分析** | The 数据总览 tab: totals, reserve amount, status mix, and department / sales-manager / follow-up-cycle / reserve-cycle / probability distributions |
| 6 | Work the **问题项目** tab | Findings grouped per project, 50 projects per page, with cross-page selection |
| 7 | Work the **人工复核** tab | One row per project needing a human call: a review status and a 处理说明 note, saved automatically |
| 8 | Open the **复盘报告** tab | **预览完整报告** opens a frozen snapshot in a drawer; from there, download the Markdown report or **导出项目明细.xlsx** |

Three things about this flow are worth stating plainly, because the shape of the product is easy to misread:

- **It is one continuous workspace, not four pages.** The landing page says so in the app's own words ("而不是翻阅四张独立页面"). Field mapping is not a separate page — it lives in the wizard's **查看识别详情** panel. The review queue is not a separate page either — it is the **人工复核** tab.
- **The output is two files, not one.** A Markdown management report *and* a 20-column Excel project-detail export.
- **Filters are global.** A filter set on the workspace also changes the metrics, the summaries, all five result categories and the generated report. The report states its own scope; with no filters active the scope reads `全部导入项目`.

## Core Capabilities

| Capability | What that means in practice |
| --- | --- |
| Arbitrary `.xlsx` import | Any unencrypted workbook; the wizard inspects sheets, ranks candidate header rows and diagnoses the layout (`ready` / `needs-confirmation` / `blocked`) |
| Field mapping without fixed templates | 17 canonical fields with Chinese and English alias tables; unmatched columns can be kept as renamed custom fields or ignored, and custom fields stay filterable |
| Minimal confirmation | Standard data goes straight to analysis; only an unclear header row, project status, 成单概率 or 金额单位 is put to the user |
| Probability parsing | Numbers, percentages, 询价类 and ranges such as `1%-50%` or `71%-80%`, preserved as business wording rather than coerced into a single number |
| Pre-flight rule report | Before analysis, each rule is listed as 可执行 or 跳过：缺少… — a missing field skips that rule only, it never blocks the others |
| Five result categories | 数据质量待复核 · 维护超期待整改 · 疑似重复与撞单 · 重点项目复盘 · 经营结构分析 |
| Global filtering | Keyword, 客户名称, 部门, 销售经理, 项目状态, 成单概率, amount range, 跟进周期, 储备周期, 结果分类, 标签, 审查状态, 行业, 区域, 项目类型, 项目等级 and custom fields |
| Project-level evidence | Findings are merged per project, with related projects (same customer, similar name, suspected collision) shown next to the row |
| Manual review with history | 4 statuses plus a 120-character 处理说明, autosaved; re-importing a project keeps its history and flags **数据已更新，待复核** when key fields changed |
| Review isolation by data source | Review records are keyed by the confirmed 数据来源标识, the worksheet and project identity — not by file name, so renaming a file does not orphan them |
| Preview-first reporting | The downloaded Markdown is byte-for-byte the snapshot that was previewed; the drawer detects a stale snapshot instead of silently exporting new content |
| Correct day arithmetic | Day differences are computed over UTC calendar days, so results do not shift across daylight-saving transitions |
| Export hardening | Report strings are escaped for Markdown, and Excel cell text is capped at 32,767 characters with an explicit truncation suffix |
| Accessible controls | Labelled inputs and selects, `role="alert"` for blocking errors, roving-focus tabs and keyboard-operable filter menus |

## Outputs / Artifacts

| Artifact | Defined by | Notes |
| --- | --- | --- |
| Markdown management report, 5 sections | `createReviewReport` in `src/domain/report.ts` | `一、本期经营结论` · `二、需要管理层决策的事项` · `三、重点项目处理清单` · `四、部门责任与后续安排` · `五、附录：数据范围与识别规则` |
| Downloaded report file | `src/App.tsx` | `储备项目经营复盘-YYYY-MM-DD-当前筛选.md`, written from a `Blob` of type `text/markdown;charset=utf-8` |
| Excel project-detail workbook | `createProjectDetailWorkbook` in `src/domain/projectDetailExport.ts` | 20 columns: 部门 · 销售经理 · 客户名称 · 项目编码 · 项目名称 · 项目状态 · 储备金额（万元） · 成单概率 · 创建日期 · 最近跟进日期 · 预计签约日期 · 跟进超期天数 · 签约超期天数 · 客观事实 · 人工核验问题 · 经营观察 · 全部分析结果 · 关联项目 · 人工判断状态 · 处理说明. Exports the selected projects, or the current filter when nothing is selected |
| Findings and aggregated analysis | `evaluateRulePack` / `buildAnalysis` | In-memory pure-function results: metrics, department and sales-manager breakdowns, follow-up and reserve-cycle buckets, probability mix |
| Review records | `src/domain/review.ts` | Persisted in `localStorage` under `crm-project-review-assistant:review-records:v1`; local to this browser only |

The report carries its own disclaimer, verbatim:

> 本报告基于本地导入数据和确定性规则生成；规则提供客观证据，真实原因和业务结论须由业务人员确认。
> *(This report is generated from locally imported data and deterministic rules; the rules provide objective evidence, and the real causes and business conclusions must be confirmed by business staff.)*

**Not produced:** any PDF, any server-side artifact, any CRM record, any notification or task assignment, and any AI-written text.

## Privacy: Everything Stays in the Browser

The claim is narrow, specific and verifiable, so it is worth stating precisely.

- **The workbook is parsed in memory in the tab.** `XLSX.read(await file.arrayBuffer(), …)` at `src/lib/workbook.ts:73` reads the bytes of the `File` object the user selected. No upload step exists.
- **There is no network call to leak it through.** Searching all of `src/` and `index.html` for `fetch(`, `axios`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` and absolute `http(s)://` URLs leaves exactly two outbound strings: the GitHub footer link at `src/App.tsx:294`, and an inline `data:` SVG namespace in `src/tool-theme.css`. There is no backend, no `/api/` route, no endpoint, no account and no database.
- **Review state is local and scoped.** Statuses and notes live in `localStorage`, isolated by the confirmed 数据来源标识（企业/账套）, the worksheet and project identity. That identifier is a local review key — it is never sent anywhere — and records do not sync across browsers or devices.
- **There is no CRM write-back of any kind.** No CRM client, no HTTP client, no credential handling and no write path exist in the tree. The tool reads a file and writes local Blob downloads; the source workbook is never modified, and corrections stay a job for the source system.
- **The repository contains only synthetic data.** All three bundled `.xlsx` fixtures were opened and inspected cell by cell: owners are `示例经理甲/乙/丙…`, regions are `示例区域甲…`, project ids are `CRM-001…` and `P-2026-001…030`, and one workbook states `不含真实客户信息` in a cell. No real company, customer, contact or phone data appears anywhere. No secrets, no `.env` file, and `.gitignore` deliberately excludes `real-data/`, `uploads/` and `.env*`.
- **Contribution rule:** submit sample data only after it has been de-identified and cleared for public release.

**What this is not:** there is no security audit, no penetration test, and no ISO/SOC/GDPR/等保 certification or claim. "Runs locally" describes the data path; it is not a compliance statement.

## Explainability: 17 Explicit Rules, Zero AI

The rule engine is a single pure function, `evaluateRulePack(rows, today, options)` in `src/domain/rules.ts`, with no I/O and no third-party dependency. It is driven by 17 declared rules and literal thresholds:

| Constant | Value | Meaning |
| --- | --- | --- |
| `FOLLOW_UP_LIMIT_DAYS` | 30 | Days without a valid follow-up before 跟进超期 |
| `LARGE_AMOUNT_WAN` | 1000 | 万元 — 重点 / 大额 threshold |
| `VERY_LARGE_AMOUNT_WAN` | 5000 | 万元 — 超大金额待复核 |
| `EXTREME_AMOUNT_WAN` | 10000 | 万元 — 极端金额待核实 |
| `REPEATED_AMOUNT_COUNT` | 5 | Same sales manager, same amount, repeated — 疑似占位金额 |
| `LONG_CYCLE_DAYS` | 180 | Reserve cycle entering 经营观察 |
| `LONG_TERM_DAYS` | 365 | Reserve cycle entering 长期储备复核 |

Boundary behaviour is pinned by tests rather than by prose: the exact 30-day boundary is *not* flagged; an impossible signing date outranks an overdue one and suppresses the duplicate flag; amount tiers step at 999.99 → no flag, 1000 → 大额重点项目, 5000 → 超大金额待复核, 10000 → 极端金额待核实; and evaluating the rule pack does not mutate the source rows.

**There is no AI in this codebase.** Searching every tracked file for `openai|anthropic|claude|gpt|llm|gemini|deepseek|api_key|Bearer` returns no model SDK, no API key and no endpoint. `CHANGELOG.md` records that no large-model API is connected, and `docs/product/版本规划.md` lists AI-assisted explanation as `规划中` (planned) for a future `v0.9.0` — planned, not shipped.

<details>
<summary><b>The 17 rules</b> (id, name, category, required fields)</summary>

| # | Rule id | Name | Category | Required fields |
| --- | --- | --- | --- | --- |
| 1 | `field-completeness` | 基础字段完整性 | 数据质量待复核 | — |
| 2 | `follow-up-overdue` | 跟进超期 | 维护超期待整改 | `status`, `lastFollowUpAt` |
| 3 | `signing-overdue` | 签约日期超期未更新 | 维护超期待整改 | `status`, `expectedSignAt` |
| 4 | `date-created-quality` | 创建日期完整性 | 数据质量待复核 | `createdAt` |
| 5 | `date-follow-up-quality` | 最近跟进日期完整性 | 数据质量待复核 | `lastFollowUpAt` |
| 6 | `date-signing-quality` | 预计签约日期完整性 | 数据质量待复核 | `expectedSignAt` |
| 7 | `date-last-follow-up` | 跟进日期逻辑异常 | 数据质量待复核 | `createdAt`, `lastFollowUpAt` |
| 8 | `date-expected-sign` | 签约日期逻辑异常 | 数据质量待复核 | `createdAt`, `expectedSignAt` |
| 9 | `amount-required` | 储备金额必须大于 0 | 数据质量待复核 | `amount`, `unit` |
| 10 | `amount-tier` | 重点项目金额分档 | 重点项目复盘 | `amount`, `unit` |
| 11 | `amount-placeholder` | 疑似占位金额 | 数据质量待复核 | `salesManager`, `amount`, `unit` |
| 12 | `duplicate-record` | 重复记录待核实 | 数据质量待复核 | `projectId` |
| 13 | `duplicate-project` | 疑似重复立项 | 疑似重复与撞单 | `projectId`, `customerName`, `projectName`, `salesManager` |
| 14 | `cross-seller-collision` | 疑似撞单待核验 | 疑似重复与撞单 | `projectId`, `customerName`, `projectName`, `salesManager` |
| 15 | `similar-name` | 名称相似待核验 | 疑似重复与撞单 | `customerName`, `projectName` |
| 16 | `probability-observation` | 询价及低概率项目 | 经营结构分析 | `probabilityBand` |
| 17 | `reserve-cycle` | 储备周期观察 | 经营结构分析 | `status`, `createdAt` |

A rule whose required fields are not mapped is reported as unavailable and skipped; it does not stop the other sixteen. Findings carry one of three levels — `info`, `review` or `action`.

</details>

### A flag is not a risk

This distinction is the product's entire point, so it is stated in three places and worth repeating here:

- The landing page separates the work into **客观事实** (what the rules can state directly: missing fields, overdue dates, duplicate records), **人工核验** (evidence shown to a person) and **经营观察** (structure and trend signals that are *not* risks on their own).
- Every finding is a **rule match on a mapped value**. `跟进超期` means "no valid follow-up in more than 30 days", not "this deal is failing".
- The report's appendix closes with 识别边界：规则只提供客观证据，真实原因和业务结论由业务人员确认。

So: the tool flags issues by explicit rule. A human decides whether each flag is a real business risk.

## Human Review: The Confirmation Boundary

The review layer is small, and deliberately so — it records a decision without pretending to make one.

| Element | Implementation |
| --- | --- |
| Review statuses | `待复核` · `确认数据错误` · `确认业务风险` · `已忽略` |
| Note | 处理说明, up to 120 characters, free text |
| Persistence | Automatic, in `localStorage` under `crm-project-review-assistant:review-records:v1` |
| Identity | Confirmed 数据来源标识 + worksheet + project identity, so a renamed file keeps its history and two tenants never share a key |
| History | Every change is kept; re-importing a project with changed key fields retains the history and marks it 数据已更新，待复核 |
| Effect on the report | Review counts and confirmed notes feed the report's decision sections and appendix — without re-running the analysis |

A human decision is required for every flagged project; there is no bulk "accept all" and no automatic conclusion. The tool's own summary of this boundary, from the landing page: *"CRM 始终是正式数据源。工具不修改原始 Excel，不回写 CRM，也不把 AI 推测当作业务事实。"*

## Online Demo

**<https://crm-project-review.pages.dev>** responds with HTTP 200 and is served by Cloudflare. The repository's GitHub `homepage` field points at it.

**It is not the current version.** The deployed build is measurably older than `main`, and this is checked rather than assumed:

| Check | Deployed build | `main` HEAD |
| --- | --- | --- |
| Workspace tabs | `分析总览` · `项目问题清单` · `复盘摘要` (3) | `数据总览` · `问题项目` · `人工复核` · `复盘报告` (4) |
| Report structure | `一、总体结论` … `五、建议行动` | `一、本期经营结论` … `五、附录` |
| Report action | `下载复盘摘要.md` | `预览完整报告` → snapshot → download |
| Strings found | `分析总览` · `项目问题清单` · `复盘摘要` · `下载复盘摘要.md`; **absent:** `数据总览`, `复盘报告`, `预览完整报告` | `数据总览` · `问题项目` · `人工复核` · `复盘报告` · `预览完整报告` |

The deployed bundle predates commit `947ec6b` (2026-08-05) — the commit that introduced
`数据总览` and the `人工复核` tab — and therefore predates the entire V0.8 feature set: the unified
workspace, the manual-review tab, the Excel detail export, the report preview snapshot and the
rebuilt report. The exact deployed commit hash is not recorded anywhere in the repository, so it
remains `TO_VERIFY`; a fresh local build emits different asset hashes from the deployed ones.

**What the demo is still useful for:** the import and smart-diagnosis experience, and the general shape of the review list. **What it cannot show you:** the 4-tab workspace, the 人工复核 tab, the preview-first report flow and the Excel export. For those, run the project locally — see [Quick Start](#quick-start).

Deployment is a manual step performed outside this repository (Cloudflare Pages). The project binding is not evidenced in the tree (no `wrangler.toml`, no CI, no deployment artifact), so this README does not document a deploy command it cannot verify. The older Workers address recorded in `CHANGELOG.md` no longer responds and is retained there only as history.

## Current Validation

Everything below was produced by running the commands in this repository, on Node v24.18.1 / npm 10.9.8, with dependencies resolved through `package-lock.json`.

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | **exit 0**, `added 164 packages` |
| `npm test` (`vitest run`) | **exit 0** — `Test Files 27 passed (27)`, `Tests 269 passed (269)` |
| `npm run build` (`tsc -b && vite build`) | **exit 0** — 1,804 modules transformed; `dist/index.html` 0.41 kB, CSS 69.72 kB, JS 727.99 kB (plus Vite's >500 kB chunk-size warning) |
| `npm run dev` | Vite started and served the app over HTTP 200 with the expected title `CRM 项目运营复盘助手` |
| `npm install --no-audit --no-fund` | exit 0, `up to date` |

The audit run of `npm test` reported a 7.01 s duration; a re-run measured 11.64 s on a machine under load. The pass counts were identical.

The tests are behavioural, not packaging checks. They cover rule boundary values (`does not flag the exact 30-day follow-up boundary`, `prioritizes impossible signing dates over overdue signing dates`), DST-safe day arithmetic, duplicate and collision handling, filter-to-report propagation, `Blob` and Excel export payloads, an asynchronous race where an earlier workbook inspection finishes later, and accessible roles. A single integration test drives a real workbook through the whole pipeline — analysis, seller filters, findings, metrics and report staying in sync.

**Honest caveat:** 22 of the 269 tests (about 8%) are **stylesheet source-text assertions**. They read a `.css` file and assert that a declaration string exists, so they would break on a harmless refactor and cannot prove visual behaviour. The remaining 92% are genuine behavioural assertions.

**Also honest:** `package.json` declares every dependency as `"latest"`; only `package-lock.json` pins them. The green result above is valid for the resolved versions (notably `vitest 4.1.10`, `vite 8.1.5`, `typescript 7.0.2`, `react 19.2.7`, `xlsx 0.18.5`). Nothing guards against a future `latest` resolution, because there is no CI.

**Evidence classes used in this README:** `VERIFIED` (run or read directly in the working copy), `HISTORICAL` (true of an earlier design or release, not of current code), `TO_VERIFY` (stated as unknown rather than guessed).

<details>
<summary><b>Sustained-development evidence in <code>CHANGELOG.md</code></b></summary>

`CHANGELOG.md` records 8 versions, V0.1 (2026-07-17) through V0.8 (2026-08-09), each with code
commit SHAs and validation results — `32/32` tests at V0.4 (`f9fc679`), `34/34` at V0.5 (`4153785`),
`136/136` at V0.6, the production deployment commit `80f0dcd` at V0.7, and the `0.8.0` version
baseline at V0.8. All five cited commits exist in the repository history. V0.6 also records
browser acceptance at two viewports, `1440x900` and `390x844`, including cascade behaviour between
department and sales-manager filters and confirmation that the results table scrolls inside its own
container on mobile.

</details>

## Example: A Full Review Run

```bash
git clone https://github.com/KanG-ciyuan/crm-project-review-assistant.git
cd crm-project-review-assistant
npm ci
npm run dev
```

Then, in the browser:

1. Press **开始分析** on the landing page.
2. Select [`sample-data/CRM历史项目表-脱敏适配样表.xlsx`](sample-data/CRM历史项目表-脱敏适配样表.xlsx) — 6 synthetic project rows with fictional owners (`示例经理甲`…) and ids `CRM-001…CRM-006`.
3. Enter a **数据来源标识（企业/账套）** such as `示例企业 CRM`, and keep the detected worksheet.
4. The wizard shows **数据已准备好**: the shipped sample resolves with zero confirmation prompts. Expand **查看识别详情** to see the field mapping and which rules are executable.
5. Press **开始分析**, then review the findings in **问题项目** — follow-up overdue, probability observations and reserve-cycle items appear as rule-backed evidence for the sample rows.
6. In **人工复核**, set a **审查状态** and write a **处理说明** for one project. It saves as you type.
7. In **复盘报告**, press **预览完整报告**. The drawer shows the frozen snapshot and its 筛选范围; download the Markdown, then use **导出项目明细.xlsx** to export the current filter scope.

The second fixture, [`sample-data/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx`](sample-data/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx), is a 30-project acceptance workbook with a `测试预期结果` sheet; it also imports with **数据已准备好** and resolves to 30 project rows.

## Use / Not Use

| Use it when | Do not use it for |
| --- | --- |
| You have a CRM project/pipeline export as an unencrypted `.xlsx` and want a repeatable first-pass review | Reading from a CRM system directly — there is no connector |
| You need every flag to be traceable to a written rule and a source row | Writing anything back to a CRM or correcting the source data for you |
| You want a management review draft as Markdown plus an Excel detail sheet | PDF export, scheduled reports, or email delivery |
| A human will review and record the business conclusion | Letting the tool decide which projects are genuinely at risk |
| Single-analyst use on one browser profile | Multi-user collaboration, accounts, databases, task assignment, remediation tracking or notifications |
| | Cross-device or cloud-synced review state |
| | Encrypted or non-`.xlsx` workbooks |
| | AI-generated analysis — that is planned for a future `v0.9.0`, not implemented |

## Known Limitations

1. **Rule thresholds are displayed but cannot be changed.** `src/App.tsx:313` renders the two visible thresholds as `<input … disabled />`, and all 17 rules are declared `adjustable: false`. The consequence is that `enabledRuleIds` in the rule options is unreachable code. The project's own field-dictionary document requires thresholds to be "visible and adjustable" in the page — the visible half is implemented, the adjustable half is not. Do not expect to tune thresholds in the UI.
2. **No CI and no static checks.** There is no `.github/`, no lint script and no typecheck script; `tsc -b` runs only as part of `npm run build`.
3. **22 of 269 tests are CSS text-regex assertions** (see [Current Validation](#current-validation)); there is no coverage script and no coverage report.
4. **Dependency versions are declared as `"latest"`** in `package.json`, so only the lockfile is a real pin.
5. **The online demo is stale** and predates the V0.8 feature set (see [Online Demo](#online-demo)).
6. **No GitHub Release exists** despite two tags, and the `v0.8.0` tag is one commit behind `main` with no CHANGELOG entry for that commit.
7. **Superseded design documents are still published.** `docs/product/V1-PRD.md`, `docs/product/产品基础定义.md` and `docs/product/产品流程与页面结构图.md` describe an earlier design — 14-day and 90-day thresholds, a 75th-percentile high-amount rule, and an AI backend — that the shipped engine does not implement (it uses 30/180/365 days, fixed amount tiers, and no AI). Treat them as `HISTORICAL`. The authoritative references for the shipped rules are `src/domain/rules.ts`, `CHANGELOG.md` and [`docs/product/CRM历史项目表-字段字典与规则确认稿.md`](docs/product/CRM历史项目表-字段字典与规则确认稿.md).
8. **`scripts/create-crm-history-sample.mjs` is orphaned and not runnable.** It imports `@oai/artifact-tool`, which is not declared in `package.json`, so the sample workbook cannot be regenerated from the repository as shipped.
9. **The app download and the README link point at different bytes.** `public/CRM历史项目表-脱敏适配样表.xlsx` and `sample-data/CRM历史项目表-脱敏适配样表.xlsx` share a file name but have different SHA-256 hashes (they encode probability differently). Both import cleanly; the duplication is a maintenance hazard.
10. **`LICENSE` names the holder as the bare string `Copyright (c) Kang`**, which does not match the account name `KanG-ciyuan` used everywhere else. The MIT text itself is verbatim-correct and GitHub reports the license as MIT. Reported for a maintainer decision; the file was not modified.
11. **Historical third-party tooling residue.** Nine documents carry a `superpowers:subagent-driven-development` boilerplate header and live under a `docs/superpowers/` directory from an external agent workflow. The plans were executed and are still legible as design records, but the branding is foreign to this project.
12. **A historical plan document publishes an absolute filesystem path from the author's machine.** It is a minor publication-hygiene issue with no credentials involved; the path is intentionally not reproduced here.
13. **Documentation/code drift inside the repo.** The field-dictionary document describes a four-level 成单概率 enum and a two-value status set that the code does not implement (probability is kept as its original wording, and the code accepts five statuses). The code is authoritative.
14. **The landing page shows illustrative figures.** The hero and preview panels display a labelled, non-interactive demo (project counts, amount distributions) marked 演示数据; those numbers are mock content for the marketing surface, not output from any analysis run.
15. **No `SECURITY.md`, `CONTRIBUTING.md` or `CODE_OF_CONDUCT.md`,** and no issue or pull-request templates.

## Quick Start

Requirements: Node.js and npm. The verified environment was Node v24.18.1 with npm 10.9.8; the repository declares no `engines` constraint.

```bash
git clone https://github.com/KanG-ciyuan/crm-project-review-assistant.git
cd crm-project-review-assistant

npm ci            # reproducible install from package-lock.json (exit 0, 164 packages)
npm run dev       # Vite dev server; prints the local URL

npm test          # vitest run — 27 files, 269 tests
npm run build     # tsc -b && vite build — emits dist/
```

`npm install` also works if you prefer it to `npm ci`. All of the commands above were executed in this repository as part of writing this README; the results are in [Current Validation](#current-validation).

<details>
<summary><b>Repository layout</b></summary>

```text
src/domain/          Rule engine, analysis, field mapping, filters, review state,
                     report model and Markdown writer, Excel detail export
src/lib/             Workbook inspection and sheet parsing (SheetJS)
src/components/      ProductLanding, ImportWizard, AnalysisWorkspace and its tabs
src/App.tsx          Orchestration: import → analyze → review → report
sample-data/         Synthetic sample workbooks safe for public use
public/              Static assets, including the workbook served by the app's download link
docs/product/        Product definition, PRD, flow diagrams, field dictionary, version plan
docs/plan/           V1 implementation plan
docs/superpowers/    Per-feature design and plan records (see Known Limitations)
CHANGELOG.md         Release history with commits and recorded validation results
```

</details>

## Ecosystem

This application is applied work at the **DISCOVER → DEFINE** boundary: it takes an
enterprise's real CRM operations export, turns the reviewable parts of that workflow into an
explicit, versioned rule set with human confirmation at every judgement point, and produces
auditable artifacts from it.

```text
DISCOVER
Enterprise AI Diagnostic Skills
        ↓
DEFINE
Kang Product Architect
Kang Enterprise Process Reviewer
        ↓
BUILD & COORDINATE
Kang Agent Workforce
Kang Agent Collab
Kang Frontend Standard
        ↓
VERIFY
Kang B2B UX Auditor
Kang Product Acceptance Auditor
        ↓
DELIVER
Kang GitHub README
Kang PPT Skill
```

> This is an ecosystem map, not a strict runtime pipeline. The stages describe where
> each project sits in the work, not a mandatory execution order.

---

## Part of the Kang Open-Source AI System

This project is one part of an evidence-driven system for enterprise AI transformation,
agent collaboration, and AI-native product delivery.

| Stage | Project | Role |
| --- | --- | --- |
| DISCOVER | [enterprise-ai-diagnostic-skills](https://github.com/KanG-ciyuan/enterprise-ai-diagnostic-skills) | Understand how the business actually works before automating it |
| DEFINE | [kang-product-architect](https://github.com/KanG-ciyuan/kang-product-architect) | Turn ambiguous requirements into an implementation-ready product contract |
| DEFINE | [kang-enterprise-process-reviewer](https://github.com/KanG-ciyuan/kang-enterprise-process-reviewer) | Review whether workflows are executable, accountable and recoverable |
| BUILD & COORDINATE | [kang-agent-workforce](https://github.com/KanG-ciyuan/kang-agent-workforce) | Role-based AI product workforce with explicit handoffs |
| BUILD & COORDINATE | [kang-agent-collab](https://github.com/KanG-ciyuan/kang-agent-collab) | Agent collaboration and handoff protocol |
| BUILD & COORDINATE | [kang-frontend-standard](https://github.com/KanG-ciyuan/kang-frontend-standard) | Frontend quality standard for AI-built interfaces |
| VERIFY | [kang-b2b-ux-auditor](https://github.com/KanG-ciyuan/kang-b2b-ux-auditor) | Can users actually finish the work? |
| VERIFY | [kang-product-acceptance-auditor](https://github.com/KanG-ciyuan/kang-product-acceptance-auditor) | Independent acceptance of AI-built products |
| DELIVER | [kang-github-readme](https://github.com/KanG-ciyuan/kang-github-readme) | Evidence-aware README engineering |
| DELIVER | [kang-ppt-skill](https://github.com/KanG-ciyuan/kang-ppt-skill) | Evidence-aware presentation design |

**Cross-cutting infrastructure:** [kang-meta-skill](https://github.com/KanG-ciyuan/kang-meta-skill) —
Skill engineering, evaluation and release governance.

**Earlier work:** [ai-agent-rules](https://github.com/KanG-ciyuan/ai-agent-rules),
[workflow-five-steps](https://github.com/KanG-ciyuan/workflow-five-steps),
[renovation-agent](https://github.com/KanG-ciyuan/renovation-agent).

**Project documents:** [CHANGELOG.md](CHANGELOG.md) ·
[docs/product/版本规划.md](docs/product/版本规划.md) ·
[docs/product/CRM历史项目表-字段字典与规则确认稿.md](docs/product/CRM历史项目表-字段字典与规则确认稿.md) ·
[docs/product/V1-PRD.md](docs/product/V1-PRD.md) (HISTORICAL) ·
[docs/product/产品基础定义.md](docs/product/产品基础定义.md) (HISTORICAL) ·
[docs/product/产品流程与页面结构图.md](docs/product/产品流程与页面结构图.md) (HISTORICAL)

Feedback: issues and pull requests are welcome. Before submitting sample data, confirm it has been de-identified and cleared for public release.

## License

Released under the [MIT License](LICENSE).
