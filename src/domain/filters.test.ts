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

  it('ignores stale review records unless the current row has an actionable finding', () => {
    const infoOnly = makeProject({ sourceKey: 'info', projectId: 'INFO' });
    const noFinding = makeProject({ sourceKey: 'none', projectId: 'NONE' });
    const actionable = makeProject({ sourceKey: 'action', projectId: 'ACTION' });
    const finding = (rowKey: string, level: Finding['level']): Finding => ({
      ruleId: `rule-${rowKey}`, rowKey, projectId: rowKey.toUpperCase(), projectName: `${rowKey}项目`,
      customerName: '客户', department: '部门', salesManager: '销售', amountWan: 100,
      category: level === 'info' ? '经营结构分析' : '维护超期待整改',
      label: level === 'info' ? '经营观察' : '跟进超期', reason: '测试规则', level
    });
    const analysis = buildAnalysis([infoOnly, noFinding, actionable], [
      finding('info', 'info'), finding('action', 'action')
    ], today);
    const staleRecord = (projectId: string): ReviewRecordMap[string] => ({
      projectId, projectName: `${projectId}项目`, status: '确认业务风险', note: '',
      firstReviewedAt: today.toISOString(), lastReviewedAt: today.toISOString(),
      fingerprint: projectId, dataUpdated: false, history: []
    });
    const reviews: ReviewRecordMap = {
      info: staleRecord('INFO'),
      none: staleRecord('NONE')
    };

    expect(filterProjectKeys(analysis, reviews, { ...EMPTY_FILTERS, reviewStatuses: ['确认业务风险'] })).toEqual(new Set());
    expect(filterProjectKeys(analysis, reviews, { ...EMPTY_FILTERS, reviewStatuses: ['待复核'] })).toEqual(new Set(['action']));
    expect(buildFilterOptions(analysis, EMPTY_FILTERS, reviews).reviewStatuses).toEqual([
      { value: '待复核', count: 1 },
      { value: '确认数据错误', count: 0 },
      { value: '确认业务风险', count: 0 },
      { value: '已忽略', count: 0 }
    ]);
  });

  it('uses gap-free half-open amount bands and selecting every band keeps every row', () => {
    const rows = [
      makeProject({ sourceKey: 'ordinary-edge', amount: 999.9999995 }),
      makeProject({ sourceKey: 'large-edge', projectId: 'LARGE', amount: 4999.9999995 }),
      makeProject({ sourceKey: 'very-large-edge', projectId: 'VERY-LARGE', amount: 9999.9999995 }),
      makeProject({ sourceKey: 'extreme', projectId: 'EXTREME', amount: 10_000 }),
      makeProject({ sourceKey: 'invalid', projectId: 'INVALID', amount: 0 })
    ];
    const analysis = buildAnalysis(rows, [], today);

    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, amountBands: ['普通'] })).toEqual(new Set(['ordinary-edge']));
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, amountBands: ['大额'] })).toEqual(new Set(['large-edge']));
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, amountBands: ['超大'] })).toEqual(new Set(['very-large-edge']));
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, amountBands: ['极端'] })).toEqual(new Set(['extreme']));
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, amountBands: ['普通', '大额', '超大', '极端', '金额异常'] })).toEqual(new Set(rows.map((row) => row.sourceKey)));
  });

  it('keeps a same-day date in the zero-to-seven-day band', () => {
    const row = makeProject({ sourceKey: 'today', lastFollowUpAt: '2026-07-21', createdAt: '2026-07-21' });
    const analysis = buildAnalysis([row], [], today);

    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, followUpBands: ['0-7天'], reserveCycleBands: ['0-90天'] })).toEqual(new Set(['today']));
  });

  it('preserves and filters prototype-like custom field names without pollution', () => {
    const specialFields = Object.create(null) as Record<string, string>;
    specialFields.__proto__ = '原型渠道';
    Object.defineProperty(specialFields, 'constructor', { value: '构造渠道', enumerable: true, writable: true });
    const row = makeProject({ sourceKey: 'special', customFields: specialFields });
    const analysis = buildAnalysis([row], [], today);
    const options = buildFilterOptions(analysis, EMPTY_FILTERS);
    const customValues = Object.create(null) as Record<string, string[]>;
    customValues.__proto__ = ['原型渠道'];
    Object.defineProperty(customValues, 'constructor', { value: ['构造渠道'], enumerable: true, writable: true });

    expect(Object.getPrototypeOf(options.customFields)).toBeNull();
    expect(options.customFields.__proto__).toEqual(['原型渠道']);
    expect(options.customFields['constructor']).toEqual(['构造渠道']);
    expect(filterProjectKeys(analysis, {}, { ...EMPTY_FILTERS, customValues })).toEqual(new Set(['special']));
    expect(({} as Record<string, unknown>).污染字段).toBeUndefined();
  });
});
