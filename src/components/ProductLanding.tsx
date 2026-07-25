import { ArrowDown, ArrowUp, Check, FileSpreadsheet, ScanLine, ShieldCheck, UserCheck } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface ProductLandingProps {
  onStart: () => void;
}

const stages = [
  {
    number: '01',
    title: '原始数据\n留在浏览器',
    copy: '读取未加密的 Excel，识别工作表与项目记录。文件不会上传到服务器，也不会改写原始内容。',
    tags: ['本地读取', '支持 .xlsx', '不上传原始文件']
  },
  {
    number: '02',
    title: '确定的字段，\n不再反复确认',
    copy: '自动识别常见 CRM 表头。只有状态、概率或金额单位确实不明确时，才交给用户确认。',
    tags: ['17 个标准字段', '保留自定义字段']
  },
  {
    number: '03',
    title: '每一个提示，\n都能回到规则',
    copy: '系统按已确认的业务口径执行规则，不让模型猜测项目好坏，也不会自动修改金额、日期或状态。',
    tags: ['规则事实', '关联证据', '范围可见']
  },
  {
    number: '04',
    title: '系统发现线索，\n人做最终判断',
    copy: '销售主管和运营人员确认问题状态、补充处理说明，并导出可追溯的复盘摘要与项目证据。',
    tags: ['本地保存', 'Markdown', 'Excel']
  }
] as const;

function HeroWorkbenchPreview() {
  return <div className="product-hero-workbench" aria-hidden="true">
    <aside>
      <div className="product-hero-workbench-brand"><span>CRM</span><div><strong>CRM 项目运营复盘</strong><small>储备项目分析助手</small></div></div>
      <p>导入 Excel</p>
      <div className="product-hero-upload"><FileSpreadsheet size={15} /> 选择 .xlsx 文件</div>
      <div className="product-hero-file"><strong>CRM历史项目表-脱敏适配样表.xlsx</strong><small>150 条项目记录</small></div>
      <p>数据来源标识（企业/账套）</p>
      <b>华东事业部 CRM</b>
      <p>工作表</p>
      <b>储备项目明细</b>
      <p>规则阈值</p>
      <label>跟进维护周期 <span>30 天</span></label>
      <label>重点项目金额 <span>1000 万元</span></label>
    </aside>
    <main>
      <header><h3>储备项目运营复盘助手</h3><p>以固定规则发现数据质量问题和经营风险，最终结论由业务人员确认。</p></header>
      <section className="product-hero-ready"><small>智能识别完成</small><strong>数据已准备好</strong><p>已识别 17 个标准字段，共 150 条项目数据，可以开始分析。</p></section>
      <nav><span>分析总览</span><span>项目问题清单</span><span>复盘摘要</span></nav>
      <div className="product-hero-metrics">
        <article><small>项目总数</small><strong>150</strong><span>当前筛选</span></article>
        <article><small>储备金额</small><strong>8.4 亿</strong><span>统一金额口径</span></article>
        <article><small>客观问题项目</small><strong>27</strong><span>规则事实</span></article>
      </div>
      <div className="product-hero-charts">
        <article><strong>部门储备金额分布</strong><i><span>华东事业部</span><b /></i><i><span>华南事业部</span><b /></i><i><span>华北事业部</span><b /></i></article>
        <article><strong>销售经理储备金额分布</strong><i><span>销售经理甲</span><b /></i><i><span>销售经理乙</span><b /></i><i><span>销售经理丙</span><b /></i></article>
      </div>
    </main>
  </div>;
}

