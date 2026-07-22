import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import {
  distinctProjectMarkers,
  evaluateRulePack,
  getRuleCapabilities,
  normalizeProjectName
} from './rules';

const today = new Date('2026-07-21');

describe('confirmed To B rule pack', () => {
  it('flags both active and dormant projects after 30 days without follow-up', () => {
    const rows = [
      makeProject({ sourceKey: 'a', status: '跟进中', lastFollowUpAt: '2026-06-20' }),
      makeProject({ sourceKey: 'b', status: '呆滞', lastFollowUpAt: '2026-06-20' })
    ];
    const findings = evaluateRulePack(rows, today);
    expect(findings.filter((item) => item.label === '跟进超期').map((item) => item.rowKey))
      .toEqual(['a', 'b']);
  });

  it('does not flag the exact 30-day follow-up boundary', () => {
    const findings = evaluateRulePack([
      makeProject({ sourceKey: 'boundary', lastFollowUpAt: '2026-06-21' })
    ], today);
    expect(findings.find((item) => item.label === '跟进超期')).toBeUndefined();
  });

  it('prioritizes impossible signing dates over overdue signing dates', () => {
    const findings = evaluateRulePack([
      makeProject({ createdAt: '2026-06-01', expectedSignAt: '2026-05-01' })
    ], today);
    expect(findings.map((item) => item.label)).toContain('签约日期逻辑异常');
    expect(findings.map((item) => item.label)).not.toContain('签约日期超期未更新');
  });

  it('flags a last-follow-up date before project creation without exceptions', () => {
    const findings = evaluateRulePack([
      makeProject({ createdAt: '2026-06-01', lastFollowUpAt: '2026-05-31' })
    ], today);
    expect(findings.map((item) => item.label)).toContain('跟进日期逻辑异常');
  });

  it('only flags overdue signing dates for active or dormant projects', () => {
    const rows = [
      makeProject({ sourceKey: 'active', status: '跟进中', expectedSignAt: '2026-07-20' }),
      makeProject({ sourceKey: 'dormant', status: '呆滞', expectedSignAt: '2026-07-20' }),
      makeProject({ sourceKey: 'signed', status: '已签约', expectedSignAt: '2026-07-20' })
    ];
    expect(evaluateRulePack(rows, today).filter((item) => item.label === '签约日期超期未更新').map((item) => item.rowKey))
      .toEqual(['active', 'dormant']);
  });

  it.each([
    [999.99, null],
    [1000, '大额重点项目'],
    [5000, '超大金额待复核'],
    [10000, '极端金额待核实']
  ])('classifies %s 万元 at the confirmed boundary', (amount, label) => {
    const findings = evaluateRulePack([makeProject({ amount, unit: '万元' })], today);
    expect(findings.find((item) => item.ruleId.startsWith('amount-tier'))?.label ?? null).toBe(label);
  });

  it('does not modify source amounts while evaluating the rule pack', () => {
    const row = makeProject({ amount: 50000, unit: '万元' });
    evaluateRulePack([row], today);
    expect(row.amount).toBe(50000);
  });

  it.each([
    [null, '储备金额待补充'],
    [0, '储备金额待补充'],
    [-1, '金额格式异常']
  ])('checks invalid amount %s', (amount, label) => {
    expect(evaluateRulePack([makeProject({ amount })], today).map((item) => item.label)).toContain(label);
  });

  it('does not use an unknown amount unit for amount rules', () => {
    const findings = evaluateRulePack([makeProject({ amount: 10000, unit: '千元' })], today);
    expect(findings.some((item) => item.ruleId.startsWith('amount-tier'))).toBe(false);
    expect(findings.map((item) => item.label)).toContain('金额格式异常');
  });

  it('flags the fifth repeated seller amount as a possible placeholder pattern', () => {
    const rows = Array.from({ length: 5 }, (_, index) => makeProject({
      sourceKey: `repeat-${index}`, projectId: `R-${index}`, amount: 10, salesManager: '销售甲'
    }));
    expect(evaluateRulePack(rows, today).filter((item) => item.label === '疑似占位金额')).toHaveLength(5);
  });

  it('does not flag four repeated seller amounts', () => {
    const rows = Array.from({ length: 4 }, (_, index) => makeProject({
      sourceKey: `repeat-${index}`, projectId: `R-${index}`, amount: 10, salesManager: '销售甲'
    }));
    expect(evaluateRulePack(rows, today).filter((item) => item.label === '疑似占位金额')).toHaveLength(0);
  });

  it('separates duplicate records, duplicate creation, and cross-seller collision by row', () => {
    const rows = [
      makeProject({ sourceKey: 'record-a', projectId: 'DUP-1', customerName: '客户一', projectName: '编码重复甲' }),
      makeProject({ sourceKey: 'record-b', projectId: 'DUP-1', customerName: '客户二', projectName: '编码重复乙' }),
      makeProject({ sourceKey: 'project-a', projectId: 'NEW-1', customerName: '客户三', projectName: '同一项目', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'project-b', projectId: 'NEW-2', customerName: '客户三', projectName: '同一 项目', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'collision-a', projectId: 'NEW-3', customerName: '客户四', projectName: '撞单项目', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'collision-b', projectId: 'NEW-4', customerName: '客户四', projectName: '撞单项目', salesManager: '销售乙' })
    ];
    const findings = evaluateRulePack(rows, today);
    const labelsFor = (rowKey: string) => findings.filter((item) => item.rowKey === rowKey).map((item) => item.label);

    expect(labelsFor('record-a')).toContain('重复记录待核实');
    expect(labelsFor('record-a')).not.toEqual(expect.arrayContaining(['疑似重复立项', '疑似撞单待核验']));
    expect(labelsFor('project-a')).toContain('疑似重复立项');
    expect(labelsFor('project-a')).not.toEqual(expect.arrayContaining(['重复记录待核实', '疑似撞单待核验']));
    expect(labelsFor('collision-a')).toContain('疑似撞单待核验');
    expect(labelsFor('collision-a')).not.toEqual(expect.arrayContaining(['重复记录待核实', '疑似重复立项']));
  });

  it('evaluates duplicate creation and cross-seller collision within the same mixed group', () => {
    const rows = [
      makeProject({ sourceKey: 'mixed-a', projectId: 'A', customerName: '混合客户', projectName: '同名项目', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'mixed-b', projectId: 'B', customerName: '混合客户', projectName: '同名项目', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'mixed-c', projectId: 'C', customerName: '混合客户', projectName: '同名项目', salesManager: '销售乙' })
    ];
    const findings = evaluateRulePack(rows, today);
    const rowKeysFor = (ruleId: string) => findings.filter((item) => item.ruleId === ruleId).map((item) => item.rowKey).sort();

    expect(rowKeysFor('duplicate-project')).toEqual(['mixed-a', 'mixed-b']);
    expect(rowKeysFor('cross-seller-collision')).toEqual(['mixed-a', 'mixed-b', 'mixed-c']);
  });

  it('does not infer duplicate creation or collision from records sharing one project code', () => {
    const rows = [
      makeProject({ sourceKey: 'same-a', projectId: 'SAME', customerName: '同一客户', projectName: '同一项目', salesManager: '销售甲' }),
      makeProject({ sourceKey: 'same-b', projectId: 'SAME', customerName: '同一客户', projectName: '同一项目', salesManager: '销售乙' })
    ];
    const findings = evaluateRulePack(rows, today);

    expect(findings.filter((item) => item.ruleId === 'duplicate-record').map((item) => item.rowKey).sort()).toEqual(['same-a', 'same-b']);
    expect(findings.some((item) => item.ruleId === 'duplicate-project' || item.ruleId === 'cross-seller-collision')).toBe(false);
  });

  it('normalizes spacing but keeps phase, lot, and year differences distinct', () => {
    expect(normalizeProjectName('医院 数字化-改造')).toBe(normalizeProjectName('医院数字化改造'));
    expect(normalizeProjectName('ＡＢＣ项目')).toBe(normalizeProjectName('abc项目'));
    expect(distinctProjectMarkers('医院改造一期', '医院改造二期')).toBe(true);
    expect(distinctProjectMarkers('园区A包', '园区B包')).toBe(true);
    expect(distinctProjectMarkers('年度项目2025', '年度项目2026')).toBe(true);
  });

  it('only creates an informational candidate for conservative similar names', () => {
    const rows = [
      makeProject({ sourceKey: 'similar-a', projectId: 'S-1', projectName: '华城医院数字化改造项目' }),
      makeProject({ sourceKey: 'similar-b', projectId: 'S-2', projectName: '华城医院数字化改造工程' })
    ];
    const findings = evaluateRulePack(rows, today).filter((item) => item.rowKey.startsWith('similar'));
    expect(findings.map((item) => item.label)).toContain('名称相似待核验');
    expect(findings.find((item) => item.label === '名称相似待核验')?.level).toBe('info');
    expect(findings.find((item) => item.label === '名称相似待核验')?.category).toBe('疑似重复与撞单');
    expect(findings.map((item) => item.label)).not.toContain('疑似撞单待核验');
  });

  it('treats low probability and long cycles as observations rather than standalone risks', () => {
    const rows = [
      makeProject({ sourceKey: 'low', projectId: 'LOW', projectName: '询价项目', probabilityBand: '询价类', amount: 100 }),
      makeProject({ sourceKey: 'long', projectId: 'LONG', projectName: '长周期项目', createdAt: '2026-01-21', amount: 100 }),
      makeProject({ sourceKey: 'term', projectId: 'TERM', projectName: '长期项目', createdAt: '2025-07-20', amount: 100 })
    ];
    const findings = evaluateRulePack(rows, today);
    expect(findings.find((item) => item.rowKey === 'low' && item.category === '经营结构分析')?.label).toBe('询价及低概率项目');
    expect(findings.find((item) => item.rowKey === 'long' && item.category === '经营结构分析')?.label).toBe('长周期项目');
    expect(findings.find((item) => item.rowKey === 'term' && item.category === '经营结构分析')?.label).toBe('长期储备项目');
    expect(findings.filter((item) => ['low', 'long', 'term'].includes(item.rowKey)).every((item) => item.level === 'info')).toBe(true);
  });

  it.each([
    ['2026-01-22', null],
    ['2026-01-21', '长周期项目'],
    ['2025-07-21', '长周期项目'],
    ['2025-07-20', '长期储备项目']
  ])('classifies reserve cycle from %s', (createdAt, label) => {
    const finding = evaluateRulePack([makeProject({ createdAt })], today)
      .find((item) => item.ruleId === 'reserve-cycle');
    expect(finding?.label ?? null).toBe(label);
  });

  it('ignores invalid dates instead of triggering date rules', () => {
    const findings = evaluateRulePack([
      makeProject({ createdAt: 'not-a-date', lastFollowUpAt: 'also-invalid', expectedSignAt: 'bad' })
    ], today);
    expect(findings.some((item) => item.ruleId.startsWith('date-') || item.ruleId === 'follow-up-overdue' || item.ruleId === 'signing-overdue')).toBe(false);
  });

  it('reports unavailable rules and their missing mapped fields', () => {
    const capabilities = getRuleCapabilities(new Set(['projectName', 'status', 'createdAt']));
    expect(capabilities.find((item) => item.ruleId === 'signing-overdue')).toEqual(expect.objectContaining({
      available: false,
      missingFields: ['expectedSignAt']
    }));
  });

  it('does not execute rules whose required source columns are unavailable', () => {
    const findings = evaluateRulePack(
      [makeProject({ amount: null, expectedSignAt: '2026-07-01' })],
      today,
      { mappedFields: new Set(['projectName', 'status']) }
    );
    expect(findings).toEqual([]);
  });

  it('treats a confirmed fixed amount unit as an available capability', () => {
    const capabilities = getRuleCapabilities(new Set(['amount', 'unit']));
    expect(capabilities.find((item) => item.ruleId === 'amount-tier')?.available).toBe(true);
  });

  it('does not treat an expected signing date on the analysis day as overdue', () => {
    const findings = evaluateRulePack([
      makeProject({ expectedSignAt: '2026-07-21' })
    ], new Date('2026-07-21T16:30:00+08:00'));
    expect(findings.map((item) => item.label)).not.toContain('签约日期超期未更新');
  });

  it('classifies duplicate records as data quality findings', () => {
    const findings = evaluateRulePack([
      makeProject({ sourceKey: 'a', projectId: 'SAME', customerName: '客户甲', projectName: '项目甲' }),
      makeProject({ sourceKey: 'b', projectId: 'SAME', customerName: '客户乙', projectName: '项目乙' })
    ], today).filter((item) => item.label === '重复记录待核实');
    expect(findings.every((item) => item.category === '数据质量待复核')).toBe(true);
  });
});
