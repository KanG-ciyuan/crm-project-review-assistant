import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = new URL('../sample-data/', import.meta.url).pathname;
const outputPath = `${outputDir}CRM历史项目表-脱敏适配样表.xlsx`;
const headers = ['部门', '销售经理', '创建日期', '最近拜访时间', '拜访间隔周期（天）', '项目名称', '项目编码', '项目状态', '成单概率', '储备金额（万元）', '预计合同签订时间'];
const rows = [
  ['华东业务部', '示例经理甲', '2026-05-10', '2026-06-15', 33, '星河园区节能改造项目', 'CRM-001', '跟进中', '71%-80%', 860, '2026-08-20'],
  ['华南业务部', '示例经理乙', '2026-03-02', '2026-04-01', 108, '云港仓储升级项目', 'CRM-002', '呆滞', '1%-50%', 1200, '2026-09-30'],
  ['华北业务部', '示例经理丙', '2026-01-18', '2026-06-28', 20, '远景水务数字化项目', 'CRM-003', '呆滞', '询价类', 680, '2026-06-30'],
  ['华中业务部', '示例经理丁', '2026-06-03', '2026-07-10', 8, '无', '无', '跟进中', '81%-100%', 320, '2026-08-15'],
  ['华东业务部', '示例经理甲', '2026-04-26', '2026-07-05', 3, '北辰综合管廊项目', 'CRM-005', '跟进中', '1%-50%', 1850, '2026-11-10'],
  ['华西业务部', '示例经理戊', '2026-06-20', '2026-07-16', 2, '清源厂区运维项目', 'CRM-006', '跟进中', '81%-100%', 240, '2026-08-05']
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('10-储备项目报备表（跟进中和呆滞）');
sheet.showGridLines = false;
sheet.getRange('A1:K1').values = [headers];
sheet.getRange(`A2:K${rows.length + 1}`).values = rows;
sheet.getRange('A1:K1').format = { fill: '#0f4f52', font: { bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, borders: { preset: 'outside', style: 'thin', color: '#0b3b3e' } };
sheet.getRange(`A2:K${rows.length + 1}`).format = { borders: { preset: 'insideHorizontal', style: 'thin', color: '#D9E4E4' }, verticalAlignment: 'center' };
sheet.getRange(`E2:E${rows.length + 1}`).format.horizontalAlignment = 'center';
sheet.getRange(`J2:J${rows.length + 1}`).format.numberFormat = '#,##0.00';
sheet.getRange('A:A').format.columnWidth = 16;
sheet.getRange('B:B').format.columnWidth = 12;
sheet.getRange('C:D').format.columnWidth = 14;
sheet.getRange('E:E').format.columnWidth = 16;
sheet.getRange('F:F').format.columnWidth = 28;
sheet.getRange('G:G').format.columnWidth = 14;
sheet.getRange('H:I').format.columnWidth = 14;
sheet.getRange('J:J').format.columnWidth = 18;
sheet.getRange('K:K').format.columnWidth = 18;
sheet.getRange('A1:K1').format.rowHeight = 30;
sheet.freezePanes.freezeRows(1);

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const inspected = await workbook.inspect({ kind: 'table', range: '10-储备项目报备表（跟进中和呆滞）!A1:K7', include: 'values', tableMaxRows: 8, tableMaxCols: 11 });
const preview = await workbook.render({ sheetName: '10-储备项目报备表（跟进中和呆滞）', range: 'A1:K7', scale: 1.5, format: 'png' });
await fs.writeFile(`${outputDir}CRM历史项目表-脱敏适配样表.png`, new Uint8Array(await preview.arrayBuffer()));
console.log(inspected.ndjson);
console.log(outputPath);
