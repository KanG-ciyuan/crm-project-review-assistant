import * as XLSX from 'xlsx';
import { amountInWan } from './project';
import type { ReviewRecordMap } from './review';
import type { Finding } from './rules';
import type { RelatedProject } from './workbench';
import type { ProjectWorkbenchRow } from './workbench';

const HEADERS = [
  '部门',
  '销售经理',
  '客户名称',
  '项目编码',
  '项目名称',
  '项目状态',
  '储备金额（万元）',
  '成单概率',
  '创建日期',
  '最近跟进日期',
  '预计签约日期',
  '跟进超期天数',
  '签约超期天数',
  '客观事实',
  '人工核验问题',
  '经营观察',
  '全部分析结果',
  '关联项目',
  '人工判断状态',
  '处理说明'
] as const;

const COLUMN_WIDTHS = [
  14, 14, 20, 16, 24, 12, 16, 12, 14, 14,
  14, 14, 14, 34, 34, 34, 38, 48, 24, 30
];

function formatFinding(finding: Finding): string {
  const label = finding.label.trim();
  const reason = finding.reason.trim();
  if (!label) return reason;
  if (!reason) return label;
  return `${label}：${reason}`;
}

function formatFindings(findings: Finding[]): string {
  return findings.map(formatFinding).filter(Boolean).join('\n');
}

function formatRelatedProject(project: RelatedProject): string {
  return [
    `项目编码：${project.projectId}`,
    `项目名称：${project.projectName}`,
    `客户名称：${project.customerName}`,
    `销售经理：${project.salesManager}`,
    `关联关系：${project.relationLabel}`
  ].join('；');
}

export function createProjectDetailWorkbook(
  rows: ProjectWorkbenchRow[],
  reviews: ReviewRecordMap
): XLSX.WorkBook {
  const body = rows.map((row) => {
    const { project } = row;
    const review = row.manualFindings.length > 0 ? reviews[row.rowKey] : undefined;

    return [
      project.department,
      project.salesManager,
      project.customerName,
      project.projectId,
      project.projectName,
      project.status,
      amountInWan(project) ?? '',
      project.probabilityBand,
      project.createdAt ?? '',
      project.lastFollowUpAt ?? '',
      project.expectedSignAt ?? '',
      row.followUpOverdueDays ?? '',
      row.signingOverdueDays ?? '',
      formatFindings(row.factFindings),
      formatFindings(row.manualFindings),
      formatFindings(row.observationFindings),
      formatFindings(row.findings),
      row.relatedProjects.map(formatRelatedProject).join('\n'),
      review?.status ?? '',
      review?.note ?? ''
    ];
  });
  const worksheet = XLSX.utils.aoa_to_sheet([[...HEADERS], ...body]);
  worksheet['!cols'] = COLUMN_WIDTHS.map((wch) => ({ wch }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '项目明细');
  return workbook;
}
