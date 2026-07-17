import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import { analyzeProjects, type AnalysisResult, type Thresholds } from './domain/analyze';
import { groupIssuesByProject, type ProjectIssueGroup } from './domain/issues';
import { createReviewReport } from './domain/report';
import { inspectWorkbook, parseSelectedSheet, type WorkbookInspection } from './lib/workbook';

const defaultThresholds: Thresholds = { followUpDays: 14, longReserveDays: 90, absoluteAmountLimitWan: 10000 };

const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export default function App() {
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [thresholds, setThresholds] = useState(defaultThresholds);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [category, setCategory] = useState('全部');

  const parsed = useMemo(() => inspection && sheetName ? parseSelectedSheet(inspection.workbook, sheetName) : null, [inspection, sheetName]);
  const visibleIssues = useMemo(() => analysis?.issues.filter((issue) => category === '全部' || issue.category === category) ?? [], [analysis, category]);
  const visibleIssueGroups = useMemo(() => groupIssuesByProject(visibleIssues), [visibleIssues]);

  async function onFileChange(file: File | null) {
    if (!file) return;
    try {
      setError('');
      setAnalysis(null);
      setReport('');
      const next = await inspectWorkbook(file);
      setInspection(next);
      setSheetName(next.sheetNames[0]);
      setFileName(file.name);
    } catch (caught) {
      setInspection(null);
      setError(caught instanceof Error ? caught.message : '文件读取失败，请重新选择文件');
    }
  }

  function startAnalysis() {
    if (!parsed?.validation.valid) return;
    const result = analyzeProjects(parsed.rows, thresholds, new Date());
    setAnalysis(result);
    setReport(createReviewReport(result, new Date()));
    setCategory('全部');
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `储备项目经营复盘-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CR</div><div><strong>CRM 项目运营复盘</strong><span>储备项目分析助手</span></div></div>
      <div className="side-section"><p className="side-label">导入标准 Excel</p><label className="upload-button"><Upload size={16} /> 选择 .xlsx 文件<input type="file" accept=".xlsx" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} /></label>
        {fileName && <div className="file-state"><FileSpreadsheet size={17} /><div><b>{fileName}</b><span>{parsed?.rows.length ?? 0} 条项目记录</span></div></div>}
        {error && <p className="error">{error}</p>}
      </div>
      {inspection && <div className="side-section"><p className="side-label">工作表</p><select value={sheetName} onChange={(event) => { setSheetName(event.target.value); setAnalysis(null); setReport(''); }}>{inspection.sheetNames.map((name) => <option key={name}>{name}</option>)}</select>
        <p className="side-label threshold-title">规则阈值</p>
        <Threshold label="跟进停滞天数" value={thresholds.followUpDays} suffix="天" onChange={(value) => setThresholds({ ...thresholds, followUpDays: value })} />
        <Threshold label="长期储备天数" value={thresholds.longReserveDays} suffix="天" onChange={(value) => setThresholds({ ...thresholds, longReserveDays: value })} />
        <Threshold label="金额复核上限" value={thresholds.absoluteAmountLimitWan} suffix="万元" onChange={(value) => setThresholds({ ...thresholds, absoluteAmountLimitWan: value })} />
      </div>}
      <div className="sidebar-note"><ShieldCheck size={16} /><span>文件仅在当前浏览器中读取和分析，不会上传原始 Excel。</span></div>
    </aside>
    <main className="content">
      <header><div><h1>储备项目运营复盘助手</h1><p>以固定规则发现数据质量问题和经营风险，最终结论由业务人员确认。</p></div>{parsed?.validation.valid && <button className="primary" onClick={startAnalysis}>开始分析</button>}</header>
      {!inspection && <section className="empty"><FileSpreadsheet size={36} /><h2>上传标准项目明细表</h2><p>支持未加密的 .xlsx 文件。第一版仅识别标准字段，不自动猜测字段含义。</p></section>}
      {parsed && !parsed.validation.valid && <section className="notice"><h2>无法开始分析</h2><p>缺少必填字段：{parsed.validation.missing.join('、')}</p><p>请选择包含标准项目明细表的工作表，或修正 Excel 表头后重新上传。</p></section>}
      {parsed?.validation.valid && !analysis && <section className="ready"><h2>文件校验通过</h2><p>已找到 {parsed.rows.length} 条项目记录。确认阈值后点击“开始分析”。</p><Preview rows={parsed.preview} /></section>}
      {analysis && <>
        <section className="metrics">
          <Metric label="项目总数" value={analysis.overview.projectCount} sub="本次导入" />
          <Metric label="储备金额" value={formatAmount(analysis.overview.totalAmountWan)} sub="单位：万元" />
          <Metric label="跟进中" value={analysis.overview.inProgressCount} sub="项目" />
          <Metric label="已签约" value={analysis.overview.signedCount} sub="项目" />
          <Metric label="已丢单" value={analysis.overview.lostCount} sub="项目" />
          <Metric label="风险项目" value={analysis.overview.riskProjectCount} sub="待跟进" risk />
        </section>
        <section className="summary-grid"><Breakdown title="部门储备金额分布" items={analysis.byDepartment} /><Breakdown title="销售经理储备金额分布" items={analysis.bySalesManager} /></section>
        <section className="table-card"><div className="table-heading"><div><h2>数据质量与经营风险</h2><p>同一项目的多个标签会合并展示；标签为规则提示，不代表系统已确认原始数据错误。</p></div><select aria-label="风险类型" value={category} onChange={(event) => setCategory(event.target.value)}><option>全部</option><option>数据质量</option><option>经营风险</option></select></div><IssueTable groups={visibleIssueGroups} /></section>
        <section className="report-card"><div className="table-heading"><div><h2>经营复盘草稿</h2><p>本地规则自动生成，可人工编辑后下载。</p></div><button className="secondary" onClick={downloadReport} disabled={!report}><Download size={15} /> 下载 Markdown</button></div><textarea value={report} onChange={(event) => setReport(event.target.value)} aria-label="经营复盘草稿" /></section>
      </>}
    </main>
  </div>;
}

function Threshold({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="threshold"><span>{label}</span><div><input type="number" min="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{suffix}</em></div></label>;
}

function Metric({ label, value, sub, risk = false }: { label: string; value: string | number; sub: string; risk?: boolean }) { return <article className="metric"><span>{label}</span><strong className={risk ? 'risk-value' : ''}>{value}</strong><small>{sub}</small></article>; }

function Breakdown({ title, items }: { title: string; items: AnalysisResult['byDepartment'] }) {
  const max = Math.max(...items.map((item) => item.amountWan), 1);
  return <section className="chart-card"><h2>{title}</h2>{items.slice(0, 6).map((item) => <div className="bar-row" key={item.name}><span>{item.name}</span><div className="track"><i style={{ width: `${(item.amountWan / max) * 100}%` }} /></div><b>{formatAmount(item.amountWan)} 万</b></div>)}</section>;
}

function IssueTable({ groups }: { groups: ProjectIssueGroup[] }) { return <div className="table-scroll"><table><thead><tr><th>项目编号</th><th>项目名称</th><th>负责人</th><th>储备金额</th><th>标签</th><th>规则说明</th><th>处理状态</th></tr></thead><tbody>{groups.map((group) => <tr key={group.projectId}><td>{group.projectId}</td><td>{group.projectName}</td><td>{group.salesManager}</td><td>{group.amount === null ? '—' : `${formatAmount(group.amount)} 万`}</td><td><div className="tag-stack">{group.issues.map((issue) => <span className={issue.category === '数据质量' ? 'tag quality' : 'tag danger'} key={issue.label}>{issue.label}</span>)}</div></td><td>{group.issues.map((issue) => issue.reason).join('；')}</td><td>{group.issues.map((issue) => issue.status).join('、')}</td></tr>)}</tbody></table>{groups.length === 0 && <p className="no-issues">当前筛选条件下没有问题记录。</p>}</div>; }

function Preview({ rows }: { rows: Array<Record<string, unknown>> }) { const columns = ['项目编号', '项目名称', '部门', '销售经理', '项目状态']; return <div className="preview"><p>前 5 行预览</p><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div>; }
