import type { AnalysisResult } from './analysis';
import { daysBetween, parseIsoDate, projectKey, type ProjectRow } from './project';
import type { Finding } from './rules';

export type FindingKind = 'fact' | 'manual' | 'observation';

const MANUAL_RULE_IDS = new Set([
  'duplicate-record',
  'duplicate-project',
  'cross-seller-collision',
  'similar-name',
  'amount-placeholder'
]);

export function findingKind(finding: Finding): FindingKind {
  if (MANUAL_RULE_IDS.has(finding.ruleId)) return 'manual';
  if (finding.ruleId.startsWith('amount-tier') || finding.ruleId === 'probability-observation' || finding.ruleId === 'reserve-cycle') {
    return 'observation';
  }
  return 'fact';
}

export function manualReviewKeys(findings: Finding[]): string[] {
  return [...new Set(findings.filter((finding) => findingKind(finding) === 'manual').map((finding) => finding.rowKey))];
}

export interface RelatedProject {
  rowKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  salesManager: string;
  relationKey: string;
  ruleId: string;
  relationLabel: string;
}

export interface ProjectWorkbenchRow {
  rowKey: string;
  project: ProjectRow;
  findings: Finding[];
  factFindings: Finding[];
  manualFindings: Finding[];
  observationFindings: Finding[];
  relatedProjects: RelatedProject[];
  followUpOverdueDays: number | null;
  signingOverdueDays: number | null;
  priority: 0 | 1 | 2 | 3;
}

function overdueDays(value: string | null, parseError: boolean, generatedDate: Date | null): number | null {
  if (parseError || !generatedDate || !value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseIsoDate(value);
  if (!date) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const days = daysBetween(date, generatedDate);
  return days >= 0 ? days : null;
}

export function buildProjectWorkbenchRows(analysis: AnalysisResult): ProjectWorkbenchRow[] {
  const findingsByRow = new Map<string, Finding[]>();
  for (const finding of analysis.findings) {
    findingsByRow.set(finding.rowKey, [...(findingsByRow.get(finding.rowKey) ?? []), finding]);
  }
  const projectsByRow = new Map(analysis.rows.map((project) => [projectKey(project), project]));
  const relationGroups = new Map<string, string[]>();
  for (const finding of analysis.findings) {
    if (!finding.relationKey) continue;
    const members = relationGroups.get(finding.relationKey) ?? [];
    if (!members.includes(finding.rowKey)) members.push(finding.rowKey);
    relationGroups.set(finding.relationKey, members);
  }
  const generatedAt = new Date(analysis.generatedAt);
  const generatedDate = Number.isNaN(generatedAt.getTime())
    ? null
    : new Date(generatedAt.getFullYear(), generatedAt.getMonth(), generatedAt.getDate());

  const rows = analysis.rows.map((project) => {
    const rowKey = projectKey(project);
    const findings = findingsByRow.get(rowKey) ?? [];
    const factFindings = findings.filter((finding) => findingKind(finding) === 'fact');
    const manualFindings = findings.filter((finding) => findingKind(finding) === 'manual');
    const observationFindings = findings.filter((finding) => findingKind(finding) === 'observation');
    const priority: ProjectWorkbenchRow['priority'] = manualFindings.length > 0
      ? 0
      : factFindings.length > 0
        ? 1
        : observationFindings.length > 0 ? 2 : 3;
    const relatedProjectsByIdentity = new Map<string, RelatedProject>();
    for (const finding of findings) {
      if (!finding.relationKey) continue;
      for (const relatedRowKey of relationGroups.get(finding.relationKey) ?? []) {
        const relatedProject = projectsByRow.get(relatedRowKey);
        if (relatedRowKey === rowKey || !relatedProject) continue;
        const identity = `${relatedRowKey}\u0000${finding.relationKey}\u0000${finding.ruleId}`;
        const candidate: RelatedProject = {
          rowKey: relatedRowKey,
          projectId: relatedProject.projectId,
          projectName: relatedProject.projectName,
          customerName: relatedProject.customerName,
          salesManager: relatedProject.salesManager,
          relationKey: finding.relationKey,
          ruleId: finding.ruleId,
          relationLabel: finding.label
        };
        const existing = relatedProjectsByIdentity.get(identity);
        if (!existing || candidate.relationLabel.localeCompare(existing.relationLabel, 'zh-CN') < 0) {
          relatedProjectsByIdentity.set(identity, candidate);
        }
      }
    }
    const relatedProjects = [...relatedProjectsByIdentity.values()].sort((left, right) =>
      left.rowKey.localeCompare(right.rowKey, 'zh-CN')
      || left.relationKey.localeCompare(right.relationKey, 'zh-CN')
      || left.ruleId.localeCompare(right.ruleId, 'zh-CN')
    );
    return {
      rowKey,
      project,
      findings,
      factFindings,
      manualFindings,
      observationFindings,
      relatedProjects,
      followUpOverdueDays: findings.some((finding) => finding.ruleId === 'follow-up-overdue')
        ? overdueDays(project.lastFollowUpAt, project.lastFollowUpAtParseError, generatedDate)
        : null,
      signingOverdueDays: findings.some((finding) => finding.ruleId === 'signing-overdue')
        ? overdueDays(project.expectedSignAt, project.expectedSignAtParseError, generatedDate)
        : null,
      priority
    };
  });
  return rows.sort((left, right) =>
    left.priority - right.priority
    || left.project.projectId.localeCompare(right.project.projectId, 'zh-CN')
    || left.rowKey.localeCompare(right.rowKey, 'zh-CN')
  );
}
