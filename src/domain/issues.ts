import type { Issue } from './analyze';

export interface ProjectIssueGroup {
  reviewKey: string;
  projectId: string;
  projectName: string;
  salesManager: string;
  amount: number | null;
  issues: Issue[];
}

export function groupIssuesByProject(issues: Issue[]): ProjectIssueGroup[] {
  const groups = new Map<string, ProjectIssueGroup>();
  for (const issue of issues) {
    const reviewKey = issue.reviewKey || issue.projectId;
    const group = groups.get(reviewKey) ?? {
      reviewKey,
      projectId: issue.projectId,
      projectName: issue.projectName,
      salesManager: issue.salesManager,
      amount: issue.amount,
      issues: []
    };
    group.issues.push(issue);
    groups.set(reviewKey, group);
  }
  return [...groups.values()];
}
