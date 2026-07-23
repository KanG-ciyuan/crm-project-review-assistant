import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import { createProjectDetailWorkbook } from './projectDetailExport';
import type { ReviewRecordMap } from './review';
import type { Finding } from './rules';
import type { ProjectWorkbenchRow } from './workbench';

function finding(
  ruleId: string,
  label: string,
  reason: string,
  rowKey = 'row-a'
): Finding {
  return {
    ruleId,
    rowKey,
    projectId: 'CRM-001',
    projectName: '项目甲',
    customerName: '客户甲',
    department: '华东一部',
    salesManager: '销售甲',
    amountWan: 1200,
    category: '数据质量待复核',
    label,
    reason,
    level: 'review'
  };
}

function worksheetRows(workbook: XLSX.WorkBook) {
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(
    workbook.Sheets['项目明细'],
    { defval: '', raw: true }
  );
}

describe('createProjectDetailWorkbook', () => {
  it('exports one complete detail row per workbench project', () => {
    const fact = finding('follow-up-overdue', '跟进已超期', '距最近跟进已 20 天');
    const manual = finding('similar-name', '名称相似待核验', '疑似与另一项目重复');
    const observation = finding('reserve-cycle', '储备周期偏长', '项目已储备 420 天');
    const first: ProjectWorkbenchRow = {
      rowKey: 'row-a',
      project: makeProject({
        sourceKey: 'row-a',
        department: '华东一部',
        salesManager: '销售甲',
        customerName: '客户甲',
        projectId: 'CRM-001',
        projectName: '项目甲',
        status: '跟进中',
        amount: 1200,
        unit: '万元',
        probabilityBand: '30%-50%',
        createdAt: '2025-05-28',
        lastFollowUpAt: '2026-07-01',
        expectedSignAt: '2026-07-20'
      }),
      findings: [fact, manual, observation],
      factFindings: [fact],
      manualFindings: [manual],
      observationFindings: [observation],
      relatedProjects: [{
        rowKey: 'row-b',
        projectId: 'CRM-002',
        projectName: '项目乙',
        customerName: '客户乙',
        salesManager: '销售乙',
        relationKey: 'similar:1',
        ruleId: 'similar-name',
        relationLabel: '名称相似待核验'
      }],
      followUpOverdueDays: 20,
      signingOverdueDays: 1,
      priority: 0
    };
    const second: ProjectWorkbenchRow = {
      rowKey: 'row-b',
      project: makeProject({
        sourceKey: 'row-b',
        projectId: 'CRM-001',
        projectName: '项目甲',
        customerName: '',
        amount: null,
        createdAt: null,
        lastFollowUpAt: null,
        expectedSignAt: null
      }),
      findings: [],
      factFindings: [],
      manualFindings: [],
      observationFindings: [],
      relatedProjects: [],
      followUpOverdueDays: null,
      signingOverdueDays: null,
      priority: 3
    };
    const reviews: ReviewRecordMap = {
      'row-a': {
        projectId: 'CRM-001', projectName: '项目甲', status: '确认业务风险', note: '由销售总监继续跟进',
        firstReviewedAt: '2026-07-21T09:00:00.000Z', lastReviewedAt: '2026-07-22T09:00:00.000Z',
        fingerprint: 'a', dataUpdated: false, history: []
      },
      'row-b': {
        projectId: 'CRM-001', projectName: '项目甲', status: '确认数据错误', note: '旧记录不得导出',
        firstReviewedAt: '2026-07-01T09:00:00.000Z', lastReviewedAt: '2026-07-01T09:00:00.000Z',
        fingerprint: 'stale', dataUpdated: false, history: []
      }
    };

    const workbook = createProjectDetailWorkbook([first, second], reviews);
    const rows = worksheetRows(workbook);

    expect(workbook.SheetNames).toEqual(['项目明细']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      部门: '华东一部',
      销售经理: '销售甲',
      客户名称: '客户甲',
      项目编码: 'CRM-001',
      项目名称: '项目甲',
      项目状态: '跟进中',
      '储备金额（万元）': 1200,
      成单概率: '30%-50%',
      创建日期: '2025-05-28',
      最近跟进日期: '2026-07-01',
      预计签约日期: '2026-07-20',
      跟进超期天数: 20,
      签约超期天数: 1,
      客观事实: '跟进已超期：距最近跟进已 20 天',
      人工核验问题: '名称相似待核验：疑似与另一项目重复',
      经营观察: '储备周期偏长：项目已储备 420 天',
      全部分析结果: [
        '跟进已超期：距最近跟进已 20 天',
        '名称相似待核验：疑似与另一项目重复',
        '储备周期偏长：项目已储备 420 天'
      ].join('\n'),
      关联项目: '项目编码：CRM-002；项目名称：项目乙；客户名称：客户乙；销售经理：销售乙；关联关系：名称相似待核验',
      人工判断状态: '确认业务风险',
      处理说明: '由销售总监继续跟进'
    });
    expect(rows[1]).toMatchObject({
      客户名称: '',
      '储备金额（万元）': '',
      创建日期: '',
      最近跟进日期: '',
      预计签约日期: '',
      跟进超期天数: '',
      签约超期天数: '',
      客观事实: '',
      人工核验问题: '',
      经营观察: '',
      全部分析结果: '',
      关联项目: '',
      人工判断状态: '',
      处理说明: ''
    });
  });

  it('sets practical widths for identifiers, dates, and long-text columns', () => {
    const workbook = createProjectDetailWorkbook([], {});
    const widths = workbook.Sheets['项目明细']['!cols']?.map((column) => column.wch);

    expect(widths).toHaveLength(20);
    expect(widths?.slice(0, 13).every((width) => typeof width === 'number' && width >= 10)).toBe(true);
    expect(widths?.slice(13).every((width) => typeof width === 'number' && width >= 24)).toBe(true);
  });
});
