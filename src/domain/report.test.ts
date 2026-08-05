import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import { buildAnalysis } from './analysis';
import { createReviewReport, createReviewSummary, formatLocalDate, type ReviewSummaryData } from './report';
import type { ProjectRow } from './project';
import type { ReviewRecordMap, ReviewStatus } from './review';
import type { Finding, FindingCategory } from './rules';

const reportDate = new Date(2026, 6, 16, 12);

function finding(
  project: ProjectRow,
  ruleId: string,
  level: Finding['level'] = 'review',
  label = '名称相似待核验',
  reason = '项目名称相似，需要核验是否重复立项',
  category: FindingCategory = '疑似重复与撞单'
): Finding {
  return {
    ruleId,
    rowKey: project.sourceKey,
    projectId: project.projectId,
    projectName: project.projectName,
    customerName: project.customerName,
    department: project.department,
    salesManager: project.salesManager,
    amountWan: project.amount,
    category,
    label,
    reason,
    level
  };
}

function review(project: ProjectRow, status: ReviewStatus, note = ''): ReviewRecordMap[string] {
  return {
    projectId: project.projectId,
    projectName: project.projectName,
    status,
    note,
    firstReviewedAt: '2026-07-17T09:00:00.000Z',
    lastReviewedAt: '2026-07-17T09:00:00.000Z',
    fingerprint: project.sourceKey,
    dataUpdated: false,
    history: []
  };
}

