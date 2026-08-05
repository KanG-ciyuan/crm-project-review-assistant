import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Download, FileSpreadsheet, GitFork, Mail, ShieldCheck, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import './review.css';
import './filters.css';
import './landing.css';
import './tool-theme.css';
import { AnalysisFilters } from './components/AnalysisFilters';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';
import { ImportWizard, type ImportReadyPayload } from './components/ImportWizard';
import { ProductLanding } from './components/ProductLanding';
import { ReportPreviewDrawer } from './components/ReportPreviewDrawer';
import { buildAnalysis, evaluateRulePack, projectAnalysis, type AnalysisResult, type CanonicalFieldKey } from './domain/analyze';
import { describeFilters, EMPTY_FILTERS, filterProjectKeys, type FilterState } from './domain/filters';
import { createProjectDetailWorkbook } from './domain/projectDetailExport';
import { createReviewReport, createReviewSummary, formatLocalDate } from './domain/report';
import { createReportSnapshot, isReportSnapshotStale, type ReportPreviewSnapshot } from './domain/reportSnapshot';
import { loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord, type ReviewRecordMap, type ReviewStatus } from './domain/review';
import { buildProjectWorkbenchRows, manualReviewKeys } from './domain/workbench';
import { inspectSheet, inspectWorkbook, type WorkbookInspection } from './lib/workbook';

const suggestedSourceNamespace = (fileName: string) => fileName.replace(/\.xlsx$/i, '').trim();

export default function App() {
  const [view, setView] = useState<'landing' | 'tool'>('landing');

  function openTool() {
    window.history.replaceState(null, '', '#analysis');
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    setView('tool');
  }

  function openLanding() {
    window.history.replaceState(null, '', window.location.pathname);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    setView('landing');
  }

  return view === 'landing'
    ? <ProductLanding onStart={openTool} />
    : <ReviewTool onBack={openLanding} />;
}

