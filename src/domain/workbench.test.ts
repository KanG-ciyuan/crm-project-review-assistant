import { describe, expect, it } from 'vitest';
import { buildAnalysis } from './analysis';
import type { Finding } from './rules';
import { buildProjectWorkbenchRows, findingKind, manualReviewKeys } from './workbench';
import { makeProject } from '../test/fixtures';

function makeFinding(ruleId: string, rowKey = 'row-1', level: Finding['level'] = 'info'): Finding {
  return {
    ruleId,
    rowKey,
    projectId: 'CRM-001',
    projectName: '华城医院数字化改造',
    customerName: '华城医院',
    department: '华东一部',
    salesManager: '销售甲',
    amountWan: 1200,
    category: '数据质量待复核',
    label: ruleId,
    reason: '测试规则',
    level
  };
}

describe('workbench finding classification', () => {
  it('classifies manual, observation, and all remaining findings independently of legacy level', () => {
    const manualRuleIds = [
      'duplicate-record',
      'duplicate-project',
      'cross-seller-collision',
      'similar-name',
      'amount-placeholder'
    ];
    const observationRuleIds = [
      'amount-tier',
      'amount-tier-large',
      'amount-tier-future',
      'probability-observation',
      'reserve-cycle'
    ];

    expect(manualRuleIds.map((ruleId) => findingKind(makeFinding(ruleId)))).toEqual(manualRuleIds.map(() => 'manual'));
    expect(observationRuleIds.map((ruleId) => findingKind(makeFinding(ruleId, 'row-1', 'action')))).toEqual(observationRuleIds.map(() => 'observation'));
    expect(findingKind(makeFinding('follow-up-overdue', 'row-1', 'review'))).toBe('fact');
    expect(findingKind(makeFinding('signing-overdue', 'row-1', 'action'))).toBe('fact');
  });

  it('returns unique manual row keys in first-seen order', () => {
    const findings = [
      makeFinding('duplicate-record', 'row-b'),
      makeFinding('follow-up-overdue', 'row-fact', 'action'),
      makeFinding('similar-name', 'row-a'),
      makeFinding('amount-placeholder', 'row-b'),
      makeFinding('reserve-cycle', 'row-observation')
    ];

    expect(manualReviewKeys(findings)).toEqual(['row-b', 'row-a']);
  });
});

