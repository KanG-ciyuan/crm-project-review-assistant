import type { AnalysisResult } from '../domain/analysis';
import type { ReviewRecordMap } from '../domain/review';

interface ReviewSummaryProps {
  report: string;
  analysis?: AnalysisResult;
  reviews?: ReviewRecordMap;
  onDownloadMarkdown: () => void;
  onDownloadExcel: () => void;
}

export function ReviewSummary({ report, onDownloadMarkdown, onDownloadExcel }: ReviewSummaryProps) {
  const lines = report.split('\n');
  return <section className="review-summary" aria-label="经营复盘摘要">
    <div className="review-summary-actions">
      <button type="button" onClick={onDownloadMarkdown}>下载 Markdown</button>
      <button type="button" onClick={onDownloadExcel}>下载 Excel</button>
    </div>
    <article className="review-summary-content">
      {lines.map((line, index) => line.startsWith('## ')
        ? <h2 key={index}>{line.slice(3)}</h2>
        : line.startsWith('# ')
          ? <h1 key={index}>{line.slice(2)}</h1>
          : line.startsWith('- ')
            ? <p key={index}>• {line.slice(2)}</p>
            : /^\d+\. /.test(line)
              ? <p key={index}>{line}</p>
              : line.startsWith('> ')
                ? <p key={index}>{line.slice(2)}</p>
                : line ? <p key={index}>{line}</p> : <div key={index} aria-hidden="true" />)}
    </article>
  </section>;
}
