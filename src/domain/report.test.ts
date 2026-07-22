import { describe, expect, it } from 'vitest';
import { makeProject } from '../test/fixtures';
import { buildAnalysis } from './analysis';
import { createReviewReport, formatLocalDate } from './report';
import type { Finding } from './rules';
import type { ReviewRecordMap } from './review';

const row = makeProject({ sourceKey: 'row-24', projectId: 'P-2026-024', projectName: '远景综合管廊项目' });
const findings: Finding[] = [
  { ruleId: 'amount', rowKey: 'row-24', projectId: row.projectId, projectName: row.projectName, customerName: row.customerName, department: row.department, salesManager: row.salesManager, amountWan: 50000, category: '数据质量待复核', label: '金额需复核', reason: '超过本次复核上限', level: 'review' },
  { ruleId: 'reserve', rowKey: 'row-24', projectId: row.projectId, projectName: row.projectName, customerName: row.customerName, department: row.department, salesManager: row.salesManager, amountWan: 50000, category: '经营结构分析', label: '长周期项目', reason: '仅用于经营观察', level: 'info' }
];
const analysis = buildAnalysis([row], findings, new Date('2026-07-16'));
const reviews: ReviewRecordMap = {
  'row-24': { projectId: row.projectId, projectName: row.projectName, status: '确认数据错误', note: '已通知销售修正金额。', firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z', fingerprint: 'x', dataUpdated: false, history: [] }
};

describe('createReviewReport', () => {
  it('includes the fixed disclaimer and five result sections', () => {
    const report = createReviewReport(analysis, {}, new Date('2026-07-16'));
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
    for (const heading of ['数据质量待复核', '维护超期待整改', '疑似重复与撞单', '重点项目复盘', '经营结构分析']) {
      expect(report).toContain(`## ${heading}`);
    }
    expect(report).toContain('P-2026-024');
    expect(report).toContain('经营观察');
  });

  it('adds grouped human-review progress by project row key', () => {
    const report = createReviewReport(analysis, reviews, new Date('2026-07-16'));
    expect(report).toContain('## 审查处理进度');
    expect(report).toContain('已通知销售修正金额。');
    expect(report).toContain('金额、日期、项目状态及业务结论须由业务人员确认');
  });

  it('writes a markdown-safe active filter scope immediately after the generated date', () => {
    const report = createReviewReport(analysis, {}, new Date('2026-07-16'), [
      '部门：华东\n一部',
      '标签：跟进 | 超期'
    ]);

    expect(report).toContain('生成日期：2026-07-16\n\n筛选范围：部门：华东 一部；标签：跟进 &#124; 超期');
    expect(report).not.toContain('筛选范围：部门：华东\n一部');
  });

  it('only reports rows and actionable review progress from the projected analysis', () => {
    const hidden = makeProject({ sourceKey: 'row-hidden', projectId: 'P-HIDDEN', projectName: '不应泄漏项目' });
    const visibleAction: Finding = {
      ...findings[0], rowKey: row.sourceKey, projectId: row.projectId, projectName: row.projectName,
      category: '维护超期待整改', label: '跟进超期', level: 'action'
    };
    const projected = buildAnalysis([row], [visibleAction, findings[1]], new Date('2026-07-16'));
    const mixedReviews: ReviewRecordMap = {
      ...reviews,
      [hidden.sourceKey]: {
        projectId: hidden.projectId, projectName: hidden.projectName, status: '确认业务风险', note: '隐藏项目备注',
        firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z',
        fingerprint: 'hidden', dataUpdated: false, history: []
      }
    };

    const report = createReviewReport(projected, mixedReviews, new Date('2026-07-16'), ['部门：华东部']);

    expect(report).toContain('远景综合管廊项目');
    expect(report).not.toContain(hidden.projectName);
    expect(report).not.toContain('仅属于隐藏项目的证据');
    expect(report).not.toContain('隐藏项目备注');
    expect(report).toContain('## 经营结构分析');
    expect(report).not.toContain('重点风险项目');
    expect(report).not.toContain('低概率重点项目');
  });

  it('does not count information-only findings as pending review work', () => {
    const infoOnly = buildAnalysis([row], [findings[1]], new Date('2026-07-16'));
    const report = createReviewReport(infoOnly, reviews, new Date('2026-07-16'));

    expect(report).toContain('### 待复核项目\n\n本期无项目。');
    expect(report).toContain('### 已确认数据错误项目\n\n本期无项目。');
  });

  it('exports every finding when one category contains more than eight items', () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeProject({
      sourceKey: `row-${index + 1}`,
      projectId: `P-${index + 1}`,
      projectName: `完整导出项目${index + 1}`
    }));
    const manyFindings: Finding[] = rows.map((project, index) => ({
      ruleId: `complete-${index + 1}`,
      rowKey: project.sourceKey,
      projectId: project.projectId,
      projectName: project.projectName,
      customerName: project.customerName,
      department: project.department,
      salesManager: project.salesManager,
      amountWan: project.amount,
      category: '数据质量待复核',
      label: `完整性问题${index + 1}`,
      reason: `第${index + 1}条证据`,
      level: 'review'
    }));

    const report = createReviewReport(buildAnalysis(rows, manyFindings, new Date('2026-07-16')), {}, new Date('2026-07-16'));

    expect(report.match(/完整性问题\d+/g)).toHaveLength(24);
    expect(report).toContain('完整导出项目12');
    expect(report).toContain('第12条证据');
  });

  it('keeps untrusted report fields inline and escapes markdown and html structures', () => {
    const unsafe = makeProject({
      sourceKey: 'unsafe',
      projectId: 'P-UNSAFE',
      projectName: '正常名\n## 伪造章节\n- 伪造列表 **加粗** | <script>alert(1)</script>'
    });
    const unsafeFinding: Finding = {
      ruleId: 'unsafe', rowKey: unsafe.sourceKey, projectId: unsafe.projectId, projectName: unsafe.projectName,
      customerName: '客户\n## 客户章节', department: '部门\n- 列表', salesManager: '销售 **甲**', amountWan: 100,
      category: '数据质量待复核', label: '异常 **标签** |',
      reason: '证据\n## 假章节\n- 假列表 <script>bad()</script>', level: 'review'
    };
    const unsafeReviews: ReviewRecordMap = {
      unsafe: {
        projectId: unsafe.projectId, projectName: unsafe.projectName, status: '确认数据错误',
        note: '备注\n## 备注章节\n- 备注列表 **伪造** | <script>bad()</script>',
        firstReviewedAt: '2026-07-17T09:00:00.000Z', lastReviewedAt: '2026-07-17T09:00:00.000Z',
        fingerprint: 'unsafe', dataUpdated: false, history: []
      }
    };
    const report = createReviewReport(
      buildAnalysis([unsafe], [unsafeFinding], new Date('2026-07-16')),
      unsafeReviews,
      new Date('2026-07-16'),
      ['部门：华东\n## 范围章节 | <script>scope()</script>']
    );

    expect(report.match(/^## /gm)).toHaveLength(8);
    expect(report).not.toContain('\n## 伪造章节');
    expect(report).not.toContain('\n## 假章节');
    expect(report).not.toContain('**加粗**');
    expect(report).not.toContain('**伪造**');
    expect(report).not.toContain('<script>');
    expect(report).not.toContain(' | ');
    expect(report).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(report).toContain('&#42;&#42;加粗&#42;&#42;');
    expect(report).toContain('&#124;');
  });

  it('formats dates from local calendar getters instead of UTC conversion', () => {
    const localDate = new Date('2026-07-21T00:30:00+08:00');
    const expected = [
      localDate.getFullYear(),
      String(localDate.getMonth() + 1).padStart(2, '0'),
      String(localDate.getDate()).padStart(2, '0')
    ].join('-');

    expect(formatLocalDate(localDate)).toBe(expected);
  });
});
