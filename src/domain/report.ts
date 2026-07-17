import type { AnalysisResult, Issue } from './analyze';
import { groupIssuesByProject, type ProjectIssueGroup } from './issues';
import type { ReviewRecordMap, ReviewStatus } from './review';

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const renderIssues = (issues: Issue[]) => issues.length === 0
  ? '本期未发现需要处理的项目。'
  : issues.slice(0, 8).map((issue) => `- **${issue.projectId} ${issue.projectName}**：${issue.label}。${issue.reason}（${issue.status}）`).join('\n');

const reviewLine = (group: ProjectIssueGroup, note: string) => {
  const labels = group.issues.map((issue) => issue.label).join('、');
  return `- **${group.projectId} ${group.projectName}**：${labels}${note ? `。${note}` : ''}`;
};

function renderReviewProgress(analysis: AnalysisResult, reviews: ReviewRecordMap) {
  const groups = groupIssuesByProject(analysis.issues);
  const sections: Array<[ReviewStatus, string]> = [
    ['待复核', '待复核项目'],
    ['确认数据错误', '已确认数据错误项目'],
    ['确认业务风险', '已确认业务风险项目']
  ];
  const renderedSections = sections.flatMap(([status, heading]) => {
    const matched = groups.filter((group) => (reviews[group.projectId]?.status ?? '待复核') === status);
    return [
      `### ${heading}`,
      matched.length === 0
        ? '本期无项目。'
        : matched.map((group) => reviewLine(group, reviews[group.projectId]?.note ?? '')).join('\n')
    ];
  });
  const ignoredCount = groups.filter((group) => reviews[group.projectId]?.status === '已忽略').length;

  return [...renderedSections, '### 已忽略项目', `本期已忽略 ${ignoredCount} 个项目。`].join('\n\n');
}

export function createReviewReport(analysis: AnalysisResult, reviews: ReviewRecordMap, today: Date): string {
  const qualityIssues = analysis.issues.filter((issue) => issue.category === '数据质量');
  const businessIssues = analysis.issues.filter((issue) => issue.category === '经营风险');
  const { overview } = analysis;

  return [
    '# 储备项目经营复盘',
    `生成日期：${formatDate(today)}`,
    '> 本报告基于导入数据和规则标签生成，金额、日期、项目状态及业务结论须由业务人员确认。',
    '## 经营概览',
    `本期共导入 ${overview.projectCount} 个项目，储备金额合计 ${overview.totalAmountWan.toLocaleString()} 万元。跟进中 ${overview.inProgressCount} 个，已签约 ${overview.signedCount} 个，已丢单 ${overview.lostCount} 个；其中 ${overview.riskProjectCount} 个项目存在经营风险提示。`,
    '## 数据质量提醒',
    renderIssues(qualityIssues),
    '## 重点风险项目摘要',
    renderIssues(businessIssues),
    '## 审查处理进度',
    renderReviewProgress(analysis, reviews),
    '## 下期跟进行动',
    '1. 优先核实金额、日期、重复报备等数据质量问题，再确认源数据是否需要修正。\n2. 对签约预期失效和跟进停滞项目明确下一次客户沟通计划。\n3. 对高金额低确定性项目复核成单概率与关键决策链。'
  ].join('\n\n');
}