describe('createReviewSummary', () => {
  it('returns every required field in the public management summary model', () => {
    const summary: ReviewSummaryData = createReviewSummary(buildAnalysis([], [], reportDate), {});
    const requiredManagementFields = [
      summary.executiveConclusions.length,
      summary.decisionItems.length,
      summary.priorityProjects.length,
      summary.departmentActions.length,
      summary.appendix.projectCount
    ];

    expect(requiredManagementFields).toEqual([4, 0, 0, 0, 0]);
    expect(summary).toEqual(expect.objectContaining({
      executiveConclusions: expect.any(Array),
      decisionItems: expect.any(Array),
      priorityProjects: expect.any(Array),
      departmentActions: expect.any(Array),
      appendix: expect.any(Object)
    }));
  });

  it('builds concrete management decisions while preserving the business-review boundary', () => {
    const risk = makeProject({ sourceKey: 'risk', projectId: 'RISK', projectName: '重点风险项目', amount: 6000, department: '华东部' });
    const pending = makeProject({ sourceKey: 'pending', projectId: 'PENDING', projectName: '原因待确认项目', amount: 9000, department: '华南部' });
    const objective = makeProject({ sourceKey: 'objective', projectId: 'OBJECTIVE', projectName: '跟进超期项目', amount: 8000, department: '华东部' });
    const dataError = makeProject({ sourceKey: 'data-error', projectId: 'DATA', projectName: '源数据错误项目', amount: 7000, department: '华北部' });
    const ignored = makeProject({ sourceKey: 'ignored', projectId: 'IGNORED', projectName: '已忽略项目', amount: 10000, department: '华东部' });
    const findings = [
      finding(risk, 'similar-name'),
      finding(pending, 'similar-name'),
      finding(objective, 'follow-up-overdue', 'action', '跟进超期', '最近跟进已超过 30 天', '维护超期待整改'),
      finding(dataError, 'amount-placeholder'),
      finding(dataError, 'field-completeness', 'review', '字段待补充', '缺少金额单位', '数据质量待复核'),
      finding(ignored, 'similar-name')
    ];
    const reviews: ReviewRecordMap = {
      risk: review(risk, '确认业务风险', '客户预算冻结，暂不具备签约条件。'),
      pending: review(pending, '待复核', '模型猜测：客户不感兴趣'),
      'data-error': review(dataError, '确认数据错误', '金额单位录入错误。'),
      ignored: review(ignored, '已忽略', '同一项目的正常分期。')
    };

    const summary = createReviewSummary(
      buildAnalysis([risk, pending, objective, dataError, ignored], findings, reportDate),
      reviews,
      ['部门：华东部']
    );

    expect(summary.meta.title).toBe('储备项目经营复盘报告');
    expect(summary.scope).toEqual(['部门：华东部']);
    expect(summary.executiveConclusions).toHaveLength(4);
    expect(summary.executiveConclusions.join('\n')).toMatch(/5 个项目[\s\S]*40,000 万元/);
    expect(summary.decisionItems.map((item) => item.projectId)).toEqual(['RISK', 'PENDING']);
    expect(summary.decisionItems[0]).toMatchObject({
      reviewStatus: '确认业务风险',
      reviewConclusion: '客户预算冻结，暂不具备签约条件。',
      suggestedAction: '管理层确认继续推进、调整阶段或暂停。'
    });
    expect(summary.decisionItems[1]).toMatchObject({
      reviewStatus: '待复核',
      reviewConclusion: '待业务确认',
      suggestedAction: '由责任团队确认真实原因并补充复核结论。'
    });
    expect(summary.decisionItems[1].reviewConclusion).not.toContain('模型猜测');
    expect(summary.priorityProjects.map((item) => item.projectId)).toEqual(['RISK', 'PENDING', 'OBJECTIVE', 'DATA']);
    expect(summary.priorityProjects.find((item) => item.projectId === 'DATA')?.suggestedAction)
      .toBe('修正 CRM 源数据后重新导入验证。');
    expect(summary.priorityProjects.map((item) => item.projectId)).not.toContain('IGNORED');
    expect(summary.departmentActions).toContainEqual(expect.objectContaining({
      department: '华东部', projectCount: 2, amountWan: 14000, reviewedCount: 1, pendingCount: 0
    }));
    expect(summary.departmentActions.every((item) => !item.suggestedAction.match(/责任人|截止|完成时间/))).toBe(true);
    expect(summary.overallConclusions).toBe(summary.executiveConclusions);
    expect(summary.ruleDistribution.categories).toBe(summary.appendix.categories);
    expect(summary.priorityIssues).toContainEqual({ label: '跟进超期', projectCount: 1 });
    expect(summary.focusScopes).toContainEqual({ type: '部门', name: '华东部', projectCount: 3 });
    expect(summary.focusScopes[0]).toEqual({ type: '负责人', name: '销售甲', projectCount: 5 });
    expect(summary.actions).toHaveLength(3);
  });

  it('orders decisions by status, amount with null last, and stable project identity', () => {
    const rows = [
      makeProject({ sourceKey: 'risk-null', projectId: '', projectName: '', amount: null, status: '未知', department: '', salesManager: '' }),
      makeProject({ sourceKey: 'pending-high', projectId: 'P-9', amount: 9999 }),
      makeProject({ sourceKey: 'risk-b', projectId: 'B', amount: 500 }),
      makeProject({ sourceKey: 'risk-a', projectId: 'A', amount: 500 })
    ];
    const reviews = Object.fromEntries(rows.map((project, index) => [
      project.sourceKey,
      review(project, index === 1 ? '待复核' : '确认业务风险', index === 1 ? '' : '业务已确认')
    ]));
    const summary = createReviewSummary(
      buildAnalysis(rows, rows.map((project) => finding(project, 'similar-name')), reportDate),
      reviews
    );

    expect(summary.decisionItems.map((item) => item.projectId)).toEqual(['A', 'B', '项目编号未填写', 'P-9']);
    expect(summary.decisionItems[2]).toMatchObject({
      projectName: '项目名称未填写', amountWan: null, stage: '项目阶段未填写',
      department: '部门未填写', salesManager: '负责人未填写'
    });
  });

  it('caps priority projects at ten and puts remaining eligible projects in the appendix', () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeProject({
      sourceKey: `fact-${index + 1}`,
      projectId: `P-${String(index + 1).padStart(2, '0')}`,
      amount: 1200 - index
    }));
    const summary = createReviewSummary(buildAnalysis(rows, rows.map((project) => finding(
      project, 'follow-up-overdue', 'action', '跟进超期', '最近跟进已超过 30 天', '维护超期待整改'
    )), reportDate), {});

    expect(summary.priorityProjects).toHaveLength(10);
    expect(summary.appendix.remainingProjects.map((item) => item.projectId)).toEqual(['P-11', 'P-12']);
    expect(new Set([
      ...summary.priorityProjects.map((item) => item.rowKey),
      ...summary.appendix.remainingProjects.map((item) => item.rowKey)
    ]).size).toBe(12);
  });

  it('uses explicit empty values and never invents a cause for objective evidence', () => {
    const project = makeProject({
      sourceKey: 'missing', projectId: '', projectName: '', amount: null,
      status: '未知', department: '', salesManager: ''
    });
    const summary = createReviewSummary(buildAnalysis([project], [finding(
      project, 'follow-up-overdue', 'action', '跟进超期', '最近跟进已超过 30 天', '维护超期待整改'
    )], reportDate), {});

    expect(summary.priorityProjects[0]).toMatchObject({
      projectId: '项目编号未填写', projectName: '项目名称未填写', amountWan: null,
      stage: '项目阶段未填写', department: '部门未填写', salesManager: '负责人未填写',
      reviewStatus: '无需人工复核', reviewConclusion: '无需人工复核',
      suggestedAction: '核实规则证据并更新 CRM。'
    });
    expect(summary.priorityProjects[0].reviewConclusion).not.toContain('客户');
  });

  it('uses the most frequent department rule issue with a stable lexical tie-break', () => {
    const rows = [
      makeProject({ sourceKey: 'frequent-1', projectId: 'F-1', department: '高频部门' }),
      makeProject({ sourceKey: 'frequent-2', projectId: 'F-2', department: '高频部门' }),
      makeProject({ sourceKey: 'other', projectId: 'F-3', department: '高频部门' }),
      makeProject({ sourceKey: 'tie-b', projectId: 'T-1', department: '同频部门' }),
      makeProject({ sourceKey: 'tie-a', projectId: 'T-2', department: '同频部门' })
    ];
    const labels = ['高频问题', '高频问题', '其他问题', 'B问题', 'A问题'];
    const summary = createReviewSummary(buildAnalysis(rows, rows.map((project, index) => finding(
      project, 'follow-up-overdue', 'action', labels[index], `${labels[index]}的客观证据`, '维护超期待整改'
    )), reportDate), {});

    expect(summary.departmentActions.find((item) => item.department === '高频部门')?.mainIssue).toBe('高频问题');
    expect(summary.departmentActions.find((item) => item.department === '同频部门')?.mainIssue).toBe('A问题');
  });

  it('does not let a stale ignored manual review suppress a current fact-only project', () => {
    const project = makeProject({ sourceKey: 'stale-ignore', projectId: 'FACT-1', department: '事实部门' });
    const currentFinding = finding(
      project, 'follow-up-overdue', 'action', '跟进超期', '最近跟进已超过 30 天', '维护超期待整改'
    );
    const summary = createReviewSummary(
      buildAnalysis([project], [currentFinding], reportDate),
      { 'stale-ignore': review(project, '已忽略', '之前忽略的是已消失的人工规则。') }
    );

    expect(summary.priorityProjects.map((item) => item.projectId)).toEqual(['FACT-1']);
    expect(summary.priorityProjects[0].reviewStatus).toBe('无需人工复核');
    expect(summary.departmentActions).toContainEqual(expect.objectContaining({ department: '事实部门', projectCount: 1 }));
  });

  it('keeps normalized raw display text in the summary and escapes only the markdown export', () => {
    const project = makeProject({
      sourceKey: 'raw-display', projectId: 'A&B', projectName: '项目 & 方案',
      department: '华东|重点', salesManager: '销售&A'
    });
    const unsafeFinding = finding(project, 'similar-name', 'review', '问题&A', '证据|B');
    const analysis = buildAnalysis([project], [unsafeFinding], reportDate);
    const reviews = { 'raw-display': review(project, '确认业务风险', '客户&A确认') };
    const summary = createReviewSummary(analysis, reviews, ['部门：华东|重点']);
    const report = createReviewReport(analysis, reviews, reportDate, ['部门：华东|重点']);

    expect(summary.scope).toEqual(['部门：华东|重点']);
    expect(summary.priorityProjects[0]).toMatchObject({
      projectId: 'A&B', projectName: '项目 & 方案', department: '华东|重点',
      salesManager: '销售&A', evidence: ['问题&A：证据|B'], reviewConclusion: '客户&A确认'
    });
    expect(summary.departmentActions[0].mainIssue).toBe('问题&A');
    expect(report).toContain('A&amp;B');
    expect(report).toContain('华东&#124;重点');
    expect(report).not.toContain('&amp;amp;');
  });

  it('keeps legacy focus scopes for departments and managers and provides fallback actions', () => {
    const first = makeProject({ sourceKey: 'legacy-a', department: '华东部', salesManager: '销售甲' });
    const second = makeProject({ sourceKey: 'legacy-b', department: '华东部', salesManager: '销售乙' });
    const populated = createReviewSummary(buildAnalysis([first, second], [
      finding(first, 'follow-up-overdue', 'action', '跟进超期', '证据一', '维护超期待整改'),
      finding(second, 'follow-up-overdue', 'action', '跟进超期', '证据二', '维护超期待整改')
    ], reportDate), {});
    const empty = createReviewSummary(buildAnalysis([], [], reportDate), {});

    expect(populated.focusScopes).toEqual([
      { type: '部门', name: '华东部', projectCount: 2 },
      { type: '负责人', name: '销售甲', projectCount: 1 },
      { type: '负责人', name: '销售乙', projectCount: 1 }
    ]);
    expect(empty.actions).toEqual([
      '持续抽查规则发现，保持数据质量。',
      '对关键字段和日期保持定期校验。',
      '围绕问题项目较集中的部门和负责人，安排下一轮经营跟进。'
    ]);
  });
});