export function ProductLanding({ onStart }: ProductLandingProps) {
  const [activeStage, setActiveStage] = useState(0);
  const stageRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visibleEntry) return;
      const nextStage = Number((visibleEntry.target as HTMLElement).dataset.stageIndex);
      if (Number.isInteger(nextStage)) setActiveStage(nextStage);
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.2, 0.55] });

    stageRefs.current.forEach((stage) => stage && observer.observe(stage));
    return () => observer.disconnect();
  }, []);

  return <div className="product-home">
    <div className="product-nav-wrap">
      <nav className="product-nav" aria-label="产品导航">
        <a className="product-brand" href="#product-value"><span>CRM</span><strong>复盘台</strong></a>
        <div className="product-nav-links">
          <a href="#product-value">产品价值</a>
          <a href="#product-workflow">处理流程</a>
          <a href="#product-preview">分析工作台</a>
          <a href="#product-boundary">使用边界</a>
        </div>
        <button className="product-nav-cta" type="button" onClick={onStart}>开始分析</button>
      </nav>
    </div>

    <header className="product-hero" id="product-value">
      <div className="product-hero-inner">
        <div className="product-hero-copy-block">
          <p className="product-kicker">Sales operations · Local review</p>
          <h1>CRM 储备项目<br /><span>运营复盘助手</span></h1>
          <h2>让问题浮现，让判断有据可查。</h2>
          <p>把 CRM 导出的项目明细转化为可复核的事实、待确认的线索和经营观察。规则负责识别，最终结论始终由业务人员确认。</p>
          <div className="product-hero-actions">
            <a className="product-button product-button-primary" href="#product-workflow">查看处理过程 <ArrowDown size={16} /></a>
            <button className="product-button product-button-secondary" type="button" onClick={onStart}>进入分析工具</button>
          </div>
        </div>
        <div className="product-stage" aria-label="CRM 储备项目运营复盘助手工作台预览">
          <div className="product-sheet"><HeroWorkbenchPreview /></div>
        </div>
      </div>
      <div className="product-hero-facts"><span>原始 Excel 不上传</span><span>固定规则可追溯</span><span>不修改源数据</span></div>
    </header>

    <section className="product-principles" aria-label="产品原则">
      <div>
        <article><ShieldCheck size={19} /><div><strong>客观事实</strong><p>规则能够直接确认的字段缺失、日期超期与重复记录。</p></div></article>
        <article><UserCheck size={19} /><div><strong>人工核验</strong><p>展示关联证据，由业务人员确认真实情况与处理方式。</p></div></article>
        <article><ScanLine size={19} /><div><strong>经营观察</strong><p>用于发现结构与趋势，不把观察直接等同于业务风险。</p></div></article>
      </div>
    </section>

    <section className="product-workflow" id="product-workflow">
      <div className="product-section-head">
        <div><p className="product-kicker">One continuous review</p><h2>一条持续更新的<br /><span>复盘工作流</span></h2></div>
        <p>右侧始终是同一个工作台。它从文件导入、字段识别、规则扫描逐步变化到人工复核，而不是翻阅四张独立页面。</p>
      </div>
      <div className="product-workflow-layout">
        <div className="product-stage-list">
          {stages.map((stage, index) => <a
            className={`product-stage-choice${activeStage === index ? ' is-active' : ''}`}
            data-stage-index={index}
            href={`#workflow-step-${index}`}
            id={`workflow-step-${index}`}
            key={stage.number}
            onClick={() => setActiveStage(index)}
            onFocus={() => setActiveStage(index)}
            onMouseEnter={() => setActiveStage(index)}
            ref={(element) => { stageRefs.current[index] = element; }}
          >
            <span>{stage.number}</span><strong>{stage.title.split('\n').map((line) => <span key={line}>{line}</span>)}</strong><p>{stage.copy}</p><i>{stage.tags.map((tag) => <em key={tag}>{tag}</em>)}</i>
          </a>)}
        </div>
        <aside className="product-live-workbench" aria-label="连续分析工作台">
          <div className="product-live-top"><strong>CRM 项目运营复盘</strong><span>LIVE PROCESS</span></div>
          <section aria-label="文件导入" data-active={activeStage === 0} id="workflow-state-0" className={`product-live-screen${activeStage === 0 ? ' is-active' : ''}`}>
            <p>01 / IMPORT</p><h3>数据留在当前浏览器</h3>
            <div className="product-upload-demo"><FileSpreadsheet size={46} /><strong>CRM历史项目表.xlsx</strong><span>读取工作表与项目记录</span></div>
          </section>
          <section aria-label="字段识别" data-active={activeStage === 1} id="workflow-state-1" className={`product-live-screen product-mapping-demo${activeStage === 1 ? ' is-active' : ''}`}>
            <p>02 / FIELD MAPPING</p><h3>字段识别完成</h3>
            {['项目编号', '预计签约日期', '项目状态', '保留为自定义字段'].map((label) => <div key={label}><span>{label}</span><b><Check size={14} /> 已确认</b></div>)}
          </section>
          <section aria-label="规则扫描" data-active={activeStage === 2} id="workflow-state-2" className={`product-live-screen product-rule-demo${activeStage === 2 ? ' is-active' : ''}`}>
            <p>03 / RULE SCAN</p><h3>固定规则形成证据</h3>
            <div><article><strong>跟进维护超期</strong><span>扫描记录并返回原始字段。</span></article><article><strong>签约日期待更新</strong><span>只报告可以复核的事实。</span></article><article><strong>疑似重复与撞单</strong><span>展示关联证据，等待人工确认。</span></article><article><strong>重点项目分档</strong><span>按业务确认金额区间执行。</span></article></div>
          </section>
          <section aria-label="人工复核" data-active={activeStage === 3} id="workflow-state-3" className={`product-live-screen product-review-demo${activeStage === 3 ? ' is-active' : ''}`}>
            <p>04 / HUMAN REVIEW</p><h3>线索交给业务人员确认</h3>
            {['华东医疗数字化项目', '区域能源管理平台', '制造行业数据中台'].map((name) => <div key={name}><strong>{name}</strong><span>待业务确认</span></div>)}
          </section>
        </aside>
      </div>
    </section>

    <section className="product-preview" id="product-preview">
      <div className="product-preview-head"><p className="product-kicker">Review workspace</p><h2>过程可以有动效，<br />判断必须保持清晰</h2></div>
      <div className="product-preview-metrics">
        <article><span>项目总数</span><strong>150</strong><small>当前筛选</small></article>
        <article><span>储备金额</span><strong>8.4 亿</strong><small>统一金额口径</small></article>
        <article><span>客观问题项目</span><strong>27</strong><small>规则事实</small></article>
        <article><span>需要人工判断</span><strong>7</strong><small>待业务确认</small></article>
        <article><span>经营观察</span><strong>43</strong><small>不直接判定问题</small></article>
      </div>
      <div className="product-dashboard-preview">
        <aside><div><span>CRM</span><strong>项目运营复盘</strong></div><button type="button" onClick={onStart}>选择 .xlsx 文件</button><p>CRM历史项目表.xlsx<br />150 条项目记录</p><small>数据来源标识</small><b>华东事业部 CRM</b><small>工作表</small><b>储备项目明细</b></aside>
        <main><h3>储备项目运营复盘助手</h3><p>规则发现问题，业务人员确认结论</p><section><div><small>智能识别完成</small><strong>数据已准备好 · 150 条项目</strong></div><button type="button" onClick={onStart}>进入真实工具</button></section><nav><span>分析总览</span><span>项目问题清单</span><span>复盘摘要</span></nav><div className="product-dashboard-panels"><article><h4>部门储备金额分布</h4><i style={{ '--bar': '88%' } as CSSProperties}><span>华东部</span><b>2.71亿</b></i><i style={{ '--bar': '64%' } as CSSProperties}><span>华南部</span><b>1.93亿</b></i><i style={{ '--bar': '47%' } as CSSProperties}><span>华北部</span><b>1.42亿</b></i></article><article><h4>销售经理储备金额分布</h4><i style={{ '--bar': '81%' } as CSSProperties}><span>销售甲</span><b>2.18亿</b></i><i style={{ '--bar': '68%' } as CSSProperties}><span>销售乙</span><b>1.83亿</b></i><i style={{ '--bar': '45%' } as CSSProperties}><span>销售丙</span><b>1.21亿</b></i></article><article><h4>本轮重点标签</h4><p>跟进维护超期<small>12 个项目</small></p><p>大额重点项目<small>9 个项目</small></p><p>签约日期待更新<small>8 个项目</small></p></article></div></main>
      </div>
    </section>

    <footer className="product-boundary" id="product-boundary">
      <div><p className="product-kicker">Product boundary</p><h2>把需要关注的事找出来，<br />把最终判断留给人</h2><p>CRM 始终是正式数据源。工具不修改原始 Excel，不回写 CRM，也不把 AI 推测当作业务事实。</p><button className="product-button product-button-primary" type="button" onClick={onStart}>开始分析 <ArrowUp size={16} /></button></div>
    </footer>
  </div>;
}
