import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import { buildAnalysis, projectAnalysis } from './analysis';
import { evaluateRulePack, type Finding } from './rules';

describe('analysis summaries', () => {
  it('keeps five result categories separate and recalculates summaries for selected rows', () => {
    const today = new Date(2026, 6, 21, 12);
    const rows = [
      makeProject({ sourceKey: 'row-a', amount: 1200, department: '华东一部' }),
      makeProject({ sourceKey: 'row-b', projectId: 'CRM-002', amount: 300, department: '华南部' }),
      makeProject({ sourceKey: 'row-c', projectId: 'CRM-003', amount: 500, department: '华北部' })
    ];
    const findings = evaluateRulePack(rows, today);
    const full = buildAnalysis(rows, findings, today);
    const selected = projectAnalysis(full, new Set(['row-a']));

    expect(full.rows).toHaveLength(3);
    expect(selected.rows).toHaveLength(1);
    expect(selected.overview.totalAmountWan).toBe(1200);
    expect(Object.keys(selected.results)).toEqual([
      '数据质量待复核', '维护超期待整改', '疑似重复与撞单', '重点项目复盘', '经营结构分析'
    ]);
    expect(selected.findings.every((finding) => finding.rowKey === 'row-a')).toBe(true);
  });

  it('builds department, seller, follow-up, reserve, probability, and amount summaries', () => {
    const today = new Date(2026, 6, 21, 12);
    const rows = [
      makeProject({ sourceKey: 'a', department: '华东部', salesManager: '销售甲', amount: 1000, lastFollowUpAt: '2026-07-20', createdAt: '2026-07-01', probabilityBand: '中等概率' }),
      makeProject({ sourceKey: 'b', projectId: 'B', department: '华东部', salesManager: '销售乙', amount: 5000, lastFollowUpAt: '2026-05-01', createdAt: '2025-01-01', probabilityBand: '低概率' })
    ];
    const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);

    expect(analysis.byDepartment).toContainEqual({ name: '华东部', projectCount: 2, amountWan: 6000 });
    expect(analysis.bySalesManager.map((item) => item.name)).toEqual(['销售乙', '销售甲']);
    expect(analysis.followUpBuckets.find((item) => item.name === '61天以上')?.projectCount).toBe(1);
    expect(analysis.reserveCycleBuckets.find((item) => item.name === '超过365天')?.projectCount).toBe(1);
    expect(analysis.probabilityBreakdown.find((item) => item.name === '低概率')?.projectCount).toBe(1);
    expect(analysis.results['重点项目复盘'].find((item) => item.rowKey === 'b')?.label).toBe('超大金额待复核');
  });

  it('does not put missing or invalid dates in buckets and excludes invalid amounts from totals', () => {
    const rows = [
      makeProject({ sourceKey: 'missing', amount: null, lastFollowUpAt: null, createdAt: null }),
      makeProject({ sourceKey: 'invalid', amount: 8, unit: '美元', lastFollowUpAt: 'not-a-date', createdAt: '2026-13-40' }),
      makeProject({ sourceKey: 'valid', amount: 1, unit: '亿元', lastFollowUpAt: '2026-07-21', createdAt: '2026-07-21' })
    ];
    const analysis = buildAnalysis(rows, [], new Date(2026, 6, 21, 12));

    expect(analysis.overview.totalAmountWan).toBe(10000);
    expect(analysis.followUpBuckets.reduce((sum, item) => sum + item.projectCount, 0)).toBe(1);
    expect(analysis.reserveCycleBuckets.reduce((sum, item) => sum + item.projectCount, 0)).toBe(1);
  });

  it('projects existing findings without recomputing rule results', () => {
    const rows = [makeProject({ sourceKey: 'kept', amount: 10 }), makeProject({ sourceKey: 'removed', amount: 20 })];
    const synthetic: Finding = {
      ruleId: 'synthetic', rowKey: 'kept', projectId: '', projectName: '测试', customerName: '', department: '', salesManager: '', amountWan: 10,
      category: '经营结构分析', label: '仅存在于输入的标签', reason: '用于证明投影不会重新评估', level: 'info'
    };
    const selected = projectAnalysis(buildAnalysis(rows, [synthetic], new Date(2026, 6, 21, 12), ['projectName']), new Set(['kept']));

    expect(selected.findings).toEqual([synthetic]);
    expect(selected.results['经营结构分析']).toEqual([synthetic]);
    expect(selected.mappedFields).toEqual(['projectName']);
  });
});
