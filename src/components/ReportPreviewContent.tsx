import type { ReactNode } from 'react';

interface ReportPreviewContentProps {
  markdown: string;
}

const headingPattern = /^(#{1,3})\s+(.+)$/;
const listItemPattern = /^[-*+]\s+(.+)$/;
const tableDividerPattern = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/;

function decodeReportText(value: string): string {
  return value.replace(/&(amp|lt|gt);|&#(\d+);/g, (entity, name: string | undefined, digits: string | undefined) => {
    if (name === 'amp') return '&';
    if (name === 'lt') return '<';
    if (name === 'gt') return '>';
    const codePoint = Number(digits);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => decodeReportText(cell.trim()));
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return headingPattern.test(line)
    || /^>\s?/.test(line)
    || listItemPattern.test(line)
    || (line.trim().startsWith('|') && tableDividerPattern.test(lines[index + 1] ?? ''));
}

function paragraph(lines: string[], key: string): ReactNode {
  return <p key={key}>{lines.map((line, index) => <span key={`${key}:${index}`}>
    {decodeReportText(line)}
    {index < lines.length - 1 && <br />}
  </span>)}</p>;
}

export function ReportPreviewContent({ markdown }: ReportPreviewContentProps) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const heading = lines[index].match(headingPattern);
    if (heading) {
      const text = decodeReportText(heading[2]);
      const key = `heading:${index}`;
      blocks.push(heading[1].length === 1
        ? <h1 key={key}>{text}</h1>
        : heading[1].length === 2
          ? <h2 key={key}>{text}</h2>
          : <h3 key={key}>{text}</h3>);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(lines[index])) {
      const quoteLines: string[] = [];
      const start = index;
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote:${start}`}>
        {quoteLines.map((line, quoteIndex) => <span key={`quote:${start}:${quoteIndex}`}>
          {decodeReportText(line)}
          {quoteIndex < quoteLines.length - 1 && <br />}
        </span>)}
      </blockquote>);
      continue;
    }

    if (listItemPattern.test(lines[index])) {
      const items: string[] = [];
      const start = index;
      while (index < lines.length) {
        const item = lines[index].match(listItemPattern);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ul key={`list:${start}`}>
        {items.map((item, itemIndex) => <li key={`list:${start}:${itemIndex}`}>{decodeReportText(item)}</li>)}
      </ul>);
      continue;
    }

    if (lines[index].trim().startsWith('|') && tableDividerPattern.test(lines[index + 1] ?? '')) {
      const start = index;
      const headers = tableCells(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(<div className="report-preview-table-wrap" key={`table:${start}`}>
        <table>
          <thead><tr>{headers.map((header, cellIndex) => <th key={`table:${start}:head:${cellIndex}`} scope="col">{header}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={`table:${start}:row:${rowIndex}`}>
            {row.map((cell, cellIndex) => <td key={`table:${start}:row:${rowIndex}:${cellIndex}`}>{cell}</td>)}
          </tr>)}</tbody>
        </table>
      </div>);
      continue;
    }

    const start = index;
    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(paragraph(paragraphLines, `paragraph:${start}`));
  }

  return <article className="report-preview-content">{blocks}</article>;
}
