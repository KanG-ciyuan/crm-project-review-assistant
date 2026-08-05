import type { ReviewRecordMap, ReviewStatus } from '../domain/review';
import type { Finding } from '../domain/rules';
import type { ProjectWorkbenchRow, RelatedProject } from '../domain/workbench';
import { ProjectReviewControl } from './ProjectReviewControl';

interface ManualReviewListProps {
  rows: ProjectWorkbenchRow[];
  reviews: ReviewRecordMap;
  onChangeReview: (rowKey: string, patch: { status?: ReviewStatus; note?: string }) => void;
}

export function ManualReviewList({ rows, reviews, onChangeReview }: ManualReviewListProps) {
  const reviewRows = rows.filter((row) => row.manualFindings.length > 0);
  const pendingCount = reviewRows.filter((row) => (reviews[row.rowKey]?.status ?? '待复核') === '待复核').length;

  return <section className="manual-review-list" aria-labelledby="manual-review-heading">
    <div className="manual-review-heading">
      <h2 id="manual-review-heading">人工复核</h2>
      <p>共 {reviewRows.length} 个项目，{pendingCount} 个待复核</p>
    </div>
    {reviewRows.length === 0
      ? <p className="manual-review-empty">当前筛选范围内没有需要人工复核的项目。</p>
      : <div className="manual-review-items">{reviewRows.map((row) => {
        const { project } = row;
        const projectLabel = project.projectId || project.projectName || row.rowKey;
        return <article className="manual-review-item" key={row.rowKey}>
          <header className="manual-review-project">
            <h3>{project.projectName || '未填写项目名称'}</h3>
            <p>{project.projectId || '未填写编号'}</p>
            <p><span>{project.department || '未填写部门'}</span> / <span>{project.salesManager || '未填写负责人'}</span></p>
          </header>
          <div className="manual-review-evidence">
            {row.manualFindings.map((finding, index) => <ManualEvidence
              key={`${finding.ruleId}:${finding.relationKey ?? ''}:${index}`}
              finding={finding}
              relatedProjects={row.relatedProjects}
            />)}
          </div>
          <ProjectReviewControl
            rowKey={row.rowKey}
            projectLabel={projectLabel}
            review={reviews[row.rowKey]}
            onChange={onChangeReview}
          />
        </article>;
      })}</div>}
  </section>;
}

function ManualEvidence({ finding, relatedProjects }: { finding: Finding; relatedProjects: RelatedProject[] }) {
  const related = relatedProjects.filter((project) =>
    project.ruleId === finding.ruleId
    && project.relationLabel === finding.label
    && project.relationKey === finding.relationKey
  );
  return <div className="manual-review-finding">
    <span className={`tag finding-${finding.level}`}>{finding.label}</span>
    <p>{finding.reason}</p>
    {related.map((project) => <p className="related-project" key={`${project.rowKey}:${project.relationKey}:${project.ruleId}`}>
      关联项目：{project.projectId || '未填写编号'} / {project.projectName || '未填写项目名称'} / {project.customerName || '未填写客户'} / {project.salesManager || '未填写负责人'} / {project.relationLabel}
    </p>)}
  </div>;
}
