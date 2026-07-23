import type { ReviewSummaryData } from '../domain/report';

interface ReviewSummaryProps {
  summary: ReviewSummaryData;
  onDownloadMarkdown: () => void;
  onDownloadExcel: () => void;
}

export function ReviewSummary({ summary, onDownloadMarkdown, onDownloadExcel }: ReviewSummaryProps) {
  return <section className="review-summary" aria-label="经营复盘摘要">
    <header>
      <h2>{summary.meta.title}</h2>
      <p>生成日期：{summary.meta.generatedDate}</p>
      {summary.scope.length > 0 && <p>筛选范围：{summary.scope.join('；')}</p>}
      <p>{summary.meta.disclaimer}</p>
    </header>
    <div className="review-summary-actions">
      <button type="button" onClick={onDownloadMarkdown}>下载复盘摘要.md</button>
      <button type="button" onClick={onDownloadExcel}>导出项目明细.xlsx</button>
    </div>
    <section><h3>一、总体结论</h3><ul>{summary.overallConclusions.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section><h3>二、优先关注事项</h3><ul>{summary.priorityIssues.length > 0
      ? summary.priorityIssues.map((item) => <li key={item.label}>{item.label}：涉及 {item.projectCount} 个项目。</li>)
      : <li>本期没有规则发现。</li>}</ul></section>
    <section><h3>三、重点部门与负责人</h3><ul>{summary.focusScopes.length > 0
      ? summary.focusScopes.map((item) => <li key={`${item.type}:${item.name}`}>{item.type}：{item.name}（{item.projectCount} 个问题项目）</li>)
      : <li>暂无需要复核的部门或负责人。</li>}</ul></section>
    <section><h3>四、规则分布摘要</h3><table aria-label="规则与复核状态分布">
      <thead><tr><th scope="col">类型</th><th scope="col">范围</th><th scope="col">项目数</th></tr></thead>
      <tbody>
        {summary.ruleDistribution.categories.map((item) => <tr key={`category:${item.label}`}><td>规则分类</td><td>{item.label}</td><td>{item.projectCount}</td></tr>)}
        {summary.ruleDistribution.reviewStatuses.map((item) => <tr key={`status:${item.status}`}><td>复核状态</td><td>{item.status}</td><td>{item.count}</td></tr>)}
      </tbody>
    </table></section>
    <section><h3>五、建议行动</h3><ul>{summary.actions.map((item) => <li key={item}>{item}</li>)}</ul></section>
  </section>;
}
