import type { AnalysisResult } from './analysis';
import type { FindingCategory } from './rules';
import type { ReviewRecordMap, ReviewStatus } from './review';
import { findingKind } from './workbench';

export interface ReviewSummaryItem {
  label: string;
  projectCount: number;
}

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
  overallConclusions: string[];
  priorityIssues: ReviewSummaryItem[];
  focusScopes: ReviewFocusScope[];
  ruleDistribution: {
    categories: ReviewSummaryItem[];
    reviewStatuses: Array<{ status: ReviewStatus; count: number }>;
  };
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
const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function reviewCounts(analysis: AnalysisResult, reviews: ReviewRecordMap): Record<ReviewStatus, number> {
  const keys = new Set(analysis.findings.filter((finding) => findingKind(finding) === 'manual').map((finding) => finding.rowKey));
  const counts: Record<ReviewStatus, number> = { 待复核: 0, 确认数据错误: 0, 确认业务风险: 0, 已忽略: 0 };
  keys.forEach((key) => { counts[reviews[key]?.status ?? '待复核'] += 1; });
  return counts;
}

function priorityIssues(analysis: AnalysisResult): ReviewSummaryItem[] {
  const projectsByLabel = new Map<string, Set<string>>();
  analysis.findings.forEach((finding) => {
    const label = normalizedInline(finding.label) || '未命名问题';
    const projects = projectsByLabel.get(label) ?? new Set<string>();
    projects.add(finding.rowKey);
    projectsByLabel.set(label, projects);
  });
  return [...projectsByLabel].map(([label, projects]) => ({ label, projectCount: projects.size }))
    .sort((left, right) => right.projectCount - left.projectCount || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, 4);
}

function focusScopes(analysis: AnalysisResult): ReviewFocusScope[] {
  const projectsByOwner = new Map<string, { type: ReviewFocusScope['type']; name: string; projects: Set<string> }>();
  analysis.findings.filter((finding) => findingKind(finding) !== 'observation').forEach((finding) => {
    ([['部门', finding.department], ['负责人', finding.salesManager]] as const).forEach(([type, rawName]) => {
      const name = normalizedInline(rawName) || '未填写';
      const key = `${type}:${name}`;
      const item = projectsByOwner.get(key) ?? { type, name, projects: new Set<string>() };
      item.projects.add(finding.rowKey);
      projectsByOwner.set(key, item);
    });
  });
  return [...projectsByOwner.values()]
    .map((item) => ({ type: item.type, name: item.name, projectCount: item.projects.size }))
    .sort((left, right) => right.projectCount - left.projectCount
      || `${left.type}：${left.name}`.localeCompare(`${right.type}：${right.name}`, 'zh-CN'))
    .slice(0, 5);
}

function generatedDate(analysis: AnalysisResult) {
  const date = new Date(analysis.generatedAt);
  return Number.isNaN(date.getTime()) ? '' : formatLocalDate(date);
}

function buildReviewSummary(analysis: AnalysisResult, reviews: ReviewRecordMap, filterScope: string[], date: string): ReviewSummaryData {
  const { overview } = analysis;
  const counts = reviewCounts(analysis, reviews);
  const categories = (Object.keys(categoryLabels) as FindingCategory[])
    .map((category) => ({
      label: categoryLabels[category],
      projectCount: new Set((analysis.results[category] ?? []).map((finding) => finding.rowKey)).size
    }))
    .filter((item) => item.projectCount > 0)
    .sort((left, right) => right.projectCount - left.projectCount || left.label.localeCompare(right.label, 'zh-CN'));
  return {
    meta: {
      title: '储备项目经营复盘',
      generatedDate: date,
      disclaimer: '本报告基于导入数据和规则标签生成，金额、日期、项目状态及业务结论须由业务人员确认。'
    },
    scope: filterScope.map(normalizedInline).filter(Boolean),
    overallConclusions: [
      `本期分析 ${overview.projectCount} 个项目，储备金额 ${formatAmount(overview.totalAmountWan)} 万元。`,
      `跟进中 ${overview.inProgressCount} 个，呆滞 ${overview.dormantCount} 个，已签约 ${overview.signedCount} 个，已丢单 ${overview.lostCount} 个。`,
      `需要复核的项目共 ${counts['待复核'] + counts['确认数据错误'] + counts['确认业务风险']} 个，已忽略 ${counts['已忽略']} 个。`
    ].slice(0, 3),
    priorityIssues: priorityIssues(analysis),
    focusScopes: focusScopes(analysis),
    ruleDistribution: {
      categories,
      reviewStatuses: reviewStatuses.map((status) => ({ status, count: counts[status] }))
    },
    actions: [
      counts['待复核'] > 0 ? `优先复核 ${counts['待复核']} 个待复核项目，确认数据错误或业务风险。` : '持续抽查规则发现，保持数据质量。',
      counts['确认数据错误'] > 0 ? `修正已确认的 ${counts['确认数据错误']} 个数据错误，并重新分析验证。` : '对关键字段和日期保持定期校验。',
      '围绕问题项目较集中的部门和负责人，安排下一轮经营跟进。'
    ].slice(0, 3)
  };
}

export function createReviewSummary(analysis: AnalysisResult, reviews: ReviewRecordMap, filterScope: string[] = []): ReviewSummaryData {
  return buildReviewSummary(analysis, reviews, filterScope, generatedDate(analysis));
}

export function createReviewReport(analysis: AnalysisResult, reviews: ReviewRecordMap, today: Date, filterScope: string[] = []): string {
  const generated = createReviewSummary(analysis, reviews, filterScope);
  const summary: ReviewSummaryData = {
    ...generated,
    meta: { ...generated.meta, generatedDate: formatLocalDate(today) }
  };
  const issues = summary.priorityIssues.length > 0
    ? summary.priorityIssues.map((item) => `- ${safeMarkdownInline(item.label)}：涉及 ${item.projectCount} 个项目。`)
    : ['- 本期没有规则发现。'];
  const scopes = summary.focusScopes.length > 0
    ? summary.focusScopes.map((item) => `- ${item.type}：${safeMarkdownInline(item.name)}（${item.projectCount} 个问题项目）`)
    : ['- 暂无需要复核的部门或负责人。'];
  return [
    `# ${summary.meta.title}`,
    `生成日期：${summary.meta.generatedDate}`,
    ...(summary.scope.length > 0 ? [`筛选范围：${summary.scope.map(safeMarkdownInline).join('；')}`] : []),
    `> ${summary.meta.disclaimer}`,
    '## 一、总体结论',
    summary.overallConclusions.map((line) => `- ${line}`).join('\n'),
    '## 二、优先关注事项',
    issues.join('\n'),
    '## 三、重点部门与负责人',
    scopes.join('\n'),
    '## 四、规则分布摘要',
    [...summary.ruleDistribution.categories.map((item) => `- ${item.label}：涉及 ${item.projectCount} 个项目。`),
      `- 复核状态：${summary.ruleDistribution.reviewStatuses.map((item) => `${item.status} ${item.count} 个`).join('；')}。`].join('\n'),
    '## 五、建议行动',
    summary.actions.map((line, index) => `${index + 1}. ${line}`).join('\n')
  ].join('\n\n');
}