export function ReviewTool({ onBack }: { onBack?: () => void }) {
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceNamespace, setSourceNamespace] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [importRevision, setImportRevision] = useState(0);
  const [importReady, setImportReady] = useState<ImportReadyPayload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [error, setError] = useState('');
  const [reviewRecords, setReviewRecords] = useState<ReviewRecordMap>(() => loadReviewRecords(window.localStorage));
  const [storageError, setStorageError] = useState('');
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  const [reportSnapshot, setReportSnapshot] = useState<ReportPreviewSnapshot | null>(null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportDownloaded, setReportDownloaded] = useState(false);
  const [reportDownloadError, setReportDownloadError] = useState('');
  const [activeSourceNamespace, setActiveSourceNamespace] = useState('');
  const appShellRef = useRef<HTMLDivElement>(null);
  const reportPreviewTriggerRef = useRef<HTMLButtonElement>(null);

  const sheetInspection = useMemo(() => inspection && sheetName ? inspectSheet(inspection.workbook, sheetName) : null, [inspection, sheetName]);
  const selectedKeys = useMemo(
    () => analysis ? filterProjectKeys(analysis, reviewRecords, filters) : new Set<string>(),
    [analysis, reviewRecords, filters]
  );
  const visibleAnalysis = useMemo(
    () => analysis ? projectAnalysis(analysis, selectedKeys) : null,
    [analysis, selectedKeys]
  );
  const filterScope = useMemo(() => describeFilters(filters), [filters]);
  const currentReport = useMemo(
    () => visibleAnalysis ? createReviewReport(visibleAnalysis, reviewRecords, new Date(), filterScope) : '',
    [visibleAnalysis, reviewRecords, filterScope]
  );
  const currentSummary = useMemo(
    () => visibleAnalysis ? createReviewSummary(visibleAnalysis, reviewRecords, filterScope) : null,
    [visibleAnalysis, reviewRecords, filterScope]
  );
  const confirmedSourceNamespace = sourceNamespace.trim();
  const reportSourceSignature = useMemo(() => JSON.stringify({
    source: activeSourceNamespace,
    analysisGeneratedAt: analysis?.generatedAt ?? '',
    filters,
    reviews: reviewRecords,
    markdown: currentReport
  }), [activeSourceNamespace, analysis?.generatedAt, currentReport, filters, reviewRecords]);
  const reportIsStale = isReportSnapshotStale(reportSnapshot, reportSourceSignature);

  function persistReviews(records: ReviewRecordMap) {
    try {
      saveReviewRecords(records, window.localStorage);
      setStorageError('');
    } catch {
      setStorageError('处理结果暂时无法保存到浏览器。当前输入已保留，请检查浏览器存储空间后重试。');
    }
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    try {
      setError('');
      setAnalysis(null);
      setFilters(EMPTY_FILTERS);
      setImportReady(null);
      setSourceNamespace('');
      const next = await inspectWorkbook(file);
      setImportRevision((current) => current + 1);
      setInspection(next);
      setSheetName(next.sheetNames[0]);
      setFileName(file.name);
      setSourceNamespace(suggestedSourceNamespace(file.name));
    } catch (caught) {
      setInspection(null);
      setFilters(EMPTY_FILTERS);
      setImportReady(null);
      setSheetName('');
      setFileName('');
      setSourceNamespace('');
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
    const result = buildAnalysis(payload.rows, nextFindings, now, [...mappedFields]);
    const reviewKeys = manualReviewKeys(nextFindings);
    const nextReviews = reconcileReviewRecords(result.rows, reviewKeys, reviewRecords, now);
    persistReviews(nextReviews);
    if (activeSourceNamespace && activeSourceNamespace !== confirmedSourceNamespace) {
      setReportSnapshot(null);
      setReportPreviewOpen(false);
    }
    setActiveSourceNamespace(confirmedSourceNamespace);
    setAnalysis(result);
    setFilters(EMPTY_FILTERS);
    setImportReady(payload);
    setReviewRecords(nextReviews);
  }

  function clearImportedAnalysis() {
    setImportReady(null);
    setAnalysis(null);
    setFilters(EMPTY_FILTERS);
  }

  function changeSourceNamespace(value: string) {
    setSourceNamespace(value);
    clearImportedAnalysis();
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
    setReviewRecords(next);
    persistReviews(next);
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = fileName;
    try {
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  }

  function openReportPreview() {
    if (!currentReport.trim()) return;
    if (!reportSnapshot) setReportSnapshot(createReportSnapshot(currentReport, reportSourceSignature, new Date()));
    setReportDownloaded(false);
    setReportDownloadError('');
    setReportPreviewOpen(true);
  }

  function regenerateReportPreview() {
    if (!currentReport.trim()) return;
    setReportSnapshot(createReportSnapshot(currentReport, reportSourceSignature, new Date()));
    setReportDownloaded(false);
    setReportDownloadError('');
  }

  function downloadReportSnapshot(snapshot: ReportPreviewSnapshot) {
    try {
      downloadBlob(new Blob([snapshot.markdown], { type: 'text/markdown;charset=utf-8' }), snapshot.fileName);
      setReportDownloaded(true);
      setReportDownloadError('');
    } catch {
      setReportDownloaded(false);
      setReportDownloadError('报告下载失败，请重试。');
    }
  }

  function downloadProjectDetails(selection: Set<string>) {
    if (!analysis || !visibleAnalysis) return;
    const exportKeys = selection.size > 0 ? selection : selectedKeys;
    const rows = buildProjectWorkbenchRows(analysis).filter((row) => exportKeys.has(row.rowKey));
    const workbook = createProjectDetailWorkbook(rows, reviewRecords);
    const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const suffix = selection.size > 0 ? `所选${selection.size}个项目` : '当前筛选';
    downloadBlob(
      new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `CRM项目分析明细-${formatLocalDate(new Date())}-${suffix}.xlsx`
    );
  }

  async function copyFeedbackEmail() {
    try {
      await navigator.clipboard.writeText('88416563@qq.com');
      setFeedbackCopied(true);
    } catch {
      setFeedbackCopied(false);
    }
  }

  return <>
    <div className="app-shell" ref={appShellRef}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CRM</div><div><strong>CRM 项目运营复盘</strong><span>储备项目分析助手</span></div></div>
      <div className="side-section"><p className="side-label">导入 Excel</p><label className="upload-button"><Upload size={16} /> 选择 .xlsx 文件<input className="visually-hidden-file" aria-label="选择 .xlsx 文件" type="file" accept=".xlsx" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} /></label>
        {fileName && <div className="file-state"><FileSpreadsheet size={17} /><div><b>{fileName}</b><span>{importReady?.rows.length ?? '待确认'} 条项目记录</span></div></div>}
        {fileName && <label className="source-namespace"><span>数据来源标识（企业/账套）</span><input required aria-label="数据来源标识（企业/账套）" aria-invalid={!confirmedSourceNamespace} value={sourceNamespace} onChange={(event) => changeSourceNamespace(event.target.value)} /><small>同一企业或 CRM 账套每次重导请保持一致；不同企业或账套必须使用不同标识。</small></label>}
        {error && <p className="error">{error}</p>}
      </div>
      {inspection && <div className="side-section"><p className="side-label">工作表</p><select aria-label="工作表" value={sheetName} onChange={(event) => { setSheetName(event.target.value); setImportReady(null); setAnalysis(null); setFilters(EMPTY_FILTERS); }}>{inspection.sheetNames.map((name) => <option key={name}>{name}</option>)}</select>
        <p className="side-label threshold-title">规则阈值</p>
        <Threshold label="跟进维护周期" value={30} suffix="天" />
        <Threshold label="重点项目金额" value={1000} suffix="万元" />
        <p className="rule-note">规则包按已确认业务口径运行；未映射字段对应的规则会跳过。</p>
      </div>}
      <div className="sidebar-note"><ShieldCheck size={16} /><span>文件仅在当前浏览器中读取和分析，不会上传原始 Excel。</span></div>
    </aside>
    <main className="content">
      <header><div><h1>储备项目运营复盘助手</h1><p>以固定规则发现数据质量问题和经营风险，最终结论由业务人员确认。</p></div>{onBack && <button className="tool-back" type="button" onClick={onBack}><ArrowLeft size={15} /> 返回产品介绍</button>}</header>
      {!inspection && <section className="empty import-guide"><FileSpreadsheet size={36} /><h2>上传 CRM 储备项目表</h2><p>支持未加密的 .xlsx 文件，可在导入向导中确认表头、字段关系和业务口径。</p><a className="sample-download" href="/CRM历史项目表-脱敏适配样表.xlsx" download><Download size={15} /> 下载脱敏示例表</a></section>}
      {sheetInspection && !confirmedSourceNamespace && <section className="notice" role="alert"><h2>需要数据来源标识</h2><p>请填写数据来源标识后继续导入。</p></section>}
      {sheetInspection && confirmedSourceNamespace && <ImportWizard key={`${importRevision}:${fileName}:${sheetName}:${sourceNamespace}`} inspection={sheetInspection} sourceNamespace={confirmedSourceNamespace} onReady={startAnalysis} onConfigurationChange={clearImportedAnalysis} />}
      {analysis && visibleAnalysis && currentSummary && <>
        {storageError && <section className="notice storage-notice" role="alert"><h2>自动保存失败</h2><p>{storageError}</p><button type="button" className="secondary" onClick={() => persistReviews(reviewRecords)}>重试保存</button></section>}
        <AnalysisWorkspace
          analysis={visibleAnalysis}
          relationAnalysis={analysis}
          fullCount={analysis.rows.length}
          filters={filters}
          reviews={reviewRecords}
          filterControls={<AnalysisFilters analysis={analysis} filters={filters} reviews={reviewRecords} selectedCount={selectedKeys.size} totalCount={analysis.rows.length} onChange={setFilters} />}
          summary={currentSummary}
          onChangeReview={changeReview}
          onDownloadMarkdown={openReportPreview}
          onDownloadExcel={downloadProjectDetails}
          previewButtonRef={reportPreviewTriggerRef}
        />
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
    </div>
    {reportPreviewOpen && reportSnapshot && <ReportPreviewDrawer
      snapshot={reportSnapshot}
      stale={reportIsStale}
      downloaded={reportDownloaded}
      downloadError={reportDownloadError}
      onClose={() => setReportPreviewOpen(false)}
      onRegenerate={regenerateReportPreview}
      onDownload={downloadReportSnapshot}
      returnFocusRef={reportPreviewTriggerRef}
      backgroundRef={appShellRef}
    />}
  </>;
}

function Threshold({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <label className="threshold"><span>{label}</span><div><input type="number" min="1" value={value} disabled /><em>{suffix}</em></div></label>;
}
