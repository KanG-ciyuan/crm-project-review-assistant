import type { AnalysisResult } from './analysis';
import { amountInWan } from './project';
import type { FindingCategory } from './rules';
import type { ReviewRecordMap, ReviewStatus } from './review';
import { buildProjectWorkbenchRows, type ProjectWorkbenchRow } from './workbench';

export interface ManagementProjectItem {
  rowKey: string;
  projectId: string;
  projectName: string;
  amountWan: number | null;
  stage: string;
  department: string;
  salesManager: string;
  evidence: string[];
  reviewStatus: ReviewStatus | '无需人工复核';
  reviewConclusion: string;
  decisionQuestion: string;
  suggestedAction: string;
}

export interface DepartmentActionItem {
  department: string;
  projectCount: number;
  amountWan: number;
  mainIssue: string;
  suggestedAction: string;
  reviewedCount: number;
  pendingCount: number;
}

/** @deprecated Transitional alias for the legacy summary component. */
export interface ReviewSummaryItem {
  label: string;
  projectCount: number;
}

/** @deprecated Transitional alias for the legacy summary component. */
export interface ReviewFocusScope {
  type: '部门' | '负责人';
  name: string;
  projectCount: number;
}

export interface ReviewSummaryData {
  meta: {
    title: string;
    generatedDate: string;
    disclaimer: string;
  };
  scope: string[];
  executiveConclusions: string[];
  decisionItems: ManagementProjectItem[];
  priorityProjects: ManagementProjectItem[];
  departmentActions: DepartmentActionItem[];
  appendix: {
    projectCount: number;
    totalAmountWan: number;
    categories: ReviewSummaryItem[];
    reviewStatuses: Array<{ status: ReviewStatus; count: number }>;
    remainingProjects: ManagementProjectItem[];
  };
  /** @deprecated Remove when ReviewSummary renders executiveConclusions. */
  overallConclusions: string[];
  /** @deprecated Remove when ReviewSummary renders the management project lists. */
  priorityIssues: ReviewSummaryItem[];
  /** @deprecated Remove when ReviewSummary renders departmentActions. */
  focusScopes: ReviewFocusScope[];
  /** @deprecated Remove when ReviewSummary renders appendix directly. */
  ruleDistribution: {
    categories: ReviewSummaryItem[];
    reviewStatuses: Array<{ status: ReviewStatus; count: number }>;
  };
  /** @deprecated Remove when ReviewSummary renders departmentActions. */
  actions: string[];
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MARKDOWN_INLINE_ENTITIES: Record<string, string> = {
  '\\': '&#92;', '`': '&#96;', '*': '&#42;', '_': '&#95;', '[': '&#91;', ']': '&#93;', '#': '&#35;', '|': '&#124;'
};

const normalizedInline = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

export const safeMarkdownInline = (value: string) => normalizedInline(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/[\\`*_\[\]#|]/g, (character) => MARKDOWN_INLINE_ENTITIES[character])
  .replace(/(^|\s)-(?=\s)/g, '$1&#45;')
  .replace(/(^|\s)\+(?=\s)/g, '$1&#43;');

const categoryLabels: Record<FindingCategory, string> = {
  数据质量待复核: '数据质量',
  维护超期待整改: '维护时效',
  疑似重复与撞单: '重复与撞单',
  重点项目复盘: '重点项目',
  经营结构分析: '经营结构'
};
const reviewStatuses: ReviewStatus[] = ['待复核', '确认数据错误', '确认业务风险', '已忽略'];
// Management reports show only the highest-impact departments; all project evidence remains in priority/appendix models.
const MAX_DEPARTMENT_ACTIONS = 10;
const MAX_IDENTITY_LENGTH = 80;
const MAX_EVIDENCE_LENGTH = 160;
const MAX_EVIDENCE_ITEMS = 2;
const MAX_REVIEW_TEXT_LENGTH = 160;
const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function truncateDisplay(value: string, maxLength: number): string {
  const normalized = normalizedInline(value);
  const codePoints = Array.from(normalized);
  return codePoints.length <= maxLength ? normalized : `${codePoints.slice(0, maxLength - 1).join('')}…`;
}

const normalizedValue = (value: string, missing: string) => normalizedInline(value) || missing;
const displayValue = (value: string, missing: string, maxLength = MAX_IDENTITY_LENGTH) =>
  truncateDisplay(value, maxLength) || missing;

function generatedDate(analysis: AnalysisResult): string {
  const date = new Date(analysis.generatedAt);
  return Number.isNaN(date.getTime()) ? '' : formatLocalDate(date);
}

function reviewStatusFor(row: ProjectWorkbenchRow, reviews: ReviewRecordMap): ManagementProjectItem['reviewStatus'] {
  if (row.manualFindings.length === 0) return '无需人工复核';
  return reviews[row.rowKey]?.status ?? '待复核';
}

function reviewConclusion(status: ManagementProjectItem['reviewStatus'], note: string): string {
  if (status === '待复核') return '待业务确认';
  if (status === '无需人工复核') return '无需人工复核';
  const confirmedNote = truncateDisplay(note, MAX_REVIEW_TEXT_LENGTH);
  if (confirmedNote) return confirmedNote;
  if (status === '确认业务风险') return '业务风险已确认，具体原因未填写';
  if (status === '确认数据错误') return '数据错误已确认，具体说明未填写';
  return '已忽略，具体说明未填写';
}

function decisionContent(status: ManagementProjectItem['reviewStatus']): Pick<ManagementProjectItem, 'decisionQuestion' | 'suggestedAction'> {
  if (status === '确认业务风险') {
    return {
      decisionQuestion: '该项目应继续推进、调整阶段还是暂停？',
      suggestedAction: '管理层确认继续推进、调整阶段或暂停。'
    };
  }
  if (status === '确认数据错误') {
    return {
      decisionQuestion: '源数据修正后是否已重新导入验证？',
      suggestedAction: '修正 CRM 源数据后重新导入验证。'
    };
  }
  if (status === '待复核') {
    return {
      decisionQuestion: '规则发现是否构成真实业务风险？',
      suggestedAction: '由责任团队确认真实原因并补充复核结论。'
    };
  }
  if (status === '已忽略') {
    return { decisionQuestion: '无需管理层决策。', suggestedAction: '无需后续动作。' };
  }
  return {
    decisionQuestion: '规则证据是否已核实并同步更新 CRM？',
    suggestedAction: '核实规则证据并更新 CRM。'
  };
}

function managementItem(row: ProjectWorkbenchRow, reviews: ReviewRecordMap): ManagementProjectItem {
  const status = reviewStatusFor(row, reviews);
  const evidence = [...new Set([...row.manualFindings, ...row.factFindings].map((finding) => {
    const label = displayValue(finding.label, '未命名规则');
    const reason = truncateDisplay(finding.reason, MAX_EVIDENCE_LENGTH);
    return truncateDisplay(reason ? `${label}：${reason}` : label, MAX_EVIDENCE_LENGTH);
  }))].slice(0, MAX_EVIDENCE_ITEMS);
  const content = decisionContent(status);
  return {
    rowKey: row.rowKey,
    projectId: displayValue(row.project.projectId, '项目编号未填写'),
    projectName: displayValue(row.project.projectName, '项目名称未填写'),
    amountWan: row.project.amountParseError ? null : amountInWan(row.project),
    stage: !row.project.status || row.project.status === '未知'
      ? '项目阶段未填写'
      : displayValue(row.project.status, '项目阶段未填写'),
    department: displayValue(row.project.department, '部门未填写'),
    salesManager: displayValue(row.project.salesManager, '负责人未填写'),
    evidence: evidence.length > 0 ? evidence : ['规则证据待补充'],
    reviewStatus: status,
    reviewConclusion: reviewConclusion(status, reviews[row.rowKey]?.note ?? ''),
    decisionQuestion: truncateDisplay(content.decisionQuestion, MAX_REVIEW_TEXT_LENGTH),
    suggestedAction: truncateDisplay(content.suggestedAction, MAX_REVIEW_TEXT_LENGTH)
  };
}

function compareAmountAndIdentity(left: ManagementProjectItem, right: ManagementProjectItem): number {
  if (left.amountWan === null && right.amountWan !== null) return 1;
  if (left.amountWan !== null && right.amountWan === null) return -1;
  if (left.amountWan !== null && right.amountWan !== null && left.amountWan !== right.amountWan) {
    return right.amountWan - left.amountWan;
  }
  return left.projectId.localeCompare(right.projectId, 'zh-CN') || left.rowKey.localeCompare(right.rowKey, 'zh-CN');
}

function decisionRank(status: ManagementProjectItem['reviewStatus']): number {
  return status === '确认业务风险' ? 0 : 1;
}

function categoryCounts(analysis: AnalysisResult): ReviewSummaryItem[] {
  return (Object.keys(categoryLabels) as FindingCategory[])
    .map((category) => ({
      label: categoryLabels[category],
      projectCount: new Set((analysis.results[category] ?? []).map((finding) => finding.rowKey)).size
    }))
    .filter((item) => item.projectCount > 0)
    .sort((left, right) => right.projectCount - left.projectCount || left.label.localeCompare(right.label, 'zh-CN'));
}

function legacyPriorityIssues(analysis: AnalysisResult): ReviewSummaryItem[] {
  const projectsByLabel = new Map<string, Set<string>>();
  analysis.findings.forEach((finding) => {
    const label = normalizedValue(finding.label, '未命名问题');
    const projects = projectsByLabel.get(label) ?? new Set<string>();
    projects.add(finding.rowKey);
    projectsByLabel.set(label, projects);
  });
  return [...projectsByLabel.entries()]
    .map(([label, projects]) => ({ label, projectCount: projects.size }))
    .sort((left, right) => right.projectCount - left.projectCount || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, 4)
    .map((item) => ({ ...item, label: displayValue(item.label, '未命名问题') }));
}

function legacyFocusScopes(rows: ProjectWorkbenchRow[]): ReviewFocusScope[] {
  const scopes = new Map<string, { type: ReviewFocusScope['type']; name: string; projects: Set<string> }>();
  rows.filter((row) => row.manualFindings.length > 0 || row.factFindings.length > 0).forEach((row) => {
    ([['部门', row.project.department], ['负责人', row.project.salesManager]] as const).forEach(([type, rawName]) => {
      const name = normalizedValue(rawName, '未填写');
      const key = `${type}:${name}`;
      const scope = scopes.get(key) ?? { type, name, projects: new Set<string>() };
      scope.projects.add(row.rowKey);
      scopes.set(key, scope);
    });
  });
  return [...scopes.values()]
    .map((scope) => ({ type: scope.type, name: scope.name, projectCount: scope.projects.size }))
    .sort((left, right) => right.projectCount - left.projectCount
      || `${left.type}：${left.name}`.localeCompare(`${right.type}：${right.name}`, 'zh-CN'))
    .slice(0, 5)
    .map((scope) => ({ ...scope, name: displayValue(scope.name, '未填写') }));
}

function legacyActions(counts: Record<ReviewStatus, number>): string[] {
  return [
    counts['待复核'] > 0
      ? `优先复核 ${counts['待复核']} 个待复核项目，确认数据错误或业务风险。`
      : '持续抽查规则发现，保持数据质量。',
    counts['确认数据错误'] > 0
      ? `修正已确认的 ${counts['确认数据错误']} 个数据错误，并重新分析验证。`
      : '对关键字段和日期保持定期校验。',
    '围绕问题项目较集中的部门和负责人，安排下一轮经营跟进。'
  ];
}

function reviewCounts(rows: ProjectWorkbenchRow[], reviews: ReviewRecordMap): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = { 待复核: 0, 确认数据错误: 0, 确认业务风险: 0, 已忽略: 0 };
  rows.filter((row) => row.manualFindings.length > 0)
    .forEach((row) => { counts[reviews[row.rowKey]?.status ?? '待复核'] += 1; });
  return counts;
}

function departmentActions(
  rows: ProjectWorkbenchRow[],
  itemsByKey: Map<string, ManagementProjectItem>
): DepartmentActionItem[] {
  const groups = new Map<string, Array<{ row: ProjectWorkbenchRow; item: ManagementProjectItem }>>();
  rows.forEach((row) => {
    const item = itemsByKey.get(row.rowKey)!;
    const department = normalizedValue(row.project.department, '部门未填写');
    groups.set(department, [...(groups.get(department) ?? []), { row, item }]);
  });
  return [...groups.entries()].map(([department, entries]) => {
    const projects = entries.map(({ item }) => item);
    const count = (status: ManagementProjectItem['reviewStatus']) => projects.filter((item) => item.reviewStatus === status).length;
    const riskCount = count('确认业务风险');
    const pendingCount = count('待复核');
    const dataErrorCount = count('确认数据错误');
    const issueCounts = new Map<string, number>();
    entries.forEach(({ row }) => {
      const labels = new Set([...row.manualFindings, ...row.factFindings]
        .map((finding) => normalizedValue(finding.label, '未命名规则')));
      labels.forEach((label) => issueCounts.set(label, (issueCounts.get(label) ?? 0) + 1));
    });
    const mainIssue = [...issueCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))[0]?.[0]
      ?? '规则证据待补充';
    const suggestedAction = riskCount > 0
      ? '管理层确认相关项目继续推进、调整阶段或暂停。'
      : pendingCount > 0
        ? '责任团队确认真实原因并补充复核结论。'
        : dataErrorCount > 0 ? '修正 CRM 源数据后重新导入验证。' : '核实规则证据并更新 CRM。';
    return {
      department: displayValue(department, '部门未填写'),
      projectCount: projects.length,
      amountWan: projects.reduce((sum, item) => sum + (item.amountWan ?? 0), 0),
      mainIssue: displayValue(mainIssue, '规则证据待补充'),
      suggestedAction,
      reviewedCount: riskCount + dataErrorCount,
      pendingCount,
      sortDepartment: department
    };
  }).sort((left, right) => right.projectCount - left.projectCount
    || right.amountWan - left.amountWan
    || left.sortDepartment.localeCompare(right.sortDepartment, 'zh-CN'))
    .slice(0, MAX_DEPARTMENT_ACTIONS)
    .map(({ sortDepartment: _sortDepartment, ...item }) => item);
}

export function createReviewSummary(
  analysis: AnalysisResult,
  reviews: ReviewRecordMap,
  filterScope: string[] = []
): ReviewSummaryData {
  const workbenchRows = buildProjectWorkbenchRows(analysis);
  const itemsByKey = new Map(workbenchRows.map((row) => [row.rowKey, managementItem(row, reviews)]));
  const counts = reviewCounts(workbenchRows, reviews);
  const decisionItems = workbenchRows
    .filter((row) => row.manualFindings.length > 0)
    .map((row) => itemsByKey.get(row.rowKey)!)
    .filter((item) => item.reviewStatus === '确认业务风险' || item.reviewStatus === '待复核')
    .sort((left, right) => decisionRank(left.reviewStatus) - decisionRank(right.reviewStatus)
      || compareAmountAndIdentity(left, right));
  const ignoredKeys = new Set(workbenchRows
    .filter((row) => row.manualFindings.length > 0 && reviews[row.rowKey]?.status === '已忽略')
    .map((row) => row.rowKey));
  const eligibleRows = workbenchRows.filter((row) => !ignoredKeys.has(row.rowKey)
    && (row.manualFindings.length > 0 || row.factFindings.length > 0));
  const objectiveItems = workbenchRows
    .filter((row) => !ignoredKeys.has(row.rowKey) && row.factFindings.length > 0)
    .map((row) => itemsByKey.get(row.rowKey)!)
    .sort(compareAmountAndIdentity);
  const orderedPriority = [...decisionItems, ...objectiveItems]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.rowKey === item.rowKey) === index);
  const priorityProjects = orderedPriority.slice(0, 10);
  const priorityKeys = new Set(priorityProjects.map((item) => item.rowKey));
  const remainingProjects = eligibleRows
    .map((row) => itemsByKey.get(row.rowKey)!)
    .filter((item) => !priorityKeys.has(item.rowKey))
    .sort(compareAmountAndIdentity);
  const decisionAmount = decisionItems.reduce((sum, item) => sum + (item.amountWan ?? 0), 0);
  const objectiveAmount = objectiveItems.reduce((sum, item) => sum + (item.amountWan ?? 0), 0);

  const executiveConclusions = [
    `本期覆盖 ${analysis.overview.projectCount} 个项目，储备金额 ${formatAmount(analysis.overview.totalAmountWan)} 万元。`,
    `待管理层决策 ${decisionItems.length} 个项目，涉及金额 ${formatAmount(decisionAmount)} 万元，其中确认业务风险 ${counts['确认业务风险']} 个、待复核 ${counts['待复核']} 个。`,
    `有客观规则行动证据的项目 ${objectiveItems.length} 个，涉及金额 ${formatAmount(objectiveAmount)} 万元。`,
    `人工复核已确认 ${counts['确认业务风险'] + counts['确认数据错误']} 个、待复核 ${counts['待复核']} 个、已忽略 ${counts['已忽略']} 个。`
  ];
  const actionsByDepartment = departmentActions(eligibleRows, itemsByKey);
  const categories = categoryCounts(analysis);
  const statusDistribution = reviewStatuses.map((status) => ({ status, count: counts[status] }));

  return {
    meta: {
      title: '储备项目经营复盘报告',
      generatedDate: generatedDate(analysis),
      disclaimer: '本报告基于本地导入数据和确定性规则生成；规则提供客观证据，真实原因和业务结论须由业务人员确认。'
    },
    scope: filterScope.map((item) => truncateDisplay(item, MAX_IDENTITY_LENGTH)).filter(Boolean),
    executiveConclusions,
    decisionItems,
    priorityProjects,
    departmentActions: actionsByDepartment,
    appendix: {
      projectCount: analysis.overview.projectCount,
      totalAmountWan: analysis.overview.totalAmountWan,
      categories,
      reviewStatuses: statusDistribution,
      remainingProjects
    },
    overallConclusions: executiveConclusions,
    priorityIssues: legacyPriorityIssues(analysis),
    focusScopes: legacyFocusScopes(workbenchRows),
    ruleDistribution: { categories, reviewStatuses: statusDistribution },
    actions: legacyActions(counts)
  };
}

const amountText = (amountWan: number | null) => amountWan === null ? '金额待确认' : `${formatAmount(amountWan)} 万元`;
const amountDetail = (amountWan: number | null) => amountWan === null ? '金额待确认' : `金额 ${formatAmount(amountWan)} 万元`;
const markdown = (value: string) => safeMarkdownInline(value);

function decisionBlocks(summary: ReviewSummaryData): string {
  const priorityKeys = new Set(summary.priorityProjects.map((item) => item.rowKey));
  const visible = summary.decisionItems.filter((item) => priorityKeys.has(item.rowKey));
  if (visible.length === 0) return '本期没有需要管理层决策的项目。';
  const blocks = visible.map((item, index) => [
    `### 决策项目 ${index + 1}：${markdown(item.projectId)} ${markdown(item.projectName)}`,
    `- 基本信息：${amountDetail(item.amountWan)}；阶段 ${markdown(item.stage)}；部门 ${markdown(item.department)}；负责人 ${markdown(item.salesManager)}。`,
    `- 规则证据：${item.evidence.map(markdown).join('；')}。`,
    `- 复核状态：${item.reviewStatus}；人工结论：${markdown(item.reviewConclusion)}。`,
    `- 决策问题：${markdown(item.decisionQuestion)}`,
    `- 建议动作：${markdown(item.suggestedAction)}`
  ].join('\n'));
  const hiddenCount = summary.decisionItems.length - visible.length;
  if (hiddenCount > 0) blocks.push(`其余 ${hiddenCount} 个决策项目计入附录剩余项目统计。`);
  return blocks.join('\n\n');
}

