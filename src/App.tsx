import { useMemo, useState } from 'react';
import { Copy, Download, FileSpreadsheet, GitFork, Mail, ShieldCheck, Upload } from 'lucide-react';
import './review.css';
import { ImportWizard, type ImportReadyPayload } from './components/ImportWizard';
import { adaptFindingsForLegacyView, evaluateRulePack, type AnalysisResult, type CanonicalFieldKey } from './domain/analyze';
import { groupIssuesByProject, type ProjectIssueGroup } from './domain/issues';
import { createReviewReport } from './domain/report';
import { REVIEW_STATUSES, loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord, type ReviewRecordMap, type ReviewStatus } from './domain/review';
import { inspectSheet, inspectWorkbook, type WorkbookInspection } from './lib/workbook';

const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export default function App() {
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [importRevision, setImportRevision] = useState(0);
  const [importReady, setImportReady] = useState<ImportReadyPayload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [category, setCategory] = useState('全部');
  const [reviewRecords, setReviewRecords] = useState<ReviewRecordMap>(() => loadReviewRecords(window.localStorage));
  const [reviewStatusFilter, setReviewStatusFilter] = useState<'全部' | ReviewStatus>('全部');
  const [feedbackCopied, setFeedbackCopied] = useState(false);

  const sheetInspection = useMemo(() => inspection && sheetName ? inspectSheet(inspection.workbook, sheetName) : null, [inspection, sheetName]);
  const isCrmHistory = importReady?.mappings.some((mapping) => mapping.sourceHeader === '项目编码') ?? false;
  const visibleIssues = useMemo(() => analysis?.issues.filter((issue) => category === '全部' || issue.category === category) ?? [], [analysis, category]);
  const visibleIssueGroups = useMemo(() => groupIssuesByProject(visibleIssues).filter((group) => reviewStatusFilter === '全部' || (reviewRecords[group.reviewKey]?.status ?? '待复核') === reviewStatusFilter), [visibleIssues, reviewRecords, reviewStatusFilter]);

  async function onFileChange(file: File | null) {
    if (!file) return;
    try {
      setError('');
      setAnalysis(null);
      setImportReady(null);
      setReport('');
      const next = await inspectWorkbook(file);
      setImportRevision((current) => current + 1);
      setInspection(next);
      setSheetName(next.sheetNames[0]);
      setFileName(file.name);
    } catch (caught) {
      setInspection(null);
      setImportReady(null);
      setSheetName('');
      setFileName('');
      setError(caught instanceof Error ? caught.message : '文件读取失败，请重新选择文件');
    }
  }

  function startAnalysis(payload: ImportReadyPayload) {
    const now = new Date();
    const mappedFields = new Set<CanonicalFieldKey>();
    for (const mapping of payload.mappings) {
      if (mapping.mode === 'standard' && mapping.targetField) mappedFields.add(mapping.targetField);
    }
    if (mappedFields.has('amount') && payload.valueMappings.amountUnit) mappedFields.add('unit');
    const nextFindings = evaluateRulePack(payload.rows, now, { mappedFields });
    const result = adaptFindingsForLegacyView(payload.rows, nextFindings);
    const groups = groupIssuesByProject(result.issues);
    const nextReviews = reconcileReviewRecords(result.rows, groups.map((group) => group.reviewKey), reviewRecords, now);
    saveReviewRecords(nextReviews, window.localStorage);
    setAnalysis(result);
    setImportReady(payload);
    setReviewRecords(nextReviews);
    setReport(createReviewReport(result, nextReviews, now));
    setCategory('全部');
    setReviewStatusFilter('全部');
  }

  function clearImportedAnalysis() {
    setImportReady(null);
    setAnalysis(null);
    setReport('');
  }

  function changeReview(projectId: string, patch: { status?: ReviewStatus; note?: string }) {
    if (!analysis) return;
    const current = reviewRecords[projectId];
    if (!current) return;
    const now = new Date();
    const next = updateReviewRecord(reviewRecords, projectId, {
      status: patch.status ?? current.status,
      note: patch.note ?? current.note
    }, now);
    saveReviewRecords(next, window.localStorage);
    setReviewRecords(next);
    setReport(createReviewReport(analysis, next, now));
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `储备项目经营复盘-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyFeedbackEmail() {
    try {
      await navigator.clipboard.writeText('88416563@qq.com');
      setFeedbackCopied(true);
    } catch {
      setFeedbackCopied(false);
    }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CR</div><div><strong>CRM 项目运营复盘</strong><span>储备项目分析助手</span></div></div>
      <div className="side-section"><p className="side-label">导入 Excel</p><label className="upload-button"><Upload size={16} /> 选择 .xlsx 文件<input className="visually-hidden-file" aria-label="选择 .xlsx 文件" type="file" accept=".xlsx" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} /></label>
        {fileName && <div className="file-state"><FileSpreadsheet size={17} /><div><b>{fileName}</b><span>{importReady?.rows.length ?? '待确认'} 条项目记录</span></div></div>}
        {error && <p className="error">{error}</p>}
      </div>
      {inspection && <div className="side-section"><p className="side-label">工作表</p><select aria-label="工作表" value={sheetName} onChange={(event) => { setSheetName(event.target.value); setImportReady(null); setAnalysis(null); setReport(''); }}>{inspection.sheetNames.map((name) => <option key={name}>{name}</option>)}</select>
        <p className="side-label threshold-title">规则阈值</p>
        <Threshold label="跟进维护周期" value={30} suffix="天" />
        <Threshold label="重点项目金额" value={1000} suffix="万元" />
        <p className="rule-note">规则包按已确认业务口径运行；未映射字段对应的规则会跳过。</p>
      </div>}
      <div className="sidebar-note"><ShieldCheck size={16} /><span>文件仅在当前浏览器中读取和分析，不会上传原始 Excel。</span></div>
    </aside>
    <main className="content">
      <header><div><h1>储备项目运营复盘助手</h1><p>以固定规则发现数据质量问题和经营风险，最终结论由业务人员确认。</p></div></header>
      {!inspection && <section className="empty import-guide"><FileSpreadsheet size={36} /><h2>上传 CRM 储备项目表</h2><p>支持未加密的 .xlsx 文件，可在导入向导中确认表头、字段关系和业务口径。</p><a className="sample-download" href="/CRM历史项目表-脱敏适配样表.xlsx" download><Download size={15} /> 下载脱敏示例表</a></section>}
      {sheetInspection && <ImportWizard key={`${importRevision}:${fileName}:${sheetName}`} inspection={sheetInspection} onReady={startAnalysis} onConfigurationChange={clearImportedAnalysis} />}
      {analysis && <>
        <section className="metrics">
          <Metric label="项目总数" value={analysis.overview.projectCount} sub="本次导入" />
          <Metric label="储备金额" value={formatAmount(analysis.overview.totalAmountWan)} sub="单位：万元" />
          <Metric label="跟进中" value={analysis.overview.inProgressCount} sub="项目" />
          {isCrmHistory ? <><Metric label="手动标记呆滞" value={analysis.manualStagnationProjects.length} sub="项目" /><Metric label="跟进超期" value={countIssues(analysis, '跟进超期')} sub="超过 30 天" risk /><Metric label="签约日期超期" value={countIssues(analysis, '签约日期超期未更新')} sub="需要更新" risk /></> : <><Metric label="已签约" value={analysis.overview.signedCount} sub="项目" /><Metric label="已丢单" value={analysis.overview.lostCount} sub="项目" /><Metric label="待复盘项目" value={analysis.overview.riskProjectCount} sub="需核验或整改" risk /></>}
        </section>
        <section className="summary-grid"><Breakdown title="部门储备金额分布" items={analysis.byDepartment} /><Breakdown title="销售经理储备金额分布" items={analysis.bySalesManager} /></section>
        <section className="table-card"><div className="table-heading"><div><h2>数据质量与经营风险</h2><p>同一项目的多个标签会合并展示；标签为规则提示，不代表系统已确认原始数据错误。</p></div><div className="table-filters"><select aria-label="风险类型" value={category} onChange={(event) => setCategory(event.target.value)}><option>全部</option><option>数据质量</option><option>经营风险</option></select><select aria-label="审查状态筛选" value={reviewStatusFilter} onChange={(event) => setReviewStatusFilter(event.target.value as '全部' | ReviewStatus)}><option>全部</option>{REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div></div><IssueTable groups={visibleIssueGroups} reviews={reviewRecords} onChangeReview={changeReview} /></section>
        {isCrmHistory && <section className="project-list-grid"><ProjectList title="已手动标记呆滞" description="由销售在 CRM 中主动标记，保留为运营复盘清单，不自动判定为风险。" rows={analysis.manualStagnationProjects} empty="本次没有手动标记为呆滞的项目。" /><ProjectList title="低概率重点项目" description="按储备金额从高到低排列，供管理者优先核验投入与预期；不计入风险项目。" rows={analysis.observationProjects} empty="本次没有低概率项目。" /></section>}
        <section className="report-card"><div className="table-heading"><div><h2>经营复盘草稿</h2><p>本地规则自动生成，可人工编辑后下载。</p></div><button className="secondary" onClick={downloadReport} disabled={!report}><Download size={15} /> 下载 Markdown</button></div><textarea value={report} onChange={(event) => setReport(event.target.value)} aria-label="经营复盘草稿" /></section>
      </>}
      <footer className="product-footer">
        <span>反馈建议</span>
        <a href="mailto:88416563@qq.com"><Mail size={14} /> 邮件反馈</a>
        <i aria-hidden="true" />
        <button className="footer-action" type="button" onClick={copyFeedbackEmail}><Copy size={14} /> {feedbackCopied ? '已复制' : '复制邮箱'}</button>
        <i aria-hidden="true" />
        <a href="https://github.com/KanG-ciyuan/crm-project-review-assistant" target="_blank" rel="noreferrer"><GitFork size={14} /> 代码与版本</a>
      </footer>
    </main>
  </div>;
}

function Threshold({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <label className="threshold"><span>{label}</span><div><input type="number" min="1" value={value} disabled /><em>{suffix}</em></div></label>;
}

function Metric({ label, value, sub, risk = false }: { label: string; value: string | number; sub: string; risk?: boolean }) { return <article className="metric"><span>{label}</span><strong className={risk ? 'risk-value' : ''}>{value}</strong><small>{sub}</small></article>; }

function countIssues(analysis: AnalysisResult, label: string) { return new Set(analysis.issues.filter((issue) => issue.label === label).map((issue) => issue.projectId)).size; }

function Breakdown({ title, items }: { title: string; items: AnalysisResult['byDepartment'] }) {
  const max = Math.max(...items.map((item) => item.amountWan), 1);
  return <section className="chart-card"><h2>{title}</h2>{items.slice(0, 6).map((item) => <div className="bar-row" key={item.name}><span>{item.name}</span><div className="track"><i style={{ width: `${(item.amountWan / max) * 100}%` }} /></div><b>{formatAmount(item.amountWan)} 万</b></div>)}</section>;
}

function IssueTable({ groups, reviews, onChangeReview }: { groups: ProjectIssueGroup[]; reviews: ReviewRecordMap; onChangeReview: (projectId: string, patch: { status?: ReviewStatus; note?: string }) => void }) { return <div className="table-scroll"><table><thead><tr><th>项目编号</th><th>项目名称</th><th>负责人</th><th>储备金额</th><th>标签</th><th>规则说明</th><th>审查状态</th><th>处理说明</th></tr></thead><tbody>{groups.map((group) => { const review = reviews[group.reviewKey]; const latestHistory = review?.history[review.history.length - 1]; return <tr key={group.reviewKey}><td>{group.projectId}</td><td>{group.projectName}</td><td>{group.salesManager}</td><td>{group.amount === null ? '—' : `${formatAmount(group.amount)} 万`}</td><td><div className="tag-stack">{group.issues.map((issue) => <span className={issue.category === '数据质量' ? 'tag quality' : 'tag danger'} key={issue.label}>{issue.label}</span>)}</div></td><td>{group.issues.map((issue) => issue.reason).join('；')}</td><td><div className="review-control"><select aria-label={`${group.projectId} 审查状态`} value={review?.status ?? '待复核'} onChange={(event) => onChangeReview(group.reviewKey, { status: event.target.value as ReviewStatus })}>{REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>{review?.dataUpdated && <small className="review-updated">数据已更新，待复核</small>}</div></td><td><div className="review-control"><input aria-label={`${group.projectId} 处理说明`} value={review?.note ?? ''} maxLength={120} placeholder="填写处理说明（可选）" onChange={(event) => onChangeReview(group.reviewKey, { note: event.target.value })} />{latestHistory && <small className="review-history">历史：{latestHistory.status}，{latestHistory.note || '无说明'}</small>}</div></td></tr>; })}</tbody></table>{groups.length === 0 && <p className="no-issues">当前筛选条件下没有问题记录。</p>}</div>; }

function ProjectList({ title, description, rows, empty }: { title: string; description: string; rows: AnalysisResult['rows']; empty: string }) {
  return <section className="project-list"><div><h2>{title}</h2><p>{description}</p></div>{rows.length === 0 ? <p className="no-issues">{empty}</p> : <ol>{rows.map((row) => <li key={row.sourceKey ?? row.projectId}><div><b>{row.projectName || '未填写项目名称'}</b><span>{row.projectId || '未填写项目编号'} · {row.salesManager || '未填写负责人'}</span></div><strong>{row.amount === null ? '—' : `${formatAmount(row.amount)} 万`}</strong></li>)}</ol>}</section>;
}