describe('createReviewReport', () => {
  it('serializes the management model with exactly five sections and concrete project details', () => {
    const risk = makeProject({ sourceKey: 'risk', projectId: 'RISK-1', projectName: '重点风险项目', amount: 6000, department: '华东部' });
    const objective = makeProject({ sourceKey: 'objective', projectId: 'ACTION-1', projectName: '跟进超期项目', amount: null, department: '华南部' });
    const analysis = buildAnalysis([risk, objective], [
      finding(risk, 'similar-name'),
      finding(objective, 'follow-up-overdue', 'action', '跟进超期', '最近跟进已超过 30 天', '维护超期待整改')
    ], reportDate);
    const report = createReviewReport(analysis, {
      risk: review(risk, '确认业务风险', '客户预算冻结。')
    }, reportDate, ['阶段：跟进中']);

    expect(report.match(/^## .*$/gm)).toEqual([
      '## 一、本期经营结论',
      '## 二、需要管理层决策的事项',
      '## 三、重点项目处理清单',
      '## 四、部门责任与后续安排',
      '## 五、附录：数据范围与识别规则'
    ]);
    expect(report).toMatch(/^# 储备项目经营复盘报告$/m);
    expect(report).toMatch(/### 决策项目 1：RISK-1 重点风险项目/);
    expect(report).toContain('人工结论：客户预算冻结。');
    expect(report).toContain('| 项目 | 金额 | 当前阶段 | 发现的问题 | 人工复核结论 | 建议动作 | 责任部门 / 负责人 |');
    expect(report).toContain('| ACTION-1 跟进超期项目 | 金额待确认 | 跟进中 | 跟进超期：最近跟进已超过 30 天 | 无需人工复核 | 核实规则证据并更新 CRM。 | 华南部 / 销售甲 |');
    expect(report).toContain('- 华东部：');
    expect(report).toContain('筛选范围：阶段：跟进中');
    expect(report).toContain('主要规则问题：跟进超期：涉及 1 个项目');
    expect(report).toMatch(/剩余项目：0 个/);
  });

  it('renders explicit empty states when no projects require action', () => {
    const ordinary = makeProject({ sourceKey: 'ordinary' });
    const report = createReviewReport(buildAnalysis([ordinary], [], reportDate), {}, reportDate);

    expect(report).toContain('本期没有需要管理层决策的项目。');
    expect(report).toContain('本期没有重点处理项目。');
    expect(report).toContain('本期没有需要安排后续动作的部门。');
    expect(report).toContain('规则分类：本期没有规则发现。');
  });

  it('uses a neutral pending state for missing, unknown-unit, or parse-error amounts', () => {
    const risk = makeProject({
      sourceKey: 'missing-amount', projectId: 'RISK-NULL', amount: 123,
      amountParseError: true, unit: '无法识别'
    });
    const report = createReviewReport(
      buildAnalysis([risk], [finding(risk, 'similar-name')], reportDate),
      { 'missing-amount': review(risk, '确认业务风险', '业务原因已确认。') },
      reportDate
    );

    expect(report).toContain('基本信息：金额待确认；阶段');
    expect(report).toContain('| RISK-NULL 华城医院数字化改造 | 金额待确认 |');
    expect(report).not.toContain('金额未填写');
  });

  it('keeps all imported and user-authored strings inline and markdown safe', () => {
    const unsafe = makeProject({
      sourceKey: 'unsafe',
      projectId: 'P|1',
      projectName: '正常名\n## 伪造章节\n- 伪造列表 **加粗** | <script>alert(1)</script>',
      department: '部门\n- 列表',
      salesManager: '销售 **甲**'
    });
    const unsafeFinding = finding(
      unsafe, 'similar-name', 'review', '异常 **标签** |',
      '证据\n## 假章节\n- 假列表 <script>bad()</script>'
    );
    const report = createReviewReport(
      buildAnalysis([unsafe], [unsafeFinding], reportDate),
      { unsafe: review(unsafe, '确认业务风险', '备注\n## 备注章节\n- 备注列表 **伪造** | <script>bad()</script>') },
      reportDate,
      ['部门：华东\n## 范围章节 | <script>scope()</script>']
    );

    expect(report.match(/^## /gm)).toHaveLength(5);
    expect(report).not.toContain('\n## 伪造章节');
    expect(report).not.toContain('\n## 假章节');
    expect(report).not.toContain('**加粗**');
    expect(report).not.toContain('**伪造**');
    expect(report).not.toContain('<script>');
    expect(report).toContain('&lt;script&gt;scope()&lt;/script&gt;');
    expect(report).toContain('&#124;');
  });

  it('keeps the markdown report bounded for 400 actionable projects', () => {
    const longName = `超长项目${'名'.repeat(500)}`;
    const longReason = `超长证据${'据'.repeat(5_000)}`;
    const rows = Array.from({ length: 400 }, (_, index) => makeProject({
      sourceKey: `row-${index + 1}`,
      projectId: `P-${index + 1}`,
      projectName: `${longName}${index + 1}`,
      department: `部门${String(index + 1).padStart(3, '0')}`
    }));
    const findings = rows.flatMap((project, index) => [
      finding(project, 'similar-name', 'review', `问题${index + 1}`, longReason),
      ...(index === 0 ? [
        finding(project, 'amount-placeholder', 'review', '第二问题', longReason),
        finding(project, 'duplicate-record', 'review', '第三问题', longReason)
      ] : [])
    ]);
    const analysis = buildAnalysis(rows, findings, reportDate);
    const reviews = { 'row-1': review(rows[0], '确认业务风险', `超长结论${'论'.repeat(5_000)}`) };
    const summary = createReviewSummary(analysis, reviews);
    const report = createReviewReport(analysis, reviews, reportDate);

    expect(summary.departmentActions).toHaveLength(10);
    expect(summary.departmentActions[0].department).toBe('部门001');
    expect(summary.priorityProjects.length + summary.appendix.remainingProjects.length).toBe(400);
    expect(summary.priorityProjects[0].projectName.length).toBeLessThanOrEqual(80);
    expect(summary.priorityProjects[0].evidence).toHaveLength(2);
    expect(summary.priorityProjects[0].evidence.every((item) => item.length <= 160)).toBe(true);
    expect(summary.priorityProjects[0].reviewConclusion.length).toBeLessThanOrEqual(160);
    expect(summary.priorityProjects[0].projectName.endsWith('…')).toBe(true);
    expect(report).toContain('待管理层决策 400 个项目');
    expect(report).toContain('剩余项目：390 个');
    expect(report.split('\n').length).toBeLessThan(180);
    expect(report.length).toBeLessThan(40_000);
  });

  it('formats supplied dates from local calendar getters instead of UTC conversion', () => {
    const localDate = new Date('2026-07-21T00:30:00+08:00');
    const expected = [
      localDate.getFullYear(),
      String(localDate.getMonth() + 1).padStart(2, '0'),
      String(localDate.getDate()).padStart(2, '0')
    ].join('-');
    const report = createReviewReport(buildAnalysis([], [], reportDate), {}, localDate);

    expect(formatLocalDate(localDate)).toBe(expected);
    expect(report).toContain(`生成日期：${expected}`);
  });
});
