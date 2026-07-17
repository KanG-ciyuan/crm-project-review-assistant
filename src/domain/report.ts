import type { AnalysisResult, Issue } from './analyze';

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const renderIssues = (issues: Issue[]) => issues.length === 0
  ? '本期未发现需要处理的项目。'
  : issues.slice(0, 8).map((issue) => `- **${issue.projectId} ${issue.projectName}**：${issue.label}。${issue.reason}（${issue.status}）`).join('\n');

export function createReviewReport(analysis: AnalysisResult, today: Date): string {
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
    '## 下期跟进行动',
    '1. 优先核实金额、日期、重复报备等数据质量问题，再确认源数据是否需要修正。\n2. 对签约预期失效和跟进停滞项目明确下一次客户沟通计划。\n3. 对高金额低确定性项目复核成单概率与关键决策链。'
  ].join('\n\n');
}
