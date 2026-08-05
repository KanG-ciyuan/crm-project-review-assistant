import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportPreviewContent } from './ReportPreviewContent';

afterEach(cleanup);

describe('ReportPreviewContent', () => {
  it('renders the owned report Markdown subset as readable document structure', () => {
    const markdown = [
      '# 储备项目经营复盘报告',
      '',
      '生成日期：2026-08-05',
      '筛选范围：华东事业部',
      '',
      '> 规则提供客观证据，真实原因和业务结论须由业务人员确认。',
      '',
      '## 一、本期经营结论',
      '',
      '- 覆盖 12 个项目',
      '- 待管理层决策 2 个项目',
      '',
      '### 决策项目 1：P-001 云岭数据中台升级',
      '',
      '| 项目 | 金额 | 当前阶段 |',
      '| --- | ---: | --- |',
      '| P-001 云岭数据中台升级 | 2,800 万元 | 方案确认 |',
      '| P-002 客户经营平台 | 金额待确认 | 商务谈判 |',
      '',
      '本期报告结束。'
    ].join('\n');

    render(<ReportPreviewContent markdown={markdown} />);

    expect(screen.getByRole('heading', { level: 1, name: '储备项目经营复盘报告' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '一、本期经营结论' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '决策项目 1：P-001 云岭数据中台升级' })).toBeInTheDocument();
    expect(screen.getByText('生成日期：2026-08-05')).toBeInTheDocument();
    expect(screen.getByText('筛选范围：华东事业部')).toBeInTheDocument();
    expect(screen.queryByText('规则提供客观证据，真实原因和业务结论须由业务人员确认.')).not.toBeInTheDocument();
    expect(screen.getByText('规则提供客观证据，真实原因和业务结论须由业务人员确认。').closest('blockquote')).not.toBeNull();

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '覆盖 12 个项目',
      '待管理层决策 2 个项目'
    ]);

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['项目', '金额', '当前阶段']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('金额待确认')).toBeInTheDocument();
    expect(screen.getByText('本期报告结束。')).toBeInTheDocument();
  });

  it('keeps HTML-looking and encoded report values as inert visible text', () => {
    const markdown = [
      '# &lt;script&gt;alert(1)&lt;/script&gt;',
      '',
      '> <img src=x onerror=alert(1)>',
      '',
      '- 客户 &#35;1 &#124; 重点项目',
      '',
      '| 项目 | 说明 |',
      '| --- | --- |',
      '| &lt;b&gt;项目&lt;/b&gt; | A &#124; B |'
    ].join('\n');

    const { container } = render(<ReportPreviewContent markdown={markdown} />);

    expect(screen.getByRole('heading', { name: '<script>alert(1)</script>' })).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('客户 #1 | 重点项目')).toBeInTheDocument();
    expect(screen.getByText('<b>项目</b>')).toBeInTheDocument();
    expect(screen.getByText('A | B')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
