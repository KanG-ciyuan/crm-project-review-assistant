import { useEffect, useMemo, useState } from 'react';
import { amountInWan } from '../domain/project';
import type { ReviewRecordMap, ReviewStatus } from '../domain/review';
import type { Finding } from '../domain/rules';
import type { ProjectWorkbenchRow, RelatedProject } from '../domain/workbench';
import { formatAmountWan } from '../lib/format';
import { ProjectReviewControl } from './ProjectReviewControl';

const PAGE_SIZE = 50;

interface ProjectIssueListProps {
  rows: ProjectWorkbenchRow[];
  reviews: ReviewRecordMap;
  onChangeReview: (rowKey: string, patch: { status?: ReviewStatus; note?: string }) => void;
  onExportSelection: (selectedKeys: Set<string>) => void;
  selectedKeys?: Set<string>;
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  resetKey?: string;
}

const displayDate = (value: string | null) => value || '—';

export function ProjectIssueList({ rows, reviews, onChangeReview, onExportSelection, selectedKeys: controlledKeys, onSelectionChange, resetKey = '' }: ProjectIssueListProps) {
  const [page, setPage] = useState(1);
  const [internalKeys, setInternalKeys] = useState<Set<string>>(new Set());
  const selectedKeys = controlledKeys ?? internalKeys;
  const rowKeySignature = rows.map((row) => row.rowKey).join('\u0000');
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
    const available = new Set(rows.map((row) => row.rowKey));
    const next = new Set([...selectedKeys].filter((key) => available.has(key)));
    if (next.size !== selectedKeys.size) updateSelection(next);
    // The signature deliberately represents the filtered list rather than its array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeySignature, resetKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [page, rows]);

  function updateSelection(next: Set<string>) {
    if (!controlledKeys) setInternalKeys(next);
    onSelectionChange?.(next);
  }

  function toggle(rowKey: string) {
    const next = new Set(selectedKeys);
    if (next.has(rowKey)) next.delete(rowKey);
    else next.add(rowKey);
    updateSelection(next);
  }

  if (rows.length === 0) return <section className="project-issue-list"><p className="no-issues">当前筛选范围内没有分析结果。</p></section>;

  return <section className="project-issue-list" aria-label="项目问题清单表格">
    <div className="table-heading">
      <div><h2>项目问题清单</h2><p>当前共 {rows.length} 个有分析结果的项目</p></div>
      <button type="button" className="secondary" onClick={() => onExportSelection(new Set(selectedKeys))}>
        {selectedKeys.size > 0 ? `导出所选 ${selectedKeys.size} 个项目` : '导出当前清单'}
      </button>
    </div>
    <div className="table-scroll project-list-wrap"><table className="project-list-table"><thead><tr>
      <th>选择</th><th>项目摘要</th><th>部门负责人</th><th>关键日期</th><th>全部分析结果</th><th>人工判断</th>
    </tr></thead><tbody>{pageRows.map((row) => <ProjectRow
      key={row.rowKey}
      row={row}
      review={reviews[row.rowKey]}
      selected={selectedKeys.has(row.rowKey)}
      onToggle={() => toggle(row.rowKey)}
      onChangeReview={onChangeReview}
    />)}</tbody></table></div>
    <nav className="pagination" aria-label="项目清单分页">
      <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>上一页</button>
      <span>第 {page} / {pageCount} 页</span>
      <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>下一页</button>
    </nav>
  </section>;
}

function ProjectRow({ row, review, selected, onToggle, onChangeReview }: {
  row: ProjectWorkbenchRow;
  review: ReviewRecordMap[string] | undefined;
  selected: boolean;
  onToggle: () => void;
  onChangeReview: ProjectIssueListProps['onChangeReview'];
}) {
  const { project } = row;
  const projectLabel = project.projectId || project.projectName || row.rowKey;
  const amount = amountInWan(project);
  return <tr>
    <td data-label="选择"><input type="checkbox" aria-label={`选择项目 ${projectLabel}`} checked={selected} onChange={onToggle} /></td>
    <td data-label="项目摘要"><div className="project-summary"><strong>{project.projectName || '未填写项目名称'}</strong><span>{project.projectId || '未填写编号'}</span><span>{project.customerName || '未填写客户'}</span><span>{amount === null ? '—' : formatAmountWan(amount)}</span></div></td>
    <td data-label="部门负责人"><div className="owner-summary"><span>{project.department || '未填写部门'}</span><span>{project.salesManager || '未填写负责人'}</span></div></td>
    <td data-label="关键日期"><div className="date-stack">
      <span>创建 {displayDate(project.createdAt)}</span>
      <span>最近跟进 {displayDate(project.lastFollowUpAt)}</span>
      {row.followUpOverdueDays !== null && <small>跟进超期 {row.followUpOverdueDays} 天</small>}
      <span>预计签约 {displayDate(project.expectedSignAt)}</span>
      {row.signingOverdueDays !== null && <small>签约已过 {row.signingOverdueDays} 天</small>}
    </div></td>
    <td data-label="全部分析结果"><div className="finding-kind-stack">
      <FindingGroup label="客观事实" findings={row.factFindings} relatedProjects={row.relatedProjects} />
      <FindingGroup label="人工判断" findings={row.manualFindings} relatedProjects={row.relatedProjects} />
      <FindingGroup label="经营观察" findings={row.observationFindings} relatedProjects={row.relatedProjects} />
    </div></td>
    <td data-label="人工判断"><div className="review-cell">{row.manualFindings.length > 0 ? <ProjectReviewControl
      rowKey={row.rowKey}
      projectLabel={projectLabel}
      review={review}
      onChange={onChangeReview}
    /> : <span className="information-state">无需人工判断</span>}</div></td>
  </tr>;
}

function FindingGroup({ label, findings, relatedProjects }: { label: string; findings: Finding[]; relatedProjects: RelatedProject[] }) {
  if (findings.length === 0) return null;
  return <section className="finding-kind"><h3>{label}</h3>{findings.map((finding, index) => {
    const related = relatedProjects.filter((project) =>
      project.ruleId === finding.ruleId
      && project.relationLabel === finding.label
      && project.relationKey === finding.relationKey
    );
    return <div className="finding-item" key={`${finding.ruleId}:${finding.relationKey ?? ''}:${index}`}>
      <span className={`tag finding-${finding.level}`}>{finding.label}</span>
      <p>{finding.reason}</p>
      {related.map((project) => <p className="related-project" key={`${project.rowKey}:${project.relationKey}:${project.ruleId}`}>
        关联项目：{project.projectId || '未填写编号'} / {project.projectName || '未填写项目名称'} / {project.customerName || '未填写客户'} / {project.salesManager || '未填写负责人'} / {project.relationLabel}
      </p>)}
    </div>;
  })}</section>;
}
