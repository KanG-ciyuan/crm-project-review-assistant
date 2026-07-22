import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { diagnoseImport } from '../domain/importDiagnosis';
import { findHeaderRow, inspectSheet, parseSelectedSheet, readSheetRecords, validateHeaders } from './workbook';

describe('workbook helpers', () => {
  it('preserves percentage-formatted numeric cells for exact probability recognition', () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['项目名称', '成单概率'],
      ['医院数改', 1]
    ]);
    worksheet.B2.z = '0%';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '商机明细');

    const inspected = inspectSheet(workbook, '商机明细');
    expect(inspected.matrix[1][1]).toBe('100%');
  });

  it('returns candidate header rows without requiring known column names', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['华东销售中心项目清单'],
      ['商机名称', '业务负责人', '客户', '最后联系时间', '预计成交时间', '金额'],
      ['医院数改', '销售甲', '华城医院', '2026-07-01', '2026-08-01', 350]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, '商机明细');

    const inspected = inspectSheet(workbook, '商机明细');

    expect(inspected.candidateHeaderRows).toContain(1);
    expect(readSheetRecords(inspected.matrix, 1)[0]).toMatchObject({ 商机名称: '医院数改' });
  });

  it('trims and disambiguates blank or repeated headers without losing source values', () => {
    const records = readSheetRecords([
      [' 项目名称 ', '', '备注', '备注'],
      ['医院数改', '临时值', '首次', '再次']
    ], 0);

    expect(records[0]).toEqual({ 项目名称: '医院数改', 未命名列2: '临时值', 备注: '首次', '备注 (2)': '再次' });
  });

  it('keeps generated headers globally unique when source names already contain suffixes', () => {
    const [record] = readSheetRecords([
      ['备注', '备注', '备注 (2)'],
      ['首次', '再次', '已有后缀']
    ], 0);

    expect(Object.keys(record)).toHaveLength(3);
    expect(new Set(Object.keys(record)).size).toBe(3);
    expect(Object.values(record)).toEqual(['首次', '再次', '已有后缀']);
  });

  it('does not let an automatic blank-header name overwrite a real source header', () => {
    const [record] = readSheetRecords([
      ['未命名列2', ''],
      ['真实表头值', '空表头值']
    ], 0);

    expect(Object.keys(record)).toHaveLength(2);
    expect(new Set(Object.keys(record)).size).toBe(2);
    expect(Object.values(record)).toEqual(['真实表头值', '空表头值']);
  });

  it('reads the legacy CRM history sample without fixed-profile parsing', () => {
    const workbook = XLSX.readFile('public/CRM历史项目表-脱敏适配样表.xlsx', { cellDates: true, cellNF: true });
    const inspected = inspectSheet(workbook, '10-储备项目报备表（跟进中和呆滞）');
    const headerRowIndex = inspected.matrix.findIndex((row) => row.includes('项目编码'));
    const records = readSheetRecords(inspected.matrix, headerRowIndex);

    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty('项目编码');
    expect(records[0]).toHaveProperty('储备金额（万元）');
    const diagnosis = diagnoseImport(inspected);
    expect(diagnosis.confirmations.filter((item) => item.kind === 'probability')).toEqual([]);
    expect(diagnosis.valueMappings.probabilities).toMatchObject({ '80%': '80%', '30%': '30%', '90%': '90%' });
  });

  it('finds the standard header after a title row', () => {
    const matrix = [
      ['CRM 储备项目运营复盘助手 - 脱敏模拟数据'],
      ['项目编号', '项目名称', '部门', '销售经理', '项目状态', '储备金额', '金额单位', '创建日期', '最近拜访日期', '预计签约日期', '成单概率'],
      ['P-2026-001', '星港轨道维保项目', '营销一部', '示例经理甲', '跟进中', 480, '万元', '2026-05-08', '2026-07-13', '2026-08-15', '70%']
    ];

    expect(findHeaderRow(matrix)).toBe(1);
  });

  it('reports every missing required header', () => {
    expect(validateHeaders(['项目编号', '项目名称'])).toEqual({
      valid: false,
      missing: expect.arrayContaining(['销售经理', '储备金额', '最近拜访日期'])
    });
  });

  it('parses the supplied simulation workbook layout with a title row before the headers', () => {
    const workbook = XLSX.readFile('sample-data/CRM储备项目运营复盘助手-脱敏模拟数据.xlsx', { cellDates: true });
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['项目明细（标准导入）'], { header: 1, defval: null, raw: true });
    expect(findHeaderRow(matrix)).toBe(2);
    expect(matrix.slice(3).filter((row) => row.some((cell) => cell !== null && cell !== '')).length).toBe(30);
    const parsed = parseSelectedSheet(workbook, '项目明细（标准导入）');
    expect(parsed.rows.find((row) => row.projectId === 'P-2026-024')?.probabilityBand).toBe('60%');
  });

  it('recognizes CRM history headers and normalizes confirmed business fields', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['序号', '部门', '销售经理', '创建日期', '最近拜访时间', '拜访间隔周期（天）', '项目名称', '项目编码', '项目类型', '项目状态', '行业', '区域', '成单概率', '储备金额（万元）', '预计合同签订时间', '项目等级'],
      [1, '营销一部', '销售甲', '2026-06-01', '2026-07-01', 31, '项目甲', 'CRM-001', '软件项目', '跟进中', '交通', '华东', '1%-50%', 800, '2026-07-10', 'A级'],
      [2, '营销二部', '销售乙', '2026-06-02', '2026-07-02', 2, '无', '无', '在线项目', '呆滞', '水利', '华南', '81%-100%', 120, '2026-08-10', 'B级']
    ]);
    workbook.SheetNames.push('10-储备项目报备表（跟进中和呆滞）');
    workbook.Sheets['10-储备项目报备表（跟进中和呆滞）'] = sheet;

    const parsed = parseSelectedSheet(workbook, '10-储备项目报备表（跟进中和呆滞）');

    expect(parsed.profile).toBe('crm-history');
    expect(parsed.validation.valid).toBe(true);
    expect(parsed.rows[0]).toMatchObject({ projectId: 'CRM-001', unit: '万元', probabilityBand: '1%-50%', sourceKey: 'crm-history:1', customFields: { '拜访间隔周期（天）': 31 } });
    expect(parsed.rows[1]).toMatchObject({ projectId: '', projectName: '', status: '呆滞', probabilityBand: '81%-100%' });
  });
});
