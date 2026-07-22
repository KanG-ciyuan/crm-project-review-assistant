import { describe, expect, it } from 'vitest';
import { buildAnalysis } from './analysis';
import {
  AMOUNT_BANDS,
  EMPTY_FILTERS,
  buildFilterOptions,
  describeFilters,
  filterProjectKeys,
  type FilterState
} from './filters';
import { evaluateRulePack, type Finding } from './rules';
import type { ReviewRecordMap } from './review';
import { makeProject } from '../test/fixtures';

const today = new Date('2026-07-21T09:00:00+08:00');

describe('global analysis filters', () => {
  it('uses OR within a dimension and AND across dimensions', () => {
    const rows = [
      makeProject({ sourceKey: 'row-a', department: '华东一部', salesManager: '销售甲', amount: 1200 }),
      makeProject({ sourceKey: 'row-b', projectId: 'CRM-002', department: '华东一部', salesManager: '销售乙', amount: 5000 }),
      makeProject({ sourceKey: 'row-c', projectId: 'CRM-003', department: '华南部', salesManager: '销售丙', amount: 300 })
    ];
    const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
    const filters = {
      ...EMPTY_FILTERS,
      departments: ['华东一部'],
      salesManagers: ['销售甲', '销售乙'],
      amountBands: ['大额', '超大']
    };

    expect(filterProjectKeys(analysis, {}, filters)).toEqual(new Set(['row-a', 'row-b']));
  });

  it('cascades seller options from selected departments and reports counts', () => {
    const rows = [
      makeProject({ sourceKey: 'row-a', department: '华东一部', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'row-b', projectId: 'CRM-002', department: '华东一部', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'row-c', projectId: 'CRM-003', department: '华南部', salesManager: '销售丙' })
    ];
    const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
    const options = buildFilterOptions(analysis, { ...EMPTY_FILTERS, departments: ['华南部'] });

    expect(options.salesManagers).toEqual([{ value: '销售丙', count: 1 }]);
    expect(options.departments).toEqual(expect.arrayContaining([
      { value: '华东一部', count: 2 },
      { value: '华南部', count: 1 }
    ]));
  });

  it('filters by normalized text, finding label, and review status', () => {
    const row = makeProject({ sourceKey: 'a', projectName: 'Hospital Alpha', customerName: '华城 医院' });
    const finding: Finding = {
      ruleId: 'follow-up-overdue', rowKey: 'a', projectId: row.projectId,
      projectName: row.projectName, customerName: row.customerName,
      department: row.department, salesManager: row.salesManager, amountWan: row.amount,
      label: '跟进超期', category: '维护超期待整改', level: 'action', reason: '超过30天'
    };
    const analysis = buildAnalysis([row], [finding], today);
    const reviews: ReviewRecordMap = {
      a: {
        projectId: row.projectId, projectName: row.projectName, status: '待复核', note: '',
        firstReviewedAt: today.toISOString(), lastReviewedAt: today.toISOString(),
        fingerprint: 'test', dataUpdated: false, history: []
      }
    };
    const filters: FilterState = {
      ...EMPTY_FILTERS,
      query: 'hospitalalpha',
      labels: ['跟进超期'],
      reviewStatuses: ['待复核']
    };

    expect(filterProjectKeys(analysis, reviews, filters)).toEqual(new Set(['a']));
    expect(describeFilters(filters)).toEqual(expect.arrayContaining([
      '关键词：hospitalalpha', '标签：跟进超期', '审查状态：待复核'
    ]));
  });

  it('offers low-cardinality custom values, searches high-cardinality fields, and keeps impossible combinations empty', () => {
    const rows = Array.from({ length: 21 }, (_, index) => makeProject({
      sourceKey: `row-${index}`,
      projectId: `P-${index}`,
      department: index === 0 ? '华南部' : '华东部',
      customFields: { 项目来源: index % 2 ? '展会' : '转介绍', 唯一备注: `备注-${index}` }
    }));
    const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
    const options = buildFilterOptions(analysis, EMPTY_FILTERS);

    expect(options.customFields['项目来源']).toEqual(['展会', '转介绍']);
    expect(options.customFields['唯一备注']).toBeUndefined();
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, query: '备注-20' })).toEqual(new Set(['row-20']));
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, departments: ['不存在'] })).toEqual(new Set());
  });

  it('filters extension dimensions, exact amount range, and date periods', () => {
    const rows = [
      makeProject({
        sourceKey: 'match', amount: 1200, industry: '医疗', region: '华东', projectType: '软件',
        projectLevel: 'A级', lastFollowUpAt: '2026-06-10', createdAt: '2025-10-01'
      }),
      makeProject({
        sourceKey: 'other', projectId: 'OTHER', amount: 800, industry: '制造', region: '华南',
        projectType: '设备', projectLevel: 'B级', lastFollowUpAt: '2026-07-20', createdAt: '2026-07-01'
      })
    ];
    const analysis = buildAnalysis(rows, evaluateRulePack(rows, today), today);
    const filters = {
      ...EMPTY_FILTERS,
      industries: ['医疗'], regions: ['华东'], projectTypes: ['软件'], projectLevels: ['A级'],
      amountMinWan: 1000, amountMaxWan: 1500,
      followUpBands: ['31-60天'], reserveCycleBands: ['181-365天']
    };

    expect(filterProjectKeys(analysis, {}, filters)).toEqual(new Set(['match']));
    expect(describeFilters(filters)).toEqual(expect.arrayContaining([
      '行业：医疗', '区域：华东', '项目类型：软件', '项目等级：A级',
      '金额下限：1,000万元', '金额上限：1,500万元', '跟进周期：31-60天', '储备周期：181-365天'
    ]));
  });

  it('exposes amount and finding options and treats missing review records as pending for actionable findings', () => {
    const overdue = makeProject({ sourceKey: 'overdue', amount: 10_000, lastFollowUpAt: '2026-06-01' });
    const analysis = buildAnalysis([overdue], evaluateRulePack([overdue], today), today);
    const options = buildFilterOptions(analysis, EMPTY_FILTERS);

    expect(AMOUNT_BANDS.map((band) => band.value)).toEqual(['普通', '大额', '超大', '极端', '金额异常']);
    expect(options.labels.map((item) => item.value)).toContain('跟进超期');
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, reviewStatuses: ['待复核'] })).toEqual(new Set(['overdue']));
  });

  it('counts explicit review states and classifies zero amounts as abnormal', () => {
    const zero = makeProject({ sourceKey: 'zero', amount: 0, lastFollowUpAt: '2026-06-01' });
    const analysis = buildAnalysis([zero], evaluateRulePack([zero], today), today);
    const reviews: ReviewRecordMap = {
      zero: {
        projectId: zero.projectId, projectName: zero.projectName, status: '确认数据错误', note: '',
        firstReviewedAt: today.toISOString(), lastReviewedAt: today.toISOString(),
        fingerprint: 'zero', dataUpdated: false, history: []
      }
    };

    const options = buildFilterOptions(analysis, EMPTY_FILTERS, reviews);

    expect(options.amountBands).toContainEqual({ value: '金额异常', count: 1 });
    expect(options.reviewStatuses).toContainEqual({ value: '确认数据错误', count: 1 });
    expect(options.reviewStatuses).toContainEqual({ value: '待复核', count: 0 });
  });
});
