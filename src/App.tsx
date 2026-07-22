import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileSpreadsheet, GitFork, Mail, ShieldCheck, Upload } from 'lucide-react';
import './review.css';
import './filters.css';
import { AnalysisFilters } from './components/AnalysisFilters';
import { AnalysisResults } from './components/AnalysisResults';
import { ImportWizard, type ImportReadyPayload } from './components/ImportWizard';
import { buildAnalysis, evaluateRulePack, projectAnalysis, type AnalysisResult, type CanonicalFieldKey } from './domain/analyze';
import { describeFilters, EMPTY_FILTERS, filterProjectKeys, type FilterState } from './domain/filters';
import { createReviewReport, formatLocalDate } from './domain/report';
import { loadReviewRecords, reconcileReviewRecords, saveReviewRecords, updateReviewRecord, type ReviewRecordMap, type ReviewStatus } from './domain/review';
import { inspectSheet, inspectWorkbook, type WorkbookInspection } from './lib/workbook';

const suggestedSourceNamespace = (fileName: string) => fileName.replace(/\.xlsx$/i, '').trim();

export default function App() {
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [fileName, setFileName] = useState('');
  const [sourceNamespace, setSourceNamespace] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [importRevision, setImportRevision] = useState(0);
  const [importReady, setImportReady] = useState<ImportReadyPayload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [currentReport, setCurrentReport] = useState('');
  const [error, setError] = useState('');
  const [reviewRecords, setReviewRecords] = useState<ReviewRecordMap>(() => loadReviewRecords(window.localStorage));
  const [feedbackCopied, setFeedbackCopied] = useState(false);

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
  const generatedCurrentReport = useMemo(
    () => visibleAnalysis ? createReviewReport(visibleAnalysis, reviewRecords, new Date(), filterScope) : '',
    [visibleAnalysis, reviewRecords, filterScope]
  );
  const allReport = useMemo(
    () => analysis ? createReviewReport(analysis, reviewRecords, new Date()) : '',
    [analysis, reviewRecords]
  );
  const confirmedSourceNamespace = sourceNamespace.trim();

  useEffect(() => {
    setCurrentReport(generatedCurrentReport);
  }, [generatedCurrentReport]);

  async function onFileChange(file: File | null) {
    if (!file) return;
    try {
      setError('');
      setAnalysis(null);
      setFilters(EMPTY_FILTERS);
      setImportReady(null);
      setCurrentReport('');
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
    const reviewKeys = [...new Set(nextFindings.filter((finding) => finding.level === 'review' || finding.level === 'action').map((finding) => finding.rowKey))];
    const nextReviews = reconcileReviewRecords(result.rows, reviewKeys, reviewRecords, now);
    saveReviewRecords(nextReviews, window.localStorage);
    setAnalysis(result);
    setFilters(EMPTY_FILTERS);
    setImportReady(payload);
    setReviewRecords(nextReviews);
    setCurrentReport(createReviewReport(result, nextReviews, now));
  }

  function clearImportedAnalysis() {
    setImportReady(null);
    setAnalysis(null);
    setFilters(EMPTY_FILTERS);
    setCurrentReport('');
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
    saveReviewRecords(next, window.localStorage);
    setReviewRecords(next);
  }

  function downloadReport(report: string, suffix: '当前筛选' | '全部') {
    if (!report.trim()) return;
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `储备项目经营复盘-${formatLocalDate(new Date())}-${suffix}.md`;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
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
        {fileName && <label className="source-namespace"><span>数据来源标识（企业/账套）</span><input required aria-label="数据来源标识（企业/账套）" aria-invalid={!confirmedSourceNamespace} value={sourceNamespace} onChange={(event) => changeSourceNamespace(event.target.value)} /><small>同一企业或 CRM 账套每次重导请保持一致；不同企业或账套必须使用不同标识。</small></label>}
        {error && <p className="error">{error}</p>}
      </div>
      {inspection && <div className="side-section"><p className="side-label">工作表</p><select aria-label="工作表" value={sheetName} onChange={(event) => { setSheetName(event.target.value); setImportReady(null); setAnalysis(null); setFilters(EMPTY_FILTERS); setCurrentReport(''); }}>{inspection.sheetNames.map((name) => <option key={name}>{name}</option>)}</select>
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
      {sheetInspection && !confirmedSourceNamespace && <section className="notice" role="alert"><h2>需要数据来源标识</h2><p>请填写数据来源标识后继续导入。</p></section>}
      {sheetInspection && confirmedSourceNamespace && <ImportWizard key={`${importRevision}:${fileName}:${sheetName}:${sourceNamespace}`} inspection={sheetInspection} sourceNamespace={confirmedSourceNamespace} onReady={startAnalysis} onConfigurationChange={clearImportedAnalysis} />}
      {analysis && visibleAnalysis && <>
        <AnalysisFilters analysis={analysis} filters={filters} reviews={reviewRecords} selectedCount={selectedKeys.size} totalCount={analysis.rows.length} onChange={setFilters} />
        <AnalysisResults analysis={visibleAnalysis} reviews={reviewRecords} onChangeReview={changeReview} />
        <section className="report-card"><div className="table-heading"><div><h2>经营复盘草稿</h2><p>当前 {visibleAnalysis.rows.length} / 全部 {analysis.rows.length} 个项目</p><p>筛选范围：{filterScope.length > 0 ? filterScope.join('；').replace(/[\r\n\t]+/g, ' ').replace(/\|/g, '/') : '全部项目'}</p></div><div><button className="secondary" onClick={() => downloadReport(currentReport, '当前筛选')} disabled={!currentReport.trim()}><Download size={15} /> 导出当前筛选结果</button> <button className="secondary" onClick={() => downloadReport(allReport, '全部')} disabled={!allReport.trim()}><Download size={15} /> 导出全部结果</button></div></div><textarea value={currentReport} onChange={(event) => setCurrentReport(event.target.value)} aria-label="经营复盘草稿" /></section>
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
