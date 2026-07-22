import type { AnalysisResult, BreakdownItem } from '../domain/analysis';
import { FINDING_CATEGORIES } from '../domain/analysis';
import { groupIssuesByProject, type ProjectIssueGroup } from '../domain/issues';
import type { FindingCategory } from '../domain/rules';
import { REVIEW_STATUSES, type ReviewRecordMap, type ReviewStatus } from '../domain/review';

interface AnalysisResultsProps {
  analysis: AnalysisResult;
  reviews: ReviewRecordMap;
  onChangeReview: (rowKey: string, patch: { status?: ReviewStatus; note?: string }) => void;
}

const CATEGORY_DESCRIPTIONS: Record<FindingCategory, string> = {
  数据质量待复核: '检查缺失、格式、日期逻辑及疑似占位数据，确认后回到 CRM 修正源数据。',
  维护超期待整改: '列出跟进维护或预计签约日期已经超期的在途项目，便于及时推动更新。',
  疑似重复与撞单: '提示重复记录、重复立项及跨销售撞单线索，最终归属需要业务人员核验。',
  重点项目复盘: '集中查看达到金额分档的重点项目；信息项用于复盘，待复核项需要人工确认。',
  经营结构分析: '展示低概率、询价类和长周期项目等经营观察，不直接判定为数据错误或业务风险。'
};

const formatAmount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export function AnalysisResults({ analysis, reviews, onChangeReview }: AnalysisResultsProps) {
  const { overview } = analysis;
  return <div className="analysis-results">
    <section className="metrics" aria-label="经营概览">
      <Metric label="项目总数" value={overview.projectCount} sub="本次分析" />
      <Metric label="储备金额" value={formatAmount(overview.totalAmountWan)} sub="单位：万元" />
      <Metric label="跟进中" value={overview.inProgressCount} sub="项目" />
      <Metric label="呆滞" value={overview.dormantCount} sub="项目" />
      <Metric label="已签约" value={overview.signedCount} sub="项目" />
      <Metric label="已丢单" value={overview.lostCount} sub="项目" />
    </section>
    <section className="summary-grid" aria-label="组织储备汇总">
      <Breakdown title="部门储备金额分布" items={analysis.byDepartment} />
      <Breakdown title="销售经理储备金额分布" items={analysis.bySalesManager} />
    </section>
    <div className="result-areas">
      {FINDING_CATEGORIES.map((category, categoryIndex) => {
        const headingId = `analysis-category-${categoryIndex}`;
        const groups = groupIssuesByProject(analysis.results[category]);
        return <section className="result-section" key={category} aria-labelledby={headingId}>
          <div className="table-heading">
            <div><h2 id={headingId}>{category}</h2><p>{CATEGORY_DESCRIPTIONS[category]}</p></div>
            <span className="result-count">{groups.length} 个项目</span>
          </div>
          <FindingTable groups={groups} reviews={reviews} onChangeReview={onChangeReview} controlScope={categoryIndex} />
        </section>;
      })}
    </div>
  </div>;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>;
}

function Breakdown({ title, items }: { title: string; items: BreakdownItem[] }) {
  const max = Math.max(...items.map((item) => item.amountWan), 1);
  return <section className="chart-card"><h2>{title}</h2>{items.length === 0
    ? <p className="no-issues">暂无数据。</p>
    : items.slice(0, 6).map((item) => <div className="bar-row" key={item.name}>
      <span>{item.name}</span><div className="track"><i style={{ width: `${(item.amountWan / max) * 100}%` }} /></div><b>{formatAmount(item.amountWan)} 万</b>
    </div>)}</section>;
}

function FindingTable({ groups, reviews, onChangeReview, controlScope }: {
  groups: ProjectIssueGroup[];
  reviews: ReviewRecordMap;
  onChangeReview: AnalysisResultsProps['onChangeReview'];
  controlScope: number;
}) {
  if (groups.length === 0) return <p className="no-issues">本次分析没有发现此类项目。</p>;

  return <div className="table-scroll"><table><thead><tr>
    <th>项目编号</th><th>项目名称</th><th>客户</th><th>部门 / 负责人</th><th>储备金额</th><th>规则标签与说明</th><th>处理状态</th><th>处理说明</th>
  </tr></thead><tbody>{groups.map((group) => {
    const needsReview = group.findings.some((finding) => finding.level !== 'info');
    const review = reviews[group.reviewKey];
    const latestHistory = review?.history[review.history.length - 1];
    const projectLabel = group.projectId || group.projectName || group.reviewKey;
    return <tr key={group.reviewKey}>
      <td>{group.projectId || '未填写'}</td>
      <td>{group.projectName || '未填写项目名称'}</td>
      <td>{group.customerName || '未填写'}</td>
      <td>{group.department || '未填写'} / {group.salesManager || '未填写'}</td>
      <td>{group.amountWan === null ? '—' : `${formatAmount(group.amountWan)} 万`}</td>
      <td><div className="finding-stack">{group.findings.map((finding, index) => <div key={`${finding.ruleId}:${finding.relationKey ?? ''}:${finding.label}:${index}`}>
        <span className={`tag finding-${finding.level}`}>{finding.label}</span><span>{finding.reason}</span>
      </div>)}</div></td>
      <td>{needsReview ? <div className="review-control">
        <label className="visually-hidden" htmlFor={`review-${controlScope}-${group.reviewKey}`}>{projectLabel} 审查状态</label>
        <select id={`review-${controlScope}-${group.reviewKey}`} aria-label={`${projectLabel} 审查状态`} value={review?.status ?? '待复核'} onChange={(event) => onChangeReview(group.reviewKey, { status: event.target.value as ReviewStatus })}>
          {REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
        {review?.dataUpdated && <small className="review-updated">数据已更新，待复核</small>}
      </div> : <span className="information-state">经营观察</span>}</td>
      <td>{needsReview ? <div className="review-control">
        <label className="visually-hidden" htmlFor={`note-${controlScope}-${group.reviewKey}`}>{projectLabel} 处理说明</label>
        <input id={`note-${controlScope}-${group.reviewKey}`} aria-label={`${projectLabel} 处理说明`} value={review?.note ?? ''} maxLength={120} placeholder="填写处理说明（可选）" onChange={(event) => onChangeReview(group.reviewKey, { note: event.target.value })} />
        {latestHistory && <small className="review-history">历史：{latestHistory.status}，{latestHistory.note || '无说明'}</small>}
      </div> : <span className="information-state">无需审核</span>}</td>
    </tr>;
  })}</tbody></table></div>;
}
