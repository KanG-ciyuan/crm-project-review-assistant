import type { RefObject } from 'react';
import type { ReviewSummaryData } from '../domain/report';

interface ReviewSummaryProps {
  summary: ReviewSummaryData;
  onPreview: () => void;
  onDownloadExcel: () => void;
  previewButtonRef: RefObject<HTMLButtonElement | null>;
}

export function ReviewSummary({ summary, onPreview, onDownloadExcel, previewButtonRef }: ReviewSummaryProps) {
  return <section className="review-summary" aria-label="经营复盘摘要">
    <header>
      <h2>{summary.meta.title}</h2>
      <p>生成日期：{summary.meta.generatedDate}</p>
      {summary.scope.length > 0 && <p>筛选范围：{summary.scope.join('；')}</p>}
      <p>{summary.meta.disclaimer}</p>
    </header>
    <div className="management-summary-metrics" aria-label="管理报告指标">
      <p><span>分析项目</span><strong>{summary.appendix.projectCount}</strong></p>
      <p><span>待决策事项</span><strong>{summary.decisionItems.length}</strong></p>
      <p><span>重点项目</span><strong>{summary.priorityProjects.length}</strong></p>
    </div>
    <div className="review-summary-actions">
      <button ref={previewButtonRef} type="button" onClick={onPreview}>预览完整报告</button>
      <button type="button" onClick={onDownloadExcel}>导出项目明细.xlsx</button>
    </div>
    <section className="management-summary-conclusions">
      <h3>本期经营结论</h3>
      <ul>{summary.executiveConclusions.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  </section>;
}