describe('project workbench rows', () => {
  it('keeps every source row, does not merge same-name projects, and partitions findings by row key', () => {
    const first = makeProject({ sourceKey: 'source-a', projectId: 'CRM-002', projectName: '同名项目' });
    const second = makeProject({ sourceKey: 'source-b', projectId: 'CRM-001', projectName: '同名项目' });
    const findings = [
      makeFinding('follow-up-overdue', 'source-a', 'action'),
      makeFinding('duplicate-record', 'source-a', 'review'),
      makeFinding('amount-tier-large', 'source-a', 'info'),
      makeFinding('follow-up-overdue', 'not-in-analysis', 'action')
    ];

    const rows = buildProjectWorkbenchRows(buildAnalysis([first, second], findings, new Date(2026, 6, 21, 12)));
    const byKey = new Map(rows.map((row) => [row.rowKey, row]));

    expect(rows).toHaveLength(2);
    expect(byKey.get('source-a')?.project).toBe(first);
    expect(byKey.get('source-b')?.project).toBe(second);
    expect(byKey.get('source-a')?.findings).toEqual(findings.slice(0, 3));
    expect(byKey.get('source-a')?.factFindings.map((finding) => finding.ruleId)).toEqual(['follow-up-overdue']);
    expect(byKey.get('source-a')?.manualFindings.map((finding) => finding.ruleId)).toEqual(['duplicate-record']);
    expect(byKey.get('source-a')?.observationFindings.map((finding) => finding.ruleId)).toEqual(['amount-tier-large']);
    expect(byKey.get('source-b')?.findings).toEqual([]);
  });

  it('links the other source projects in a relation group once using the current finding label', () => {
    const first = makeProject({
      sourceKey: 'source-a', projectId: 'CRM-A', projectName: '项目甲', customerName: '客户甲', salesManager: '销售甲'
    });
    const second = makeProject({
      sourceKey: 'source-b', projectId: 'CRM-B', projectName: '项目乙', customerName: '客户乙', salesManager: '销售乙'
    });
    const third = makeProject({
      sourceKey: 'source-c', projectId: 'CRM-C', projectName: '项目丙', customerName: '客户丙', salesManager: '销售丙'
    });
    const relationKey = 'shared-relation';
    const findings: Finding[] = [
      { ...makeFinding('similar-name', 'source-a'), relationKey, label: '甲行关系' },
      { ...makeFinding('similar-name', 'source-a'), relationKey, label: '重复的甲行关系' },
      { ...makeFinding('similar-name', 'source-b'), relationKey, label: '乙行关系' },
      { ...makeFinding('similar-name', 'source-c'), relationKey, label: '丙行关系' }
    ];

    const rows = buildProjectWorkbenchRows(buildAnalysis([first, second, third], findings, new Date(2026, 6, 21, 12)));
    const byKey = new Map(rows.map((row) => [row.rowKey, row]));

    expect(byKey.get('source-a')?.relatedProjects).toEqual([
      {
        rowKey: 'source-b', projectId: 'CRM-B', projectName: '项目乙', customerName: '客户乙',
        salesManager: '销售乙', relationKey, ruleId: 'similar-name', relationLabel: '甲行关系'
      },
      {
        rowKey: 'source-c', projectId: 'CRM-C', projectName: '项目丙', customerName: '客户丙',
        salesManager: '销售丙', relationKey, ruleId: 'similar-name', relationLabel: '甲行关系'
      }
    ]);
    expect(byKey.get('source-b')?.relatedProjects.map((project) => project.rowKey)).toEqual(['source-a', 'source-c']);
  });

  it('keeps distinct relation groups and rules for the same project pair independent of finding order', () => {
    const first = makeProject({ sourceKey: 'source-a', projectId: 'CRM-A', projectName: '项目甲' });
    const second = makeProject({ sourceKey: 'source-b', projectId: 'CRM-B', projectName: '项目乙' });
    const findings: Finding[] = [
      { ...makeFinding('duplicate-record', 'source-a'), relationKey: 'duplicate-group', label: '重复记录待核实' },
      { ...makeFinding('duplicate-record', 'source-a'), relationKey: 'duplicate-group', label: '重复记录待核实' },
      { ...makeFinding('duplicate-record', 'source-b'), relationKey: 'duplicate-group', label: '重复记录待核实' },
      { ...makeFinding('similar-name', 'source-a'), relationKey: 'similar-group', label: '名称相似待核验' },
      { ...makeFinding('similar-name', 'source-b'), relationKey: 'similar-group', label: '名称相似待核验' }
    ];
    const today = new Date(2026, 6, 21, 12);
    const relatedForA = (orderedFindings: Finding[]) => buildProjectWorkbenchRows(
      buildAnalysis([first, second], orderedFindings, today)
    ).find((row) => row.rowKey === 'source-a')?.relatedProjects;

    const expected = [
      {
        rowKey: 'source-b', projectId: 'CRM-B', projectName: '项目乙', customerName: second.customerName,
        salesManager: second.salesManager, relationKey: 'duplicate-group', ruleId: 'duplicate-record',
        relationLabel: '重复记录待核实'
      },
      {
        rowKey: 'source-b', projectId: 'CRM-B', projectName: '项目乙', customerName: second.customerName,
        salesManager: second.salesManager, relationKey: 'similar-group', ruleId: 'similar-name',
        relationLabel: '名称相似待核验'
      }
    ];

    expect(relatedForA(findings)).toEqual(expected);
    expect(relatedForA([...findings].reverse())).toEqual(expected);
  });

  it('derives overdue days from the generated local calendar date only for matching rules and valid past dates', () => {
    const overdue = makeProject({
      sourceKey: 'overdue', projectId: 'OVERDUE', lastFollowUpAt: '2026-07-01', expectedSignAt: '2026-07-20'
    });
    const noRules = makeProject({
      sourceKey: 'no-rules', projectId: 'NO-RULES', lastFollowUpAt: '2026-01-01', expectedSignAt: '2026-01-01'
    });
    const invalid = makeProject({
      sourceKey: 'invalid', projectId: 'INVALID', lastFollowUpAt: '2026-02-30', expectedSignAt: '2026-07-22'
    });
    const analysis = buildAnalysis([overdue, noRules, invalid], [
      makeFinding('follow-up-overdue', 'overdue', 'action'),
      makeFinding('signing-overdue', 'overdue', 'action'),
      makeFinding('follow-up-overdue', 'invalid', 'action'),
      makeFinding('signing-overdue', 'invalid', 'action')
    ], new Date(2026, 6, 21, 12));
    analysis.generatedAt = '2026-07-21T23:30:00+08:00';

    const byKey = new Map(buildProjectWorkbenchRows(analysis).map((row) => [row.rowKey, row]));

    expect(byKey.get('overdue')?.followUpOverdueDays).toBe(20);
    expect(byKey.get('overdue')?.signingOverdueDays).toBe(1);
    expect(byKey.get('no-rules')?.followUpOverdueDays).toBeNull();
    expect(byKey.get('no-rules')?.signingOverdueDays).toBeNull();
    expect(byKey.get('invalid')?.followUpOverdueDays).toBeNull();
    expect(byKey.get('invalid')?.signingOverdueDays).toBeNull();
  });

  it('sorts by finding priority, then project id in zh-CN, then row key', () => {
    const rows = [
      makeProject({ sourceKey: 'manual', projectId: 'Z' }),
      makeProject({ sourceKey: 'fact-z', projectId: 'B' }),
      makeProject({ sourceKey: 'fact-c', projectId: 'A' }),
      makeProject({ sourceKey: 'fact-b', projectId: 'A' }),
      makeProject({ sourceKey: 'observation', projectId: 'A' }),
      makeProject({ sourceKey: 'none', projectId: 'A' })
    ];
    const findings = [
      makeFinding('similar-name', 'manual', 'info'),
      makeFinding('follow-up-overdue', 'fact-z', 'review'),
      makeFinding('field-completeness', 'fact-c', 'action'),
      makeFinding('signing-overdue', 'fact-b', 'info'),
      makeFinding('amount-tier-extreme', 'observation', 'action')
    ];

    const workbenchRows = buildProjectWorkbenchRows(buildAnalysis(rows, findings, new Date(2026, 6, 21, 12)));

    expect(workbenchRows.map((row) => [row.rowKey, row.priority])).toEqual([
      ['manual', 0],
      ['fact-b', 1],
      ['fact-c', 1],
      ['fact-z', 1],
      ['observation', 2],
      ['none', 3]
    ]);
  });

  it('keeps and stably sorts all 400 source rows', () => {
    const rows = Array.from({ length: 400 }, (_, index) => makeProject({
      sourceKey: `source-${String(index).padStart(3, '0')}`,
      projectId: `CRM-${String(399 - index).padStart(3, '0')}`,
      projectName: index % 2 === 0 ? '重复名称甲' : '重复名称乙'
    }));
    const today = new Date(2026, 6, 21, 12);

    const forward = buildProjectWorkbenchRows(buildAnalysis(rows, [], today));
    const reversed = buildProjectWorkbenchRows(buildAnalysis([...rows].reverse(), [], today));

    expect(forward).toHaveLength(400);
    expect(new Set(forward.map((row) => row.rowKey))).toHaveLength(400);
    expect(reversed.map((row) => row.rowKey)).toEqual(forward.map((row) => row.rowKey));
  });
});
