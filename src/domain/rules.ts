import {
  amountInWan,
  daysBetween,
  projectKey,
  type CanonicalFieldKey,
  type ProjectRow
} from './project';

export type FindingCategory =
  | '数据质量待复核'
  | '维护超期待整改'
  | '疑似重复与撞单'
  | '重点项目复盘'
  | '经营结构分析';

export type FindingLevel = 'info' | 'review' | 'action';

export interface Finding {
  ruleId: string;
  rowKey: string;
  projectId: string;
  projectName: string;
  customerName: string;
  department: string;
  salesManager: string;
  amountWan: number | null;
  category: FindingCategory;
  label: string;
  reason: string;
  level: FindingLevel;
}

export interface RuleDefinition {
  id: string;
  name: string;
  category: FindingCategory;
  requiredFields: CanonicalFieldKey[];
  adjustable: boolean;
}

export interface RuleCapability {
  ruleId: string;
  name: string;
  available: boolean;
  missingFields: CanonicalFieldKey[];
}

const FOLLOW_UP_LIMIT_DAYS = 30;
const LARGE_AMOUNT_WAN = 1000;
const VERY_LARGE_AMOUNT_WAN = 5000;
const EXTREME_AMOUNT_WAN = 10000;
const REPEATED_AMOUNT_COUNT = 5;
const LONG_CYCLE_DAYS = 180;
const LONG_TERM_DAYS = 365;

export const RULE_DEFINITIONS: RuleDefinition[] = [
  { id: 'follow-up-overdue', name: '跟进超期', category: '维护超期待整改', requiredFields: ['status', 'lastFollowUpAt'], adjustable: false },
  { id: 'signing-overdue', name: '签约日期超期未更新', category: '维护超期待整改', requiredFields: ['status', 'createdAt', 'expectedSignAt'], adjustable: false },
  { id: 'date-last-follow-up', name: '跟进日期逻辑异常', category: '数据质量待复核', requiredFields: ['createdAt', 'lastFollowUpAt'], adjustable: false },
  { id: 'date-expected-sign', name: '签约日期逻辑异常', category: '数据质量待复核', requiredFields: ['createdAt', 'expectedSignAt'], adjustable: false },
  { id: 'amount-required', name: '储备金额必须大于 0', category: '数据质量待复核', requiredFields: ['amount', 'unit'], adjustable: false },
  { id: 'amount-tier', name: '重点项目金额分档', category: '重点项目复盘', requiredFields: ['amount', 'unit'], adjustable: false },
  { id: 'amount-placeholder', name: '疑似占位金额', category: '数据质量待复核', requiredFields: ['salesManager', 'amount', 'unit'], adjustable: false },
  { id: 'duplicate-record', name: '重复记录待核实', category: '数据质量待复核', requiredFields: ['projectId'], adjustable: false },
  { id: 'duplicate-project', name: '疑似重复立项', category: '疑似重复与撞单', requiredFields: ['projectId', 'customerName', 'projectName', 'salesManager'], adjustable: false },
  { id: 'cross-seller-collision', name: '疑似撞单待核验', category: '疑似重复与撞单', requiredFields: ['projectId', 'customerName', 'projectName', 'salesManager'], adjustable: false },
  { id: 'similar-name', name: '名称相似待核验', category: '疑似重复与撞单', requiredFields: ['customerName', 'projectName'], adjustable: false },
  { id: 'probability-observation', name: '询价及低概率项目', category: '经营结构分析', requiredFields: ['probabilityBand'], adjustable: false },
  { id: 'reserve-cycle', name: '储备周期观察', category: '经营结构分析', requiredFields: ['status', 'createdAt'], adjustable: false }
];

export function getRuleCapabilities(mappedFields: Set<CanonicalFieldKey>): RuleCapability[] {
  return RULE_DEFINITIONS.map((rule) => {
    const missingFields = rule.requiredFields.filter((field) => !mappedFields.has(field));
    return {
      ruleId: rule.id,
      name: rule.name,
      available: missingFields.length === 0,
      missingFields
    };
  });
}

export function normalizeProjectName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

const markerValues = (value: string) => {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('zh-CN');
  const markers = new Set<string>();
  for (const match of normalized.matchAll(/(?:第?[一二三四五六七八九十百]+期|\d+期|[a-z0-9]+(?:包|标段)|20\d{2})/gu)) {
    markers.add(match[0].replace(/^第/, ''));
  }
  return markers;
};

export function distinctProjectMarkers(left: string, right: string): boolean {
  const leftMarkers = markerValues(left);
  const rightMarkers = markerValues(right);
  if (leftMarkers.size === 0 || rightMarkers.size === 0) return false;
  return [...leftMarkers].some((marker) => !rightMarkers.has(marker))
    || [...rightMarkers].some((marker) => !leftMarkers.has(marker));
}

function parseStrictDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function finding(
  row: ProjectRow,
  ruleId: string,
  category: FindingCategory,
  label: string,
  reason: string,
  level: FindingLevel
): Finding {
  return {
    ruleId,
    rowKey: projectKey(row),
    projectId: row.projectId,
    projectName: row.projectName,
    customerName: row.customerName,
    department: row.department,
    salesManager: row.salesManager,
    amountWan: amountInWan(row),
    category,
    label,
    reason,
    level
  };
}

function evaluateDates(row: ProjectRow, today: Date): Finding[] {
  const results: Finding[] = [];
  const createdAt = parseStrictDate(row.createdAt);
  const lastFollowUpAt = parseStrictDate(row.lastFollowUpAt);
  const expectedSignAt = parseStrictDate(row.expectedSignAt);
  const isOpen = row.status === '跟进中' || row.status === '呆滞';
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (createdAt && lastFollowUpAt && lastFollowUpAt < createdAt) {
    results.push(finding(row, 'date-last-follow-up', '数据质量待复核', '跟进日期逻辑异常', '最近跟进日期早于项目创建日期', 'review'));
  }

  const impossibleSigningDate = Boolean(createdAt && expectedSignAt && expectedSignAt < createdAt);
  if (impossibleSigningDate) {
    results.push(finding(row, 'date-expected-sign', '数据质量待复核', '签约日期逻辑异常', '预计签约日期早于项目创建日期', 'review'));
  } else if (isOpen && expectedSignAt && expectedSignAt < todayStart) {
    results.push(finding(row, 'signing-overdue', '维护超期待整改', '签约日期超期未更新', '预计签约日期已过，应在 24 小时内回到 CRM 更新日期或项目状态', 'action'));
  }

  if (isOpen && lastFollowUpAt && daysBetween(lastFollowUpAt, todayStart) > FOLLOW_UP_LIMIT_DAYS) {
    results.push(finding(row, 'follow-up-overdue', '维护超期待整改', '跟进超期', `距离最近一次电话、微信或现场跟进已超过 ${FOLLOW_UP_LIMIT_DAYS} 天`, 'action'));
  }

  if (isOpen && createdAt) {
    const reserveDays = daysBetween(createdAt, todayStart);
    if (reserveDays > LONG_TERM_DAYS) {
      results.push(finding(row, 'reserve-cycle', '经营结构分析', '长期储备项目', `项目储备已超过 ${LONG_TERM_DAYS} 天`, 'info'));
    } else if (reserveDays > LONG_CYCLE_DAYS) {
      results.push(finding(row, 'reserve-cycle', '经营结构分析', '长周期项目', `项目储备已达到 ${LONG_CYCLE_DAYS} 天`, 'info'));
    }
  }
  return results;
}

function evaluateAmount(row: ProjectRow): Finding[] {
  if (row.amountParseError) {
    return [finding(row, 'amount-required', '数据质量待复核', '金额格式异常', '储备金额原值无法识别为有效数值', 'review')];
  }
  if (row.amount === null || row.amount === 0) {
    return [finding(row, 'amount-required', '数据质量待复核', '储备金额待补充', '询价类项目也必须填写大于 0 的储备金额', 'review')];
  }
  const amountWan = amountInWan(row);
  if (row.amount < 0 || amountWan === null) {
    return [finding(row, 'amount-required', '数据质量待复核', '金额格式异常', '储备金额必须使用已确认的金额单位并填写大于 0 的数值', 'review')];
  }
  if (amountWan >= EXTREME_AMOUNT_WAN) {
    return [finding(row, 'amount-tier-extreme', '重点项目复盘', '极端金额待核实', `储备金额达到 ${EXTREME_AMOUNT_WAN.toLocaleString()} 万元，应重点核实`, 'review')];
  }
  if (amountWan >= VERY_LARGE_AMOUNT_WAN) {
    return [finding(row, 'amount-tier-very-large', '重点项目复盘', '超大金额待复核', `储备金额达到 ${VERY_LARGE_AMOUNT_WAN.toLocaleString()} 万元，应单独复核`, 'review')];
  }
  if (amountWan >= LARGE_AMOUNT_WAN) {
    return [finding(row, 'amount-tier-large', '重点项目复盘', '大额重点项目', `储备金额达到 ${LARGE_AMOUNT_WAN.toLocaleString()} 万元，应纳入重点项目复盘`, 'info')];
  }
  return [];
}

