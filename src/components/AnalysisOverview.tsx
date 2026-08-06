import type { AnalysisResult, BreakdownItem } from '../domain/analysis';
import type { ProjectWorkbenchRow } from '../domain/workbench';
import { formatAmountWan } from '../lib/format';

interface AnalysisOverviewProps {
  analysis: AnalysisResult;
  rows: ProjectWorkbenchRow[];
}

export function AnalysisOverview({ analysis, rows }: AnalysisOverviewProps) {
  const labelProjects = new Map<string, Set<string>>();
  rows.forEach((row) => row.findings.forEach((finding) => {
    const projects = labelProjects.get(finding.label) ?? new Set<string>();
    projects.add(row.rowKey);
    labelProjects.set(finding.label, projects);
  }));
  const labels = [...labelProjects]
    .map(([name, projects]) => ({ name, projectCount: projects.size, amountWan: 0 }))
    .sort((left, right) => right.projectCount - left.projectCount || left.name.localeCompare(right.name, 'zh-CN'));

  return <div className="analysis-overview">
    <section className="metrics" aria-label="分析总览指标">
      <Metric label="项目总数" value={analysis.overview.projectCount} sub="当前筛选" />
      <Metric label="储备金额" value={formatAmountWan(analysis.overview.totalAmountWan)} sub="统一金额口径" />
      <Metric label="客观问题项目" value={rows.filter((row) => row.factFindings.length > 0).length} sub="规则事实" />
      <Metric label="需要人工判断" value={rows.filter((row) => row.manualFindings.length > 0).length} sub="待业务确认" />
      <Metric label="经营观察" value={rows.filter((row) => row.observationFindings.length > 0).length} sub="不直接判定问题" />
    </section>
    <section className="summary-grid" aria-label="组织储备汇总">
      <AmountBreakdown title="部门储备金额分布" items={analysis.byDepartment} />
      <AmountBreakdown title="销售经理储备金额分布" items={analysis.bySalesManager} />
      <LabelBreakdown items={labels} taggedProjectCount={rows.filter((row) => row.findings.length > 0).length} />
    </section>
  </div>;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>;
}

function AmountBreakdown({ title, items }: { title: string; items: BreakdownItem[] }) {
  const max = Math.max(...items.map((item) => item.amountWan), 1);
  return <section className="chart-card"><h2>{title}</h2>{items.length === 0
    ? <p className="no-issues">暂无数据。</p>
    : items.slice(0, 6).map((item) => <div className="bar-row" key={item.name}>
      <span>{item.name}</span><div className="track"><i style={{ width: `${(item.amountWan / max) * 100}%` }} /></div><b>{formatAmountWan(item.amountWan)}</b>
    </div>)}</section>;
}

function LabelBreakdown({ items, taggedProjectCount }: { items: BreakdownItem[]; taggedProjectCount: number }) {
  const max = Math.max(...items.map((item) => item.projectCount), 1);
  const totalHits = items.reduce((sum, item) => sum + item.projectCount, 0);
  return <section className="chart-card">
    <div className="chart-card-heading">
      <h2>分析标签命中（可重复）</h2>
      {items.length > 0 && <p>{taggedProjectCount} 个项目命中标签，共 {totalHits} 次标签命中；同一项目可同时命中多个标签。</p>}
    </div>
    {items.length === 0
      ? <p className="no-issues">暂无分析标签。</p>
      : items.slice(0, 8).map((item) => <div className="bar-row" key={item.name}>
        <span>{item.name}</span><div className="track"><i style={{ width: `${(item.projectCount / max) * 100}%` }} /></div><b>{item.projectCount} 个项目</b>
      </div>)}
  </section>;
}