function projectTable(projects: ManagementProjectItem[]): string {
  if (projects.length === 0) return '本期没有重点处理项目。';
  return [
    '| 项目 | 金额 | 当前阶段 | 发现的问题 | 人工复核结论 | 建议动作 | 责任部门 / 负责人 |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
    ...projects.map((item) => {
      const project = `${markdown(item.projectId)} ${markdown(item.projectName)}`;
      const owner = `${markdown(item.department)} / ${markdown(item.salesManager)}`;
      return `| ${project} | ${amountText(item.amountWan)} | ${markdown(item.stage)} | ${item.evidence.map(markdown).join('；')} | ${markdown(item.reviewConclusion)} | ${markdown(item.suggestedAction)} | ${owner} |`;
    })
  ].join('\n');
}

function departmentList(items: DepartmentActionItem[]): string {
  if (items.length === 0) return '本期没有需要安排后续动作的部门。';
  return items.map((item) => `- ${markdown(item.department)}：${item.projectCount} 个项目，金额 ${formatAmount(item.amountWan)} 万元；主要问题：${markdown(item.mainIssue)}；已复核 ${item.reviewedCount} 个，待复核 ${item.pendingCount} 个；后续安排：${markdown(item.suggestedAction)}`).join('\n');
}

export function createReviewReport(
  analysis: AnalysisResult,
  reviews: ReviewRecordMap,
  today: Date,
  filterScope: string[] = []
): string {
  const generated = createReviewSummary(analysis, reviews, filterScope);
  const summary: ReviewSummaryData = {
    ...generated,
    meta: { ...generated.meta, generatedDate: formatLocalDate(today) }
  };
  const scope = summary.scope.length > 0 ? summary.scope.map(markdown).join('；') : '全部导入项目';
  const categories = summary.appendix.categories.length > 0
    ? summary.appendix.categories.map((item) => `${item.label} ${item.projectCount} 个项目`).join('；')
    : '本期没有规则发现。';
  const statuses = summary.appendix.reviewStatuses.map((item) => `${item.status} ${item.count} 个`).join('；');
  const priorityIssues = summary.priorityIssues.length > 0
    ? summary.priorityIssues.map((item) => `${markdown(item.label)}：涉及 ${item.projectCount} 个项目`).join('；')
    : '本期没有规则发现。';

  return [
    `# ${summary.meta.title}`,
    `生成日期：${summary.meta.generatedDate}`,
    `筛选范围：${scope}`,
    `> ${summary.meta.disclaimer}`,
    '## 一、本期经营结论',
    summary.executiveConclusions.map((item) => `- ${item}`).join('\n'),
    '## 二、需要管理层决策的事项',
    decisionBlocks(summary),
    '## 三、重点项目处理清单',
    projectTable(summary.priorityProjects),
    '## 四、部门责任与后续安排',
    departmentList(summary.departmentActions),
    '## 五、附录：数据范围与识别规则',
    [
      `- 数据范围：${summary.appendix.projectCount} 个项目，储备金额 ${formatAmount(summary.appendix.totalAmountWan)} 万元；筛选范围：${scope}。`,
      `- 规则分类：${categories}`,
      `- 主要规则问题：${priorityIssues}`,
      `- 人工复核状态：${statuses}。`,
      `- 剩余项目：${summary.appendix.remainingProjects.length} 个；为控制报告长度，仅保留在结构化摘要中。`,
      '- 识别边界：规则只提供客观证据，真实原因和业务结论由业务人员确认。'
    ].join('\n')
  ].join('\n\n');
}
