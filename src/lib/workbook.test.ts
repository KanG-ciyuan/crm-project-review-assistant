import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { findHeaderRow, parseSelectedSheet, validateHeaders } from './workbook';

describe('workbook helpers', () => {
  it('finds the standard header after a title row', () => {
    const matrix = [
      ['CRM 储备项目运营复盘助手 - 脱敏模拟数据'],
      ['项目编号', '项目名称', '部门', '销售经理', '项目状态', '储备金额', '金额单位', '创建日期', '最近拜访日期', '预计签约日期', '成单概率'],
      ['P-2026-001', '南昌轨道维保项目', '营销一部', '陈晨', '跟进中', 480, '万元', '2026-05-08', '2026-07-13', '2026-08-15', '70%']
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
    expect(parsed.rows.find((row) => row.projectId === 'P-2026-024')?.probability).toBe(60);
  });
});