function evaluateRepeatedAmounts(rows: ProjectRow[]): Finding[] {
  const groups = new Map<string, ProjectRow[]>();
  for (const row of rows) {
    const amountWan = amountInWan(row);
    if (!row.salesManager || amountWan === null || amountWan <= 0) continue;
    const key = `${row.salesManager}\u0000${amountWan}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .filter((group) => group.length >= REPEATED_AMOUNT_COUNT)
    .flatMap((group) => group.map((row) => finding(
      row,
      'amount-placeholder',
      '数据质量待复核',
      '疑似占位金额',
      `同一销售有 ${group.length} 个项目填写相同金额，需核实是否为占位值`,
      'review'
    )));
}

function normalizedCustomer(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigrams(value: string) {
  if (value.length < 2) return [value];
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2));
}

function conservativeSimilarity(left: string, right: string) {
  if (left.length < 6 || right.length < 6 || left === right) return false;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  const remaining = [...rightPairs];
  let overlap = 0;
  for (const pair of leftPairs) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length) >= 0.75;
}

function evaluateDuplicates(rows: ProjectRow[]): Finding[] {
  const results: Finding[] = [];
  const byId = new Map<string, ProjectRow[]>();
  const byProject = new Map<string, ProjectRow[]>();

  for (const row of rows) {
    if (row.projectId.trim()) byId.set(row.projectId.trim(), [...(byId.get(row.projectId.trim()) ?? []), row]);
    const projectName = normalizeProjectName(row.projectName);
    const customerName = normalizedCustomer(row.customerName);
    if (projectName && customerName) {
      const key = `${customerName}\u0000${projectName}`;
      byProject.set(key, [...(byProject.get(key) ?? []), row]);
    }
  }

  for (const group of byId.values()) {
    if (group.length < 2) continue;
    results.push(...group.map((row) => finding(row, 'duplicate-record', '数据质量待复核', '重复记录待核实', '相同项目编码出现多条记录，需检查 CRM 导出或数据重复', 'review')));
  }

  for (const group of byProject.values()) {
    if (group.length < 2) continue;
    const distinctProjectIds = new Set(group.map((row) => row.projectId).filter(Boolean));
    if (distinctProjectIds.size < 2) continue;
    const distinctSellers = new Set(group.map((row) => row.salesManager).filter(Boolean));
    if (distinctSellers.size > 1) {
      results.push(...group.map((row) => finding(row, 'cross-seller-collision', '疑似重复与撞单', '疑似撞单待核验', '同一客户的同名项目由不同销售负责，需核验归属', 'review')));
    } else if (distinctSellers.size === 1) {
      results.push(...group.map((row) => finding(row, 'duplicate-project', '疑似重复与撞单', '疑似重复立项', '同一销售在同一客户下存在规范化后同名的不同项目编码', 'review')));
    }
  }

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex];
    const leftName = normalizeProjectName(left.projectName);
    if (!leftName || !left.customerName) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const right = rows[rightIndex];
      if (normalizedCustomer(left.customerName) !== normalizedCustomer(right.customerName)) continue;
      const rightName = normalizeProjectName(right.projectName);
      if (distinctProjectMarkers(left.projectName, right.projectName)) continue;
      if (!conservativeSimilarity(leftName, rightName)) continue;
      results.push(finding(left, 'similar-name', '疑似重复与撞单', '名称相似待核验', `与“${right.projectName}”名称相似，仅作人工核验提示`, 'info'));
      results.push(finding(right, 'similar-name', '疑似重复与撞单', '名称相似待核验', `与“${left.projectName}”名称相似，仅作人工核验提示`, 'info'));
    }
  }
  return results;
}

function evaluateProbability(row: ProjectRow): Finding[] {
  if (row.probabilityBand !== '询价类' && row.probabilityBand !== '低概率') return [];
  return [finding(row, 'probability-observation', '经营结构分析', '询价及低概率项目', `当前成单概率为${row.probabilityBand}，仅纳入经营结构观察`, 'info')];
}

export interface RuleEvaluationOptions {
  mappedFields?: Set<CanonicalFieldKey>;
  enabledRuleIds?: Set<string>;
}

export function evaluateRulePack(rows: ProjectRow[], today: Date, options: RuleEvaluationOptions = {}): Finding[] {
  const rowFindings = rows.flatMap((row) => [
    ...evaluateProbability(row),
    ...evaluateDates(row, today),
    ...evaluateAmount(row)
  ]);
  const findings = [
    ...rowFindings,
    ...evaluateRepeatedAmounts(rows),
    ...evaluateDuplicates(rows)
  ];
  const availableRuleIds = options.mappedFields
    ? new Set(getRuleCapabilities(options.mappedFields).filter((item) => item.available).map((item) => item.ruleId))
    : null;
  return findings.filter((item) => {
    const capabilityRuleId = item.ruleId.startsWith('amount-tier') ? 'amount-tier' : item.ruleId;
    return (!availableRuleIds || availableRuleIds.has(capabilityRuleId))
      && (!options.enabledRuleIds || options.enabledRuleIds.has(capabilityRuleId));
  });
}
