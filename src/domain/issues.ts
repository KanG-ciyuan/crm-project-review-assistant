import type { Finding } from './rules';

export interface ProjectIssueGroup {
  reviewKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  department: string;
  salesManager: string;
  amountWan: number | null;
  findings: Finding[];
}

export function groupIssuesByProject(findings: Finding[]): ProjectIssueGroup[] {
  const groups = new Map<string, ProjectIssueGroup>();
  for (const item of findings) {
    const reviewKey = item.rowKey;
    const group = groups.get(reviewKey) ?? {
      reviewKey,
      projectId: item.projectId,
      projectName: item.projectName,
      customerName: item.customerName,
      department: item.department,
      salesManager: item.salesManager,
      amountWan: item.amountWan,
      findings: []
    };
    group.findings.push(item);
    groups.set(reviewKey, group);
  }
  return [...groups.values()];
}
