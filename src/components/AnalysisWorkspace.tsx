import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { AnalysisResult } from '../domain/analysis';
import type { FilterState } from '../domain/filters';
import type { ReviewSummaryData } from '../domain/report';
import type { ReviewRecordMap, ReviewStatus } from '../domain/review';
import { projectKey } from '../domain/project';
import { buildProjectWorkbenchRows } from '../domain/workbench';
import { AnalysisOverview } from './AnalysisOverview';
import { ManualReviewList } from './ManualReviewList';
import { ProjectIssueList } from './ProjectIssueList';
import { ReviewSummary } from './ReviewSummary';

type WorkspaceTab = 'overview' | 'projects' | 'reviews' | 'summary';
type WorkspaceTabGroup = '分析' | '处理' | '输出';

interface AnalysisWorkspaceProps {
  analysis: AnalysisResult;
  relationAnalysis?: AnalysisResult;
  fullCount: number;
  filters: FilterState;
  reviews: ReviewRecordMap;
  filterControls: ReactNode;
  summary: ReviewSummaryData;
  onChangeReview: (rowKey: string, patch: { status?: ReviewStatus; note?: string }) => void;
  onDownloadMarkdown: () => void;
  onDownloadExcel: (selectedKeys: Set<string>) => void;
}

const tabs: Array<{ id: WorkspaceTab; label: string; group: WorkspaceTabGroup }> = [
  { id: 'overview', label: '数据总览', group: '分析' },
  { id: 'projects', label: '问题项目', group: '分析' },
  { id: 'reviews', label: '人工复核', group: '处理' },
  { id: 'summary', label: '复盘报告', group: '输出' }
];
const tabGroups: WorkspaceTabGroup[] = ['分析', '处理', '输出'];
const tabGroupIds: Record<WorkspaceTabGroup, string> = {
  分析: 'tab-group-analysis',
  处理: 'tab-group-handling',
  输出: 'tab-group-output'
};

export function AnalysisWorkspace({ analysis, relationAnalysis = analysis, fullCount, filters, reviews, filterControls, summary, onChangeReview, onDownloadMarkdown, onDownloadExcel }: AnalysisWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const visibleKeys = useMemo(() => new Set(analysis.rows.map(projectKey)), [analysis.rows]);
  const rows = useMemo(
    () => buildProjectWorkbenchRows(relationAnalysis).filter((row) => visibleKeys.has(row.rowKey)),
    [relationAnalysis, visibleKeys]
  );
  const issueRows = useMemo(() => rows.filter((row) => row.findings.length > 0), [rows]);
  const reviewRows = useMemo(() => rows.filter((row) => row.manualFindings.length > 0), [rows]);
  const filterSignature = JSON.stringify(filters);

  function activateTab(index: number) {
    setActiveTab(tabs[index].id);
    tabRefs.current[index]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = tabs.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    activateTab(targetIndex);
  }

  return <section className="analysis-workspace" aria-label="分析工作区">
    <div className="workbench-heading"><p>当前筛选 {analysis.rows.length} / 全部 {fullCount} 个项目</p></div>
    <div className="workbench-tabs" role="tablist" aria-label="分析结果视图">
      {tabGroups.map((group) => <div className="workbench-tab-group" key={group}>
        <span className="workbench-tab-group-label" id={tabGroupIds[group]}>{group}</span>
        {tabs.map((tab, index) => tab.group === group ? <button
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-label={tab.id === 'projects' ? `${tab.label}，${issueRows.length} 个` : tab.id === 'reviews' ? `${tab.label}，${reviewRows.length} 个` : tab.label}
          aria-describedby={tabGroupIds[tab.group]}
          aria-controls={`panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          key={tab.id}
          ref={(element) => { tabRefs.current[index] = element; }}
          onClick={() => setActiveTab(tab.id)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
        >{tab.label}{tab.id === 'projects' && <span className="workbench-tab-count" aria-hidden="true">{issueRows.length}</span>}{tab.id === 'reviews' && <span className="workbench-tab-count" aria-hidden="true">{reviewRows.length}</span>}</button> : null)}
      </div>)}
    </div>
    {activeTab === 'overview' && <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview"><AnalysisOverview analysis={analysis} rows={rows} /></div>}
    {(activeTab === 'projects' || activeTab === 'reviews') && <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
      <div className="workbench-filter-controls">{filterControls}</div>
      {activeTab === 'projects'
        ? <ProjectIssueList rows={issueRows} reviews={reviews} onChangeReview={onChangeReview} onExportSelection={onDownloadExcel} selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys} resetKey={filterSignature} />
        : <ManualReviewList rows={rows} reviews={reviews} onChangeReview={onChangeReview} />}
    </div>}
    {activeTab === 'summary' && <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary">
      <ReviewSummary summary={summary} onPreview={onDownloadMarkdown} onDownloadExcel={() => onDownloadExcel(new Set(selectedKeys))} previewButtonRef={previewButtonRef} />
    </div>}
  </section>;
}
