import type { AnalysisResult } from './analysis';
import { FINDING_CATEGORIES } from './analysis';
import { groupIssuesByProject, type ProjectIssueGroup } from './issues';
import type { Finding } from './rules';
import type { ReviewRecordMap, ReviewStatus } from './review';

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const safeScopeItem = (value: string) => value
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\|/g, '/')
  .replace(/\s+/g, ' ')
  .trim();

const findingState = (finding: Finding) => finding.level === 'info'
  ? '经营观察'
  : finding.level === 'action' ? '待整改' : '待人工确认';

const renderFindings = (findings: Finding[]) => findings.length === 0
  ? '本期未发现此类项目。'
  : findings.slice(0, 8).map((finding) => `- **${finding.projectId || '未填写项目编号'} ${finding.projectName || '未填写项目名称'}**：${finding.label}。${finding.reason}（${findingState(finding)}）`).join('\n');

const reviewLine = (group: ProjectIssueGroup, note: string) => {
  const labels = group.findings.map((finding) => finding.label).join('、');
  return `- **${group.projectId || '未填写项目编号'} ${group.projectName || '未填写项目名称'}**：${labels}${note ? `。${note}` : ''}`;
};

function renderReviewProgress(analysis: AnalysisResult, reviews: ReviewRecordMap) {
  const groups = groupIssuesByProject(analysis.findings.filter((finding) => finding.level === 'review' || finding.level === 'action'));
  const sections: Array<[ReviewStatus, string]> = [
    ['待复核', '待复核项目'],
    ['确认数据错误', '已确认数据错误项目'],
    ['确认业务风险', '已确认业务风险项目']
  ];
  const renderedSections = sections.flatMap(([status, heading]) => {
    const matched = groups.filter((group) => (reviews[group.reviewKey]?.status ?? '待复核') === status);
    return [
      `### ${heading}`,
      matched.length === 0 ? '本期无项目。' : matched.map((group) => reviewLine(group, reviews[group.reviewKey]?.note ?? '')).join('\n')
    ];
  });
  const ignoredCount = groups.filter((group) => reviews[group.reviewKey]?.status === '已忽略').length;
  return [...renderedSections, '### 已忽略项目', `本期已忽略 ${ignoredCount} 个项目。`].join('\n\n');
}

export function createReviewReport(
  analysis: AnalysisResult,
  reviews: ReviewRecordMap,
  today: Date,
  filterScope: string[] = []
): string {
  const { overview } = analysis;
  const scope = filterScope.map(safeScopeItem).filter(Boolean);
  const resultSections = FINDING_CATEGORIES.flatMap((category) => [
    `## ${category}`,
    renderFindings(analysis.results[category])
  ]);
  return [
    '# 储备项目经营复盘',
    `生成日期：${formatDate(today)}`,
    ...(scope.length > 0 ? [`筛选范围：${scope.join('；')}`] : []),
    '> 本报告基于导入数据和规则标签生成，金额、日期、项目状态及业务结论须由业务人员确认。',
    '## 经营概览',
    `本期共导入 ${overview.projectCount} 个项目，储备金额合计 ${overview.totalAmountWan.toLocaleString()} 万元。跟进中 ${overview.inProgressCount} 个，呆滞 ${overview.dormantCount} 个，已签约 ${overview.signedCount} 个，已丢单 ${overview.lostCount} 个。`,
    ...resultSections,
    '## 审查处理进度',
    renderReviewProgress(analysis, reviews),
    '## 下期跟进行动',
    '1. 优先核实金额、日期、重复报备等数据质量问题，再确认源数据是否需要修正。\n2. 对签约日期超期未更新和跟进超期项目明确 CRM 更新与下一次客户沟通计划。\n3. 对重点金额项目复核储备金额、成单概率与关键决策链。'
  ].join('\n\n');
}
