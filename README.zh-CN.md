# CRM 储备项目运营复盘助手

[English](README.md) | 简体中文

[![Status: Experimental](https://img.shields.io/badge/status-experimental-orange.svg)](#项目状态)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**将 CRM 导出的项目 `.xlsx` 转化为可复核的问题清单、人工复核队列和经营复盘报告的浏览器工具。** 工作簿解析、规则计算、复核状态和报告生成全部在浏览器标签页内完成：没有后端、没有 API 接口、不回写 CRM，也不使用 AI。

> **不让 AI 猜业务风险。用显式规则标记问题，再交给人工复核。**

它面向销售运营、CRM 管理员和业务管理者：这些人目前需要从 CRM 手工导出并重复搭建同一套项目复盘，并且需要一个能逐条解释、而不是"看起来合理"的结果。

| | |
| --- | --- |
| **当前版本** | `0.8.0`（标签 `v0.8.0`，2026-08-09）——详见[项目状态](#项目状态) |
| **技术栈** | React + TypeScript + Vite，使用 SheetJS（`xlsx`）在浏览器本地解析工作簿 |
| **规模** | 101 个受版本管理文件，119 次提交，2026-07-16 → 2026-09-08 |
| **验证** | 27 个测试文件 / 269 条测试全部通过，生产构建通过——均在开发机上手工执行，无 CI |
| **在线演示** | <https://crm-project-review.pages.dev>——可以访问，但部署的是**较早版本**；请先阅读[在线演示](#在线演示) |
| **示例数据** | [`sample-data/CRM历史项目表-脱敏适配样表.xlsx`](sample-data/CRM历史项目表-脱敏适配样表.xlsx)——完全合成，不含真实数据 |

## 项目状态

- **当前版本 `0.8.0`，所有记录它的地方都一致**：`package.json`、`package-lock.json`、`CHANGELOG.md`（`## V0.8 - 2026-08-09`）、`docs/product/版本规划.md`（基线 `v0.8.0`，基线日期 2026-08-09）以及 git 标签 `v0.8.0` 相互吻合。
- **标签落后 `main` 一个提交。** `main` 的 HEAD 是 `9ce2bae`（`docs: open source under MIT (#2)`，2026-09-08）。该提交没有对应的 `CHANGELOG.md` 条目，也没有版本号变更，而 `docs/product/版本规划.md` 恰恰要求版本提交遵循这一流程。
- **没有 GitHub Release。** 仓库有 2 个标签（`v0.1.0-demo`、`v0.8.0`）、0 个 Release，因此本 README 使用状态徽章而不是 Release 徽章——Release 徽章目前没有可指向的对象。
- **没有 CI。** 没有 `.github/` 目录、没有工作流文件，也没有 lint 或类型检查脚本。[当前验证结果](#当前验证结果)中的每一项都是手工执行命令得到的。
- 处于 1.0 之前、单人维护，并且明确不宣称"生产可用"。应用界面语言为中文；代码、测试和文档是发布面。

## 为什么做这件事

CRM 项目复盘通常是手工完成的：导出项目表、套公式、筛异常、做图表，再把同一份周报重写一遍。这件事重复、依赖个人经验，而且容易遗漏本该复核的项目。

自动化它有两条路，但只有一条站得住脚。让大模型读一遍导出的表、生成一段自信的风险叙述是可行的；但这样一来，没人说得清哪个数字导致了哪个结论，重新跑一遍还可能得到另一套说法。另一条路是把复盘中能够被明确表达的部分写成显式规则、确定性地跑在已映射的字段上，再把标记结果交给人工做业务判断。

本项目是第二条路。这不是一个等待被移除的限制，而是整个设计本身：规则引擎是一个纯函数，零模型调用，它产生的每一条标记都是**规则命中**，永远不是已被确认的业务风险。

## 错误做法与正确做法

| | 错误做法：让模型判断哪些项目有风险 | 本项目：确定性标记 + 人工确认 |
| --- | --- | --- |
| 判断来自哪里 | 模型输出 | `src/domain/rules.ts` 中声明的 17 条规则，由纯函数执行 |
| 能否看出为什么被标记 | 无法可靠回答 | 每条结果都带有 `ruleId`、`category`、可读的 `reason` 和等级 |
| 同样的输入再跑一次 | 可能不同 | 同样的数据加同样的基准日期，结果一致 |
| 什么数据离开了本机 | 导出文件或它的摘要 | 什么都不离开，文件只在标签页内存中读取 |
| 谁判定它是真实业务风险 | 实际上是模型 | 明确由人工通过 4 种复核状态记录 |
| 产出的东西能证明什么 | 证明生成过一段文字 | 哪条规则命中哪一行，以及人工得出了什么结论 |

## 工作流程

```text
ProductLanding  →  开始分析
        ↓
选择未加密的 .xlsx  +  必填的 数据来源标识（企业/账套）  +  工作表
        ↓
ImportWizard 智能识别   →   数据已准备好   |   有 N 项需要确认
        确认项：  表头行 · 项目状态 · 成单概率 · 金额单位
        查看识别详情：  字段识别 + 规则执行范围
        ↓
开始分析   →   evaluateRulePack(rows, today, options)   →   buildAnalysis
        ↓
AnalysisWorkspace 标签页：  数据总览  |  问题项目  |  人工复核  |  复盘报告
        ↓
人工复核   →   ProjectReviewControl：  待复核 | 确认数据错误 | 确认业务风险 | 已忽略
        +  处理说明
        ↓
复盘报告   →   ReviewSummary   →   预览完整报告（快照）   →   下载 Markdown
        ↓
导出项目明细.xlsx
```

分步说明（使用界面上的真实名称）：

| 步骤 | 你要做什么 | 你会得到什么 |
| --- | --- | --- |
| 1 | 打开产品首页，点击 **开始分析** | 进入复盘工具，导入面板为空 |
| 2 | 选择 `.xlsx` 文件，填写必填的 **数据来源标识（企业/账套）**，选择工作表 | 文件名和项目条数。来源标识为空时会以告警阻断导入，而不是替用户猜一个值 |
| 3 | 查看 **智能识别** 结果 | **数据已准备好** 或 **有 N 项需要确认**；只有确实无法判断的表头、状态、概率或金额单位才会提问 |
| 4 | 可展开 **查看识别详情** | **字段识别**（每个源列可重新映射、保留为改名后的自定义字段，或忽略）与 **规则执行范围**（17 条规则中哪些可执行、哪些因缺字段被跳过） |
| 5 | 点击 **开始分析** | 数据总览标签页：项目数与储备金额、状态分布，以及部门 / 销售经理 / 跟进周期 / 储备周期 / 概率结构 |
| 6 | 处理 **问题项目** 标签页 | 按项目合并的结果，每页 50 个项目，支持跨页选择 |
| 7 | 处理 **人工复核** 标签页 | 每个待判断项目一行：审查状态与处理说明，自动保存 |
| 8 | 打开 **复盘报告** 标签页 | **预览完整报告** 在抽屉中打开冻结的快照；随后可下载 Markdown 报告，或 **导出项目明细.xlsx** |

有三点值得直接说明，因为产品的形态很容易被误读：

- **这是一个连续的工作台，而不是四张页面。** 首页用应用自己的话说明了这一点（"而不是翻阅四张独立页面"）。字段映射不是独立页面——它在导入向导的 **查看识别详情** 面板里；复核队列也不是独立页面——它就是 **人工复核** 标签页。
- **产出是两个文件，不是一份。** Markdown 经营复盘报告 **和** 20 列的 Excel 项目明细导出。
- **筛选是全局的。** 在工作台设置的筛选同时作用于指标、汇总、五类结果和生成的报告。报告会写明自身的筛选范围；没有筛选时范围显示为 `全部导入项目`。

## 核心能力

| 能力 | 实际含义 |
| --- | --- |
| 任意 `.xlsx` 导入 | 支持任意未加密工作簿；向导会检查工作表、排序候选表头行并诊断结构（`ready` / `needs-confirmation` / `blocked`） |
| 无需固定模板的字段映射 | 17 个标准字段配中英文别名表；未匹配的列可保留为改名后的自定义字段或直接忽略，自定义字段同样可参与筛选 |
| 最小化确认 | 标准数据直接进入分析；只有无法判断的表头行、项目状态、成单概率或金额单位才交给用户确认 |
| 成单概率口径解析 | 支持数值、百分比、询价类以及 `1%-50%`、`71%-80%` 等区间，并保留原始业务口径，不强行折算成单一数字 |
| 分析前的规则能力清单 | 分析前逐条显示 可执行 或 跳过：缺少…——缺少字段只跳过该条规则，绝不阻断其他规则 |
| 五类结果区域 | 数据质量待复核 · 维护超期待整改 · 疑似重复与撞单 · 重点项目复盘 · 经营结构分析 |
| 全局筛选 | 关键词、客户名称、部门、销售经理、项目状态、成单概率、金额区间、跟进周期、储备周期、结果分类、标签、审查状态、行业、区域、项目类型、项目等级以及自定义字段 |
| 项目级证据 | 规则结果按项目合并，并在同一行展示关联项目（同客户、名称相似、疑似撞单） |
| 带历史的人工复核 | 4 种审查状态加 120 字处理说明，自动保存；重新导入同一项目时保留历史，关键字段变化时标记 **数据已更新，待复核** |
| 按数据来源隔离复核记录 | 记录按用户确认的数据来源标识、工作表和项目身份隔离，而不是按文件名；文件改名不会让历史记录失效 |
| 先预览后下载的报告 | 下载的 Markdown 与预览的快照完全一致；快照过期时抽屉会明确提示，而不是悄悄导出新内容 |
| 不受夏令时影响的日期计算 | 天数差按 UTC 自然日计算，跨夏令时切换时结果不会偏移 |
| 导出加固 | 报告中的用户字符串做 Markdown 转义；Excel 单元格文本上限 32,767 字符，超出时附加明确的截断后缀 |
| 可访问性 | 控件带标签，阻断性错误使用 `role="alert"`，标签页支持方向键焦点切换，筛选菜单可键盘操作 |

## 产出物

| 产出物 | 定义位置 | 说明 |
| --- | --- | --- |
| 5 段式 Markdown 经营复盘报告 | `src/domain/report.ts` 的 `createReviewReport` | `一、本期经营结论` · `二、需要管理层决策的事项` · `三、重点项目处理清单` · `四、部门责任与后续安排` · `五、附录：数据范围与识别规则` |
| 下载的报告文件 | `src/App.tsx` | `储备项目经营复盘-YYYY-MM-DD-当前筛选.md`，由 `text/markdown;charset=utf-8` 的 `Blob` 写出 |
| Excel 项目明细工作簿 | `src/domain/projectDetailExport.ts` 的 `createProjectDetailWorkbook` | 20 列：部门 · 销售经理 · 客户名称 · 项目编码 · 项目名称 · 项目状态 · 储备金额（万元） · 成单概率 · 创建日期 · 最近跟进日期 · 预计签约日期 · 跟进超期天数 · 签约超期天数 · 客观事实 · 人工核验问题 · 经营观察 · 全部分析结果 · 关联项目 · 人工判断状态 · 处理说明。导出所选项目；未选择时导出当前筛选范围 |
| 规则结果与汇总分析 | `evaluateRulePack` / `buildAnalysis` | 纯函数产出：指标、部门与销售经理分布、跟进与储备周期分桶、概率结构 |
| 复核记录 | `src/domain/review.ts` | 保存在 `localStorage` 的 `crm-project-review-assistant:review-records:v1` 下，仅限当前浏览器 |

报告自带免责声明，原文如下：

> 本报告基于本地导入数据和确定性规则生成；规则提供客观证据，真实原因和业务结论须由业务人员确认。

**不产出的内容：** 任何 PDF、任何服务端产物、任何 CRM 记录、任何通知或任务派发，以及任何由 AI 撰写的文本。

## 隐私：数据全部留在浏览器

这个声明很窄、很具体，也可以被验证，所以值得精确表述。

- **工作簿在标签页内存中解析。** `src/lib/workbook.ts:73` 的 `XLSX.read(await file.arrayBuffer(), …)` 直接读取用户所选 `File` 对象的字节，不存在上传步骤。
- **也没有任何可以泄露它的网络调用。** 在 `src/` 全目录和 `index.html` 中搜索 `fetch(`、`axios`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon` 以及绝对 `http(s)://` 地址，只命中两处出站字符串：`src/App.tsx:294` 的 GitHub 页脚链接，以及 `src/tool-theme.css` 中一段内联 `data:` SVG 命名空间。没有后端、没有 `/api/` 路由、没有接口地址、没有账号、没有数据库。
- **复核状态是本地且隔离的。** 审查状态和处理说明保存在 `localStorage`，按用户确认的"数据来源标识（企业/账套）"、工作表和项目身份隔离。该标识只用于本地复核键，不会发送到外部；记录跨浏览器和跨设备不会同步。文件名只用于提供建议初值：同一企业或 CRM 账套每次重导应保持标识一致，不同企业或账套必须使用不同标识；文件改名后只要继续使用原标识，历史复核记录仍可恢复。
- **不存在任何形式的 CRM 回写。** 代码树中没有 CRM 客户端、没有 HTTP 客户端、没有凭据处理、没有写入路径。工具只读取文件并写出本地 Blob 下载；原始 Excel 不会被修改，真实修正仍由业务人员在源系统完成。
- **仓库内只有合成数据。** 三个随仓库提供的 `.xlsx` 文件都经过逐单元格检查：负责人为 `示例经理甲/乙/丙…`，区域为 `示例区域甲…`，项目编号为 `CRM-001…` 和 `P-2026-001…030`，其中一个工作簿直接在单元格中声明"不含真实客户信息"。全仓库没有真实公司、客户、联系人或电话数据，没有密钥，没有 `.env` 文件，`.gitignore` 也刻意排除了 `real-data/`、`uploads/` 和 `.env*`。
- **共建约定：** 提交示例数据前，请确认数据已经脱敏且具备公开授权。

**这不能说明什么：** 仓库没有安全审计、没有渗透测试，也不做 ISO/SOC/GDPR/等保 之类的合规声明。"本地运行"描述的是数据路径，不是合规结论。

## 可解释性：17 条显式规则，零 AI

规则引擎是 `src/domain/rules.ts` 中唯一的纯函数 `evaluateRulePack(rows, today, options)`，没有 I/O，也没有第三方依赖。它由 17 条声明式规则和字面量阈值驱动：

| 常量 | 取值 | 含义 |
| --- | --- | --- |
| `FOLLOW_UP_LIMIT_DAYS` | 30 | 无有效跟进达到该天数即触发 跟进超期 |
| `LARGE_AMOUNT_WAN` | 1000 | 万元——重点 / 大额档 |
| `VERY_LARGE_AMOUNT_WAN` | 5000 | 万元——超大金额待复核 |
| `EXTREME_AMOUNT_WAN` | 10000 | 万元——极端金额待核实 |
| `REPEATED_AMOUNT_COUNT` | 5 | 同一销售、同一金额重复达到该数量即 疑似占位金额 |
| `LONG_CYCLE_DAYS` | 180 | 储备周期进入 经营观察 |
| `LONG_TERM_DAYS` | 365 | 储备周期进入 长期储备复核 |

边界行为由测试而不是由文档保证：恰好 30 天不会触发 跟进超期；签约日期逻辑异常会优先于逾期并抑制重复标记；金额分档在 999.99 → 不标记、1000 → 大额重点项目、5000 → 超大金额待复核、10000 → 极端金额待核实；执行规则包不会改动源数据中的金额。

**这份代码库里没有 AI。** 在所有受版本管理的文件中搜索 `openai|anthropic|claude|gpt|llm|gemini|deepseek|api_key|Bearer`，没有任何模型 SDK、密钥或接口地址。`CHANGELOG.md` 记录"尚未接入大模型 API"，`docs/product/版本规划.md` 把 AI 辅助解释列为未来 `v0.9.0` 的 `规划中` 能力——是规划，不是已发布。

<details>
<summary><b>17 条规则清单</b>（规则 id、名称、分类、依赖字段）</summary>

| # | 规则 id | 名称 | 分类 | 依赖字段 |
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

依赖字段未被映射的规则会显示为不可执行并被跳过，不会阻断其余规则。每条结果带有 `info`、`review`、`action` 三种等级之一。

</details>

### 标记不等于风险

这个区分就是产品的全部要点，因此它在三个地方被说明，这里再重复一次：

- 首页把工作分成 **客观事实**（规则能直接确认的字段缺失、日期超期与重复记录）、**人工核验**（把证据展示给人）和 **经营观察**（用于发现结构与趋势，本身不等于风险）。
- 每条结果都是**某个已映射字段上的规则命中**。`跟进超期` 的含义是"超过 30 天没有有效跟进"，不是"这个项目要丢"。
- 报告附录以这句话收尾：识别边界：规则只提供客观证据，真实原因和业务结论由业务人员确认。

所以：工具负责用显式规则标记问题，是不是真实的业务风险由人工判断。

## 人工复核：确认边界

复核层很小，而且是刻意如此——它记录一个决定，而不是假装做出决定。

| 元素 | 实现 |
| --- | --- |
| 审查状态 | `待复核` · `确认数据错误` · `确认业务风险` · `已忽略` |
| 说明 | 处理说明，最多 120 字，自由文本 |
| 持久化 | 自动保存到 `localStorage` 的 `crm-project-review-assistant:review-records:v1` |
| 身份 | 已确认的数据来源标识 + 工作表 + 项目身份；文件改名不丢历史，不同企业或账套不会共用同一条记录 |
| 历史 | 每次变更都会保留；重新导入且关键字段变化时保留历史并标记 数据已更新，待复核 |
| 对报告的影响 | 复核计数与已确认说明进入报告的决策章节和附录，无需重新运行分析 |

每个被标记的项目都需要一次人工决定；没有"全部接受"，也没有自动结论。这条边界在应用中的原文是：*"CRM 始终是正式数据源。工具不修改原始 Excel，不回写 CRM，也不把 AI 推测当作业务事实。"*

## 在线演示

**<https://crm-project-review.pages.dev>** 返回 HTTP 200，由 Cloudflare 提供服务。仓库的 GitHub `homepage` 字段也指向该地址。

**它不是当前版本。** 部署的构建明显早于 `main`，这一点经过核对而不是靠推测：

| 核对项 | 部署版本 | `main` HEAD |
| --- | --- | --- |
| 工作台标签页 | `分析总览` · `项目问题清单` · `复盘摘要`（3 个） | `数据总览` · `问题项目` · `人工复核` · `复盘报告`（4 个） |
| 报告结构 | `一、总体结论` … `五、建议行动` | `一、本期经营结论` … `五、附录` |
| 报告操作 | `下载复盘摘要.md` | `预览完整报告` → 快照 → 下载 |
| 命中的字符串 | `分析总览` · `项目问题清单` · `复盘摘要` · `下载复盘摘要.md`；**未命中：** `数据总览`、`复盘报告`、`预览完整报告` | `数据总览` · `问题项目` · `人工复核` · `复盘报告` · `预览完整报告` |

部署的构建早于提交 `947ec6b`（2026-08-05，即引入 `数据总览` 与 `人工复核` 标签页的提交），因此早于整个 V0.8 功能集：统一分析工作台、人工复核标签页、项目明细 Excel 导出、报告预览快照以及重构后的报告。仓库中没有记录确切的部署提交哈希，所以它仍是 `TO_VERIFY`；本地重新构建产生的资源哈希与线上不一致。

**演示站仍然有用的部分：** 导入与智能识别体验，以及问题清单的大致形态。**它无法展示的部分：** 4 标签页工作台、人工复核标签页、先预览后下载的报告流程和 Excel 导出。要看这些，请在本地运行——见[快速开始](#快速开始)。

部署是在本仓库之外手工执行的步骤（Cloudflare Pages）。仓库中没有部署绑定的证据（无 `wrangler.toml`、无 CI、无部署产物），因此本 README 不记录无法验证的部署命令。`CHANGELOG.md` 中记录的旧 Workers 地址已不再响应，仅作为历史保留。

## 当前验证结果

以下结果均通过在本仓库执行命令得到，环境为 Node v24.18.1 / npm 10.9.8，依赖按 `package-lock.json` 解析。

| 命令 | 结果 |
| --- | --- |
| `npm ci --no-audit --no-fund` | **exit 0**，`added 164 packages` |
| `npm test`（`vitest run`） | **exit 0**——`Test Files 27 passed (27)`，`Tests 269 passed (269)` |
| `npm run build`（`tsc -b && vite build`） | **exit 0**——转换 1,804 个模块；`dist/index.html` 0.41 kB、CSS 69.72 kB、JS 727.99 kB（另有 Vite 的 >500 kB 分块体积警告） |
| `npm run dev` | Vite 正常启动，以 HTTP 200 提供应用，标题为 `CRM 项目运营复盘助手` |
| `npm install --no-audit --no-fund` | exit 0，`up to date` |

审计时的 `npm test` 记录耗时为 7.01 秒；在负载较高的机器上重跑测得 11.64 秒。通过数量完全一致。

这些测试是行为测试，不是打包检查。它们覆盖规则边界值（`does not flag the exact 30-day follow-up boundary`、`prioritizes impossible signing dates over overdue signing dates`）、不受夏令时影响的天数计算、重复与撞单处理、筛选到报告的传导、`Blob` 与 Excel 导出载荷、一次"较早的异步工作簿检查后返回"的竞态，以及可访问性角色。另有一条集成测试把真实工作簿走完整个链路——分析、销售筛选、规则结果、指标与报告保持一致。

**诚实说明：** 269 条测试中有 22 条（约 8%）是**样式表源码文本断言**。它们读取 `.css` 文件并断言某条声明字符串存在，因此一次无害的重构就会让它们失败，它们也无法证明视觉行为。其余 92% 是真正的行为断言。

**同样需要说明：** `package.json` 中所有依赖都声明为 `"latest"`，真正的版本锁定只在 `package-lock.json`。上述绿色结果只对已解析的版本成立（主要是 `vitest 4.1.10`、`vite 8.1.5`、`typescript 7.0.2`、`react 19.2.7`、`xlsx 0.18.5`）。由于没有 CI，未来一次 `latest` 解析没有任何保护。

**本 README 使用的证据分级：** `VERIFIED`（在工作副本中直接执行或读取确认）、`HISTORICAL`（对早期设计或版本成立，对当前代码不成立）、`TO_VERIFY`（明确标注为未知，而不是靠猜测填上）。

<details>
<summary><b><code>CHANGELOG.md</code> 中的持续开发证据</b></summary>

`CHANGELOG.md` 记录了 8 个版本，V0.1（2026-07-17）到 V0.8（2026-08-09），每个版本都带代码提交 SHA 和验证结果：V0.4（`f9fc679`）"自动化测试 32/32 通过"，V0.5（`4153785`）"自动化测试 34/34 通过"，V0.6 为 `136/136`，V0.7 记录了生产部署提交 `80f0dcd`，V0.8 建立 `0.8.0` 版本基线。这五个被引用的提交都确实存在于仓库历史中。V0.6 还记录了两个视口（`1440x900` 与 `390x844`）的浏览器验收，包括部门筛选级联销售经理，以及移动端结果表仅在表格容器内滚动。

</details>

## 完整使用示例

```bash
git clone https://github.com/KanG-ciyuan/crm-project-review-assistant.git
cd crm-project-review-assistant
npm ci
npm run dev
```

然后在浏览器中：

1. 在首页点击 **开始分析**。
2. 选择 [`sample-data/CRM历史项目表-脱敏适配样表.xlsx`](sample-data/CRM历史项目表-脱敏适配样表.xlsx)——6 条合成项目记录，负责人为虚构的 `示例经理甲` 等，编号为 `CRM-001…CRM-006`。
3. 填写 **数据来源标识（企业/账套）**，例如 `示例企业 CRM`，并保留自动识别出的工作表。
4. 向导显示 **数据已准备好**：随仓库提供的样表不需要任何确认项即可导入。展开 **查看识别详情** 可以看到字段映射和哪些规则可执行。
5. 点击 **开始分析**，然后在 **问题项目** 中查看结果——样表数据会出现跟进超期、低概率观察和储备周期观察等规则证据。
6. 在 **人工复核** 中为某个项目设置 **审查状态** 并填写 **处理说明**。输入即保存。
7. 在 **复盘报告** 中点击 **预览完整报告**。抽屉展示冻结的快照和它的筛选范围；下载 Markdown 后，再用 **导出项目明细.xlsx** 导出当前筛选范围。

第二个样例 [`sample-data/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx`](sample-data/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx) 是包含 `测试预期结果` 工作表的 30 条项目验收表；它同样以 **数据已准备好** 导入，解析出 30 条项目记录。

## 适用与不适用

| 适用场景 | 不适用场景 |
| --- | --- |
| 你有一份 CRM 项目 / 商机导出的未加密 `.xlsx`，需要一套可重复的第一轮复盘 | 直连 CRM 系统读取数据——没有任何连接器 |
| 你需要每条标记都能追溯到一条写明规则和一行源数据 | 回写 CRM，或替你修正源数据 |
| 你需要一份以 Markdown 加 Excel 明细形式交付的管理复盘草稿 | PDF 导出、定时报告或邮件推送 |
| 由人工复核并记录业务结论 | 让工具判定哪些项目真的有业务风险 |
| 单个分析人员、单个浏览器配置下使用 | 多人协作、账号、数据库、任务派发、整改跟踪或通知 |
| | 跨设备或云端同步的复核状态 |
| | 加密工作簿或非 `.xlsx` 格式 |
| | AI 生成的分析——它属于未来 `v0.9.0` 的规划，尚未实现 |

## 已知限制

1. **规则阈值可见但不可修改。** `src/App.tsx:313` 把页面上两个阈值渲染为 `<input … disabled />`，并且 17 条规则全部声明为 `adjustable: false`。结果是规则选项里的 `enabledRuleIds` 成为不可达代码。项目自己的字段字典文档要求阈值"必须在页面可见、可调整"——可见这一半已实现，可调整这一半没有。请不要指望在界面上调整阈值。
2. **没有 CI，也没有静态检查。** 没有 `.github/`、没有 lint 脚本、没有类型检查脚本；`tsc -b` 只在 `npm run build` 中运行。
3. **269 条测试中有 22 条是 CSS 文本正则断言**（见[当前验证结果](#当前验证结果)）；没有覆盖率脚本，也不产出覆盖率报告。
4. **`package.json` 中依赖版本声明为 `"latest"`**，只有 lockfile 是真正的锁定。
5. **在线演示是旧版本**，早于 V0.8 功能集（见[在线演示](#在线演示)）。
6. **有两个标签却没有 GitHub Release**，且 `v0.8.0` 标签落后 `main` 一个提交，该提交没有 CHANGELOG 条目。
7. **已被取代的设计文档仍在仓库中。** `docs/product/V1-PRD.md`、`docs/product/产品基础定义.md` 和 `docs/product/产品流程与页面结构图.md` 描述的是一套早期设计——14 天 / 90 天阈值、75 分位高金额规则，以及一个 AI 后端——而已发布的引擎并不实现它们（实际是 30/180/365 天、固定金额分档、没有 AI）。请把它们视为 `HISTORICAL`。已发布规则的权威依据是 `src/domain/rules.ts`、`CHANGELOG.md` 和 [`docs/product/CRM历史项目表-字段字典与规则确认稿.md`](docs/product/CRM历史项目表-字段字典与规则确认稿.md)。
8. **`scripts/create-crm-history-sample.mjs` 已孤立且无法运行。** 它导入 `@oai/artifact-tool`，而该依赖没有在 `package.json` 中声明，因此按仓库当前状态无法重新生成示例工作簿。
9. **应用下载与 README 链接指向不同字节。** `public/CRM历史项目表-脱敏适配样表.xlsx` 与 `sample-data/CRM历史项目表-脱敏适配样表.xlsx` 同名但 SHA-256 不同（成单概率的存储方式不同）。两者都能正常导入，但这份重复是维护隐患。
10. **`LICENSE` 中的版权持有者写作裸字符串 `Copyright (c) Kang`**，与全文其他地方使用的账号名 `KanG-ciyuan` 不一致。MIT 正文本身逐字正确，GitHub 也将许可证识别为 MIT。此项作为待决问题上报，文件未作修改。
11. **历史第三方工具链残留。** 9 个文档带有 `superpowers:subagent-driven-development` 样板头，并位于来自外部 Agent 工作流的 `docs/superpowers/` 目录下。这些计划已经执行完毕，作为设计记录仍然可读，但其品牌标识与本项目无关。
12. **一份历史计划文档公布了作者本机的绝对文件系统路径。** 这是轻微的发布卫生问题，不涉及任何凭据；该路径在此刻意不复现。
13. **仓库内部存在文档与代码漂移。** 字段字典文档描述了一个四档成单概率枚举和两值状态集，而代码并未实现（概率保留原始口径，状态接受五种取值）。以代码为准。
14. **首页展示的是示意数据。** 首页与预览面板显示的是标注为 演示数据 的非交互式演示内容（项目数量、金额分布）；这些数字是营销界面的模拟内容，不是任何一次分析的真实输出。
15. **没有 `SECURITY.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`**，也没有 issue 或 pull request 模板。

## 快速开始

环境要求：Node.js 与 npm。已验证环境为 Node v24.18.1 与 npm 10.9.8；仓库未声明 `engines` 约束。

```bash
git clone https://github.com/KanG-ciyuan/crm-project-review-assistant.git
cd crm-project-review-assistant

npm ci            # 按 package-lock.json 可复现安装（exit 0，164 个包）
npm run dev       # Vite 开发服务器，会打印本地地址

npm test          # vitest run —— 27 个文件、269 条测试
npm run build     # tsc -b && vite build —— 输出到 dist/
```

如果你更习惯 `npm install`，它同样可用。以上命令都是在撰写本 README 的过程中于本仓库实际执行过的，结果见[当前验证结果](#当前验证结果)。

<details>
<summary><b>项目结构</b></summary>

```text
src/domain/          规则引擎、分析汇总、字段映射、筛选、复核状态、
                     报告模型与 Markdown 输出、Excel 明细导出
src/lib/             工作簿检查与工作表解析（SheetJS）
src/components/      ProductLanding、ImportWizard、AnalysisWorkspace 及其标签页
src/App.tsx          编排：导入 → 分析 → 复核 → 报告
sample-data/         可公开使用的合成示例工作簿
public/              静态资源，包含应用下载链接提供的工作簿
docs/product/        产品定义、PRD、页面与流程说明、字段字典、版本规划
docs/plan/           V1 实施计划
docs/superpowers/    各功能的设计与计划记录（见「已知限制」）
CHANGELOG.md         版本历史，含提交与已记录的验证结果
```

</details>

## 生态系统

本应用是 **DISCOVER → DEFINE** 边界上的落地实践：它接收企业真实的 CRM 运营导出数据，
把其中可复核的部分固化为显式、可版本化的规则集，在每个判断点保留人工确认，
并据此产出可审计的交付物。

```text
发现 DISCOVER
企业 AI 诊断 Skills
        ↓
定义 DEFINE
Kang Product Architect
Kang Enterprise Process Reviewer
        ↓
构建与协同 BUILD & COORDINATE
Kang Agent Workforce
Kang Agent Collab
Kang Frontend Standard
        ↓
验证 VERIFY
Kang B2B UX Auditor
Kang Product Acceptance Auditor
        ↓
交付 DELIVER
Kang GitHub README
Kang PPT Skill
```

> 这是一张生态地图，不是严格的运行时流水线。各阶段描述的是项目所处的工作位置，
> 而不是强制的执行顺序。

---

## 属于 Kang 开源 AI 体系

本项目是「面向企业 AI 转型、Agent 协作与 AI 原生产品交付的证据驱动体系」的一部分。

| 阶段 | 项目 | 作用 |
| --- | --- | --- |
| DISCOVER 发现 | [enterprise-ai-diagnostic-skills](https://github.com/KanG-ciyuan/enterprise-ai-diagnostic-skills) | 在自动化之前，先弄清企业真实业务如何运行 |
| DEFINE 定义 | [kang-product-architect](https://github.com/KanG-ciyuan/kang-product-architect) | 把模糊需求转化为可实施、可审查的产品契约 |
| DEFINE 定义 | [kang-enterprise-process-reviewer](https://github.com/KanG-ciyuan/kang-enterprise-process-reviewer) | 审查流程是否可执行、可追责、可恢复 |
| BUILD & COORDINATE 构建与协同 | [kang-agent-workforce](https://github.com/KanG-ciyuan/kang-agent-workforce) | 角色化的 Agent 数字员工团队与显式交接 |
| BUILD & COORDINATE 构建与协同 | [kang-agent-collab](https://github.com/KanG-ciyuan/kang-agent-collab) | Agent 协作与交接协议 |
| BUILD & COORDINATE 构建与协同 | [kang-frontend-standard](https://github.com/KanG-ciyuan/kang-frontend-standard) | AI 构建界面的前端质量标准 |
| VERIFY 验证 | [kang-b2b-ux-auditor](https://github.com/KanG-ciyuan/kang-b2b-ux-auditor) | 用户能否真正把工作做完 |
| VERIFY 验证 | [kang-product-acceptance-auditor](https://github.com/KanG-ciyuan/kang-product-acceptance-auditor) | AI 构建产品的独立验收 |
| DELIVER 交付 | [kang-github-readme](https://github.com/KanG-ciyuan/kang-github-readme) | 证据感知的 README 工程 |
| DELIVER 交付 | [kang-ppt-skill](https://github.com/KanG-ciyuan/kang-ppt-skill) | 证据感知的演示文稿设计 |

**横向基础设施：** [kang-meta-skill](https://github.com/KanG-ciyuan/kang-meta-skill) —
Skill 工程化、评估与发布治理。

**早期工作：** [ai-agent-rules](https://github.com/KanG-ciyuan/ai-agent-rules)、
[workflow-five-steps](https://github.com/KanG-ciyuan/workflow-five-steps)、
[renovation-agent](https://github.com/KanG-ciyuan/renovation-agent)。

**项目文档：** [CHANGELOG.md](CHANGELOG.md) ·
[docs/product/版本规划.md](docs/product/版本规划.md) ·
[docs/product/CRM历史项目表-字段字典与规则确认稿.md](docs/product/CRM历史项目表-字段字典与规则确认稿.md) ·
[docs/product/V1-PRD.md](docs/product/V1-PRD.md)（HISTORICAL）·
[docs/product/产品基础定义.md](docs/product/产品基础定义.md)（HISTORICAL）·
[docs/product/产品流程与页面结构图.md](docs/product/产品流程与页面结构图.md)（HISTORICAL）

欢迎通过 Issue 提交问题、规则建议或使用反馈，也欢迎通过 Pull Request 参与改进。提交示例数据前，请确认数据已经脱敏且具备公开授权。

## 开源许可证

本项目采用 [MIT License](LICENSE) 开源。
