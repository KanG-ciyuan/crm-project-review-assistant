interface ReviewSummaryProps {
  report: string;
  onDownloadMarkdown: () => void;
  onDownloadExcel: () => void;
}

export function ReviewSummary({ report, onDownloadMarkdown, onDownloadExcel }: ReviewSummaryProps) {
  return <section className="review-summary" aria-label="经营复盘摘要">
    <div className="review-summary-actions">
      <button type="button" onClick={onDownloadMarkdown}>下载 Markdown</button>
      <button type="button" onClick={onDownloadExcel}>下载 Excel</button>
    </div>
    <pre className="review-summary-content">{report}</pre>
  </section>;
}
