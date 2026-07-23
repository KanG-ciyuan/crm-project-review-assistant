import type { AnalysisResult } from './analysis';
import type { FindingCategory } from './rules';
import type { ReviewRecordMap, ReviewStatus } from './review';

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MARKDOWN_INLINE_ENTITIES: Record<string, string> = {
  '\\': '&#92;', '`': '&#96;', '*': '&#42;', '_': '&#95;', '[': '&#91;', ']': '&#93;', '#': '&#35;', '|': '&#124;'
};

export const safeMarkdownInline = (value: string) => value
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
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

const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function reviewCounts(analysis: AnalysisResult, reviews: ReviewRecordMap): Record<ReviewStatus, number> {
  const keys = new Set(analysis.findings.filter((finding) => finding.level !== 'info').map((finding) => finding.rowKey));
  const counts: Record<ReviewStatus, number> = { 待复核: 0, 确认数据错误: 0, 确认业务风险: 0, 已忽略: 0 };
  keys.forEach((key) => { counts[reviews[key]?.status ?? '待复核'] += 1; });
  return counts;
}

function issueSummary(analysis: AnalysisResult) {
  const projectsByLabel = new Map<string, Set<string>>();
  analysis.findings.forEach((finding) => {
    const label = finding.label.trim() || '未命名问题';
    const projects = projectsByLabel.get(label) ?? new Set<string>();
    projects.add(finding.rowKey);
    projectsByLabel.set(label, projects);
  });
  return [...projectsByLabel].map(([label, projects]) => ({ label, projectCount: projects.size }))
    .sort((left, right) => right.projectCount - left.projectCount || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, 4);
}

function renderTopBreakdown(analysis: AnalysisResult): string[] {
  const projectsByOwner = new Map<string, { type: '部门' | '负责人'; name: string; projects: Set<string> }>();
  analysis.findings.filter((finding) => finding.level !== 'info').forEach((finding) => {
    ([['部门', finding.department], ['负责人', finding.salesManager]] as const).forEach(([type, rawName]) => {
      const name = rawName.trim() || '未填写';
      const key = `${type}:${name}`;
      const item = projectsByOwner.get(key) ?? { type, name, projects: new Set<string>() };
      item.projects.add(finding.rowKey);
      projectsByOwner.set(key, item);
    });
  });
  const ranked = [...projectsByOwner.values()]
    .sort((left, right) => right.projects.size - left.projects.size
      || `${left.type}：${left.name}`.localeCompare(`${right.type}：${right.name}`, 'zh-CN'))
    .slice(0, 5)
    .map((item) => `${item.type}：${item.name}（${item.projects.size} 个问题项目）`);
  return ranked.length > 0 ? ranked : ['暂无需要复核的部门或负责人。'];
}

export function createReviewReport(analysis: AnalysisResult, reviews: ReviewRecordMap, today: Date, filterScope: string[] = []): string {
  const { overview } = analysis;
  const scope = filterScope.map(safeMarkdownInline).filter(Boolean);
  const counts = reviewCounts(analysis, reviews);
  const topIssues = issueSummary(analysis);
  const categorySummary = (Object.keys(categoryLabels) as FindingCategory[])
    .map((category) => {
      const findings = analysis.results[category] ?? [];
      const projects = new Set(findings.map((finding) => finding.rowKey)).size;
      return { category, projects };
    })
    .filter((item) => item.projects > 0)
    .sort((left, right) => right.projects - left.projects || categoryLabels[left.category].localeCompare(categoryLabels[right.category], 'zh-CN'));
  const conclusions = [
    `本期分析 ${overview.projectCount} 个项目，储备金额 ${formatAmount(overview.totalAmountWan)} 万元。`,
    `跟进中 ${overview.inProgressCount} 个，呆滞 ${overview.dormantCount} 个，已签约 ${overview.signedCount} 个，已丢单 ${overview.lostCount} 个。`,
    `需要复核的项目共 ${counts['待复核'] + counts['确认数据错误'] + counts['确认业务风险']} 个，已忽略 ${counts['已忽略']} 个。`
  ];
  const issues = topIssues.length > 0
    ? topIssues.map((item) => `- ${safeMarkdownInline(item.label)}：涉及 ${item.projectCount} 个项目。`)
    : ['- 本期没有规则发现。'];
  const actions = [
    counts['待复核'] > 0 ? `优先复核 ${counts['待复核']} 个待复核项目，确认数据错误或业务风险。` : '持续抽查规则发现，保持数据质量。',
    counts['确认数据错误'] > 0 ? `修正已确认的 ${counts['确认数据错误']} 个数据错误，并重新分析验证。` : '对关键字段和日期保持定期校验。',
    `围绕问题项目较集中的部门和负责人，安排下一轮经营跟进。`
  ];
  return [
    '# 储备项目经营复盘',
    `生成日期：${formatLocalDate(today)}`,
    ...(scope.length > 0 ? [`筛选范围：${scope.join('；')}`] : []),
    '> 本报告基于导入数据和规则标签生成，金额、日期、项目状态及业务结论须由业务人员确认。',
    '## 一、总体结论',
    conclusions.map((line) => `- ${line}`).join('\n'),
    '## 二、优先关注事项',
    issues.join('\n'),
    '## 三、重点部门与负责人',
    renderTopBreakdown(analysis).map((line) => `- ${safeMarkdownInline(line)}`).join('\n'),
    '## 四、规则分布摘要',
    [...categorySummary.map((item) => `- ${categoryLabels[item.category]}：涉及 ${item.projects} 个项目。`),
      `- 复核状态：待复核 ${counts['待复核']} 个；确认数据错误 ${counts['确认数据错误']} 个；确认业务风险 ${counts['确认业务风险']} 个；已忽略 ${counts['已忽略']} 个。`].join('\n'),
    '## 五、建议行动',
    actions.map((line, index) => `${index + 1}. ${line}`).join('\n')
  ].join('\n\n');
}
