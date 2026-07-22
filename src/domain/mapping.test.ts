import { describe, expect, it } from 'vitest';
import { amountInWan } from './project';
import { evaluateRulePack } from './rules';
import {
  applyMappings,
  emptyValueMappings,
  parseProbability,
  suggestMappings,
  validateMappings,
  type ColumnMapping
} from './mapping';

describe('field mappings', () => {
  it.each([
    [0.1, '10%'],
    [0.9, '90%'],
    [10, '10%'],
    ['70%', '70%'],
    ['询价类', '询价类'],
    [0, '0%']
  ])('parses %p as an exact probability', (source, expected) => {
    expect(parseProbability(source)).toBe(expected);
  });

  it('keeps ambiguous or invalid probabilities unresolved', () => {
    expect(parseProbability(1)).toBe('未知');
    expect(parseProbability(101)).toBe('未知');
    expect(parseProbability(-1)).toBe('未知');
    expect(parseProbability('无法判断')).toBe('未知');
  });

  it('preserves a non-empty unparseable amount for rule-level format review', () => {
    const rows = applyMappings(
      [{ 项目名称: '医院数改', 储备金额: '待确认' }],
      [
        { sourceHeader: '项目名称', mode: 'standard', targetField: 'projectName' },
        { sourceHeader: '储备金额', mode: 'standard', targetField: 'amount' }
      ],
      { ...emptyValueMappings, amountUnit: '万元' },
      '商机表'
    );
    expect(rows[0]).toMatchObject({ amount: null, amountParseError: true });
    expect(evaluateRulePack(rows, new Date(2026, 6, 21, 12)).map((item) => item.label)).toContain('金额格式异常');
    expect(evaluateRulePack(rows, new Date(2026, 6, 21, 12)).map((item) => item.label)).not.toContain('储备金额待补充');
  });

  it('preserves non-empty unparseable dates for rule-level format review', () => {
    const rows = applyMappings(
      [{ 创建日期: '待确认', 最近跟进日期: '错误日期', 预计签约日期: '下个月' }],
      [
        { sourceHeader: '创建日期', mode: 'standard', targetField: 'createdAt' },
        { sourceHeader: '最近跟进日期', mode: 'standard', targetField: 'lastFollowUpAt' },
        { sourceHeader: '预计签约日期', mode: 'standard', targetField: 'expectedSignAt' }
      ],
      emptyValueMappings,
      '商机表'
    );
    expect(rows[0]).toMatchObject({
      createdAt: null,
      createdAtParseError: true,
      lastFollowUpAt: null,
      lastFollowUpAtParseError: true,
      expectedSignAt: null,
      expectedSignAtParseError: true
    });
    expect(evaluateRulePack(rows, new Date(2026, 6, 21, 12)).filter((item) => item.label === '日期格式异常')).toHaveLength(3);
  });
  it('suggests canonical fields from local aliases without an API call', () => {
    expect(suggestMappings(['商机名称', '业务负责人', '客户', '最后联系时间']))
      .toMatchObject([
        { sourceHeader: '商机名称', mode: 'standard', targetField: 'projectName' },
        { sourceHeader: '业务负责人', mode: 'standard', targetField: 'salesManager' },
        { sourceHeader: '客户', mode: 'standard', targetField: 'customerName' },
        { sourceHeader: '最后联系时间', mode: 'standard', targetField: 'lastFollowUpAt' }
      ]);
  });

  it('normalizes full-width characters and punctuation before matching aliases', () => {
    expect(suggestMappings([' ＰＲＯＪＥＣＴ－ＮＡＭＥ ', '客户／单位']))
      .toMatchObject([
        { mode: 'standard', targetField: 'projectName' },
        { mode: 'standard', targetField: 'customerName' }
      ]);
  });

  it('keeps custom fields and ignores unwanted columns', () => {
    const rows = applyMappings(
      [{ 商机名称: '医院数改', 来源渠道: '展会', 内部备注: '不导入' }],
      [
        { sourceHeader: '商机名称', mode: 'standard', targetField: 'projectName' },
        { sourceHeader: '来源渠道', mode: 'custom', customName: '项目来源渠道' },
        { sourceHeader: '内部备注', mode: 'ignore' }
      ],
      emptyValueMappings,
      '商机明细'
    );

    expect(rows[0].projectName).toBe('医院数改');
    expect(rows[0].customFields).toEqual({ 项目来源渠道: '展会' });
  });

  it('defaults unknown source columns to named custom fields', () => {
    expect(suggestMappings(['未见过的企业字段'])).toEqual([
      { sourceHeader: '未见过的企业字段', mode: 'custom', customName: '未见过的企业字段' }
    ]);
  });

  it('rejects two source columns mapped to the same standard field', () => {
    const validation = validateMappings([
      { sourceHeader: '商机名称', mode: 'standard', targetField: 'projectName' },
      { sourceHeader: '项目标题', mode: 'standard', targetField: 'projectName' }
    ], emptyValueMappings);

    expect(validation).toMatchObject({ valid: false, duplicateTargets: ['projectName'] });
  });

  it('rejects custom field names that collide after trimming', () => {
    const validation = validateMappings([
      { sourceHeader: '来源渠道', mode: 'custom', customName: '项目来源' },
      { sourceHeader: '获客方式', mode: 'custom', customName: ' 项目来源 ' }
    ], emptyValueMappings);

    expect(validation).toMatchObject({
      valid: false,
      duplicateCustomNames: ['项目来源']
    });
  });

  it('normalizes mapped dates, amounts, statuses, probabilities, and import units', () => {
    const rows = applyMappings(
      [{ 编号: 'A-1', 金额: '1,200', 创建: '2026/01/02', 状态: '推进中', 概率: '51%-70%' }],
      [
        { sourceHeader: '编号', mode: 'standard', targetField: 'projectId' },
        { sourceHeader: '金额', mode: 'standard', targetField: 'amount' },
        { sourceHeader: '创建', mode: 'standard', targetField: 'createdAt' },
        { sourceHeader: '状态', mode: 'standard', targetField: 'status' },
        { sourceHeader: '概率', mode: 'standard', targetField: 'probabilityBand' }
      ],
      {
        statuses: { 推进中: '跟进中' },
        probabilities: { '51%-70%': '60%' },
        amountUnit: '万元'
      },
      '商机明细'
    );

    expect(rows[0]).toMatchObject({
      projectId: 'A-1', amount: 1200, unit: '万元', createdAt: '2026-01-02',
      status: '跟进中', probabilityBand: '60%'
    });
  });

  it('strictly rejects impossible calendar dates', () => {
    const rows = applyMappings(
      [{ 项目: '医院数改', 创建: '2026-02-30' }],
      [
        { sourceHeader: '项目', mode: 'standard', targetField: 'projectName' },
        { sourceHeader: '创建', mode: 'standard', targetField: 'createdAt' }
      ],
      emptyValueMappings,
      '商机明细'
    );

    expect(rows[0].createdAt).toBeNull();
  });

  it('does not silently treat an unknown amount unit as ten-thousand yuan', () => {
    const mappings: ColumnMapping[] = [
      { sourceHeader: '金额', mode: 'standard', targetField: 'amount' }
    ];

    expect(validateMappings(mappings, emptyValueMappings)).toMatchObject({
      valid: false,
      unmappedEnumValues: ['金额单位']
    });
    const [row] = applyMappings([{ 金额: 1200 }], mappings, emptyValueMappings, '商机明细');
    expect(row.unit).toBe('');
    expect(amountInWan(row)).toBeNull();
  });

  it('applies a confirmed unit to non-empty source unit cells without filling blanks', () => {
    const rows = applyMappings(
      [{ 金额: 1200, 单位: '千元' }, { 金额: 300, 单位: '' }],
      [
        { sourceHeader: '金额', mode: 'standard', targetField: 'amount' },
        { sourceHeader: '单位', mode: 'standard', targetField: 'unit' }
      ],
      { statuses: {}, probabilities: {}, amountUnit: '万元' },
      '商机明细'
    );

    expect(rows.map((row) => row.unit)).toEqual(['万元', '']);
  });

  it('keeps a unique project ID stable when row order changes or the file is imported again', () => {
    const mappings: ColumnMapping[] = [
      { sourceHeader: '编号', mode: 'standard', targetField: 'projectId' },
      { sourceHeader: '项目', mode: 'standard', targetField: 'projectName' }
    ];
    const first = applyMappings([{ 编号: ' A-1 ', 项目: '医院数改' }, { 编号: 'B-2', 项目: '园区项目' }], mappings, emptyValueMappings, '商机明细');
    const reordered = applyMappings([{ 编号: 'B-2', 项目: '园区项目' }, { 编号: 'A-1', 项目: '医院数改' }], mappings, emptyValueMappings, '商机明细');

    expect(first[0].sourceKey).toBe(reordered[1].sourceKey);
  });

  it('isolates missing and duplicate project IDs by source row', () => {
    const mappings: ColumnMapping[] = [
      { sourceHeader: '编号', mode: 'standard', targetField: 'projectId' },
      { sourceHeader: '项目', mode: 'standard', targetField: 'projectName' }
    ];
    const rows = applyMappings([
      { 编号: '', 项目: '无编号一' },
      { 编号: '', 项目: '无编号二' },
      { 编号: 'DUP-1', 项目: '重复一' },
      { 编号: 'DUP-1', 项目: '重复二' }
    ], mappings, emptyValueMappings, '商机明细', '客户甲CRM账套');

    expect(new Set(rows.map((row) => row.sourceKey)).size).toBe(4);
    expect(rows[0].sourceKey).not.toBe(rows[1].sourceKey);
    expect(rows[2].sourceKey).not.toBe(rows[3].sourceKey);
  });

  it('uses the sheet name as a source-key namespace', () => {
    const mappings: ColumnMapping[] = [{ sourceHeader: '编号', mode: 'standard', targetField: 'projectId' }];
    const east = applyMappings([{ 编号: 'A-1' }], mappings, emptyValueMappings, '华东商机');
    const west = applyMappings([{ 编号: 'A-1' }], mappings, emptyValueMappings, '华西商机');

    expect(east[0].sourceKey).toMatch(/^sheet:/);
    expect(east[0].sourceKey).not.toBe(west[0].sourceKey);
  });

  it('does not collapse spaces or punctuation that distinguish valid sheet names', () => {
    const mappings: ColumnMapping[] = [{ sourceHeader: '编号', mode: 'standard', targetField: 'projectId' }];
    const spaced = applyMappings([{ 编号: 'A-1' }], mappings, emptyValueMappings, '华东 商机');
    const hyphenated = applyMappings([{ 编号: 'A-1' }], mappings, emptyValueMappings, '华东-商机');

    expect(spaced[0].sourceKey).not.toBe(hyphenated[0].sourceKey);
  });

  it('isolates confirmed data sources while keeping the same source stable across row moves', () => {
    const mappings: ColumnMapping[] = [{ sourceHeader: '编号', mode: 'standard', targetField: 'projectId' }];
    const first = applyMappings([{ 编号: 'A-1' }, { 编号: 'B-2' }], mappings, emptyValueMappings, '商机明细', '客户甲 CRM账套');
    const repeated = applyMappings([{ 编号: 'B-2' }, { 编号: 'A-1' }], mappings, emptyValueMappings, '商机明细', '客户甲 CRM账套');
    const second = applyMappings([{ 编号: 'A-1' }], mappings, emptyValueMappings, '商机明细', '客户乙-CRM账套');

    expect(first[0].sourceKey).toBe(repeated[1].sourceKey);
    expect(first[0].sourceKey).not.toBe(second[0].sourceKey);
    expect(first[0].sourceKey).toContain(encodeURIComponent('客户甲 CRM账套'));
    expect(first[0].sourceKey).toContain(encodeURIComponent('商机明细'));
  });

  it('keeps blank and negative probability values unknown', () => {
    const mappings: ColumnMapping[] = [
      { sourceHeader: '概率', mode: 'standard', targetField: 'probabilityBand' }
    ];
    const rows = applyMappings(
      [{ 概率: '' }, { 概率: '   ' }, { 概率: -1 }],
      mappings,
      emptyValueMappings,
      '商机明细'
    );

    expect(rows.map((row) => row.probabilityBand)).toEqual(['未知', '未知', '未知']);
  });
});
