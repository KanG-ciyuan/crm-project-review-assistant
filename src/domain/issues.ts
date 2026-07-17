import type { Issue } from './analyze';

export interface ProjectIssueGroup {
  projectId: string;
  projectName: string;
  salesManager: string;
  amount: number | null;
  issues: Issue[];
}

export function groupIssuesByProject(issues: Issue[]): ProjectIssueGroup[] {
  const groups = new Map<string, ProjectIssueGroup>();
  for (const issue of issues) {
    const group = groups.get(issue.projectId) ?? {
      projectId: issue.projectId,
      projectName: issue.projectName,
      salesManager: issue.salesManager,
      amount: issue.amount,
      issues: []
    };
    group.issues.push(issue);
    groups.set(issue.projectId, group);
  }
  return [...groups.values()];
}
