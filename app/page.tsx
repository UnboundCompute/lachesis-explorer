'use client'

import { useMemo, useState } from 'react'

type Node = { id: string; kind: string; file: string; line: number; label: string; snippet: string }
type FlowStep = { node_id: string; role: string; note?: string; edge?: { alias?: boolean; dynamic?: boolean } }
type Hop = { node_id: string; edge_label: string; caption: string }

const nodes: Node[] = [
  { id: 'n_api_42', kind: 'assignment', file: 'handlers/api.py', line: 42, label: 'data = request.json["q"]', snippet: 'data = request.json["q"]' },
  { id: 'n_api_51', kind: 'call', file: 'handlers/api.py', line: 51, label: 'q = normalize(data)', snippet: 'q = normalize(data)' },
  { id: 'n_db_88', kind: 'call', file: 'db/query.py', line: 88, label: 'sql = build(q)', snippet: 'sql = build(q)' },
  { id: 'n_db_93', kind: 'sink', file: 'db/query.py', line: 93, label: 'cursor.execute(sql)', snippet: 'cursor.execute(sql)' },
  { id: 'n_route_12', kind: 'route', file: 'routes.py', line: 12, label: '@app.post("/api/search")', snippet: '@app.post("/api/search")' },
  { id: 'n_auth_30', kind: 'guard', file: 'mw/auth.py', line: 30, label: 'AuthMiddleware.process', snippet: 'token = request.headers.get("Authorization")' },
  { id: 'n_svc_70', kind: 'service', file: 'services/search.py', line: 70, label: 'run_query(q)', snippet: 'return repository.build_and_execute(q)' },
]
const flow: FlowStep[] = [
  { node_id: 'n_api_42', role: 'origin' },
  { node_id: 'n_api_51', role: 'transform', edge: { alias: true } },
  { node_id: 'n_db_88', role: 'transform' },
  { node_id: 'n_db_93', role: 'sink', edge: { dynamic: true } },
]
const hops: Hop[] = [
  { node_id: 'n_route_12', edge_label: 'route', caption: 'route — accepts POST /api/search' },
  { node_id: 'n_auth_30', edge_label: 'middleware', caption: 'guard — checks the request token' },
  { node_id: 'n_api_42', edge_label: 'handler', caption: 'handler — reads the query value' },
  { node_id: 'n_svc_70', edge_label: 'service', caption: 'service — delegates query execution' },
  { node_id: 'n_db_88', edge_label: 'repository', caption: 'repository — builds the statement' },
]

function Icon({ children }: { children: string }) { return <span className="icon" aria-hidden="true">{children}</span> }
function CodeBlock({ children }: { children: string }) { return <pre className="code-block"><code>{children}</code><button className="copy-button" aria-label="Copy code">copy</button></pre> }

export default function Page() {
  const [view, setView] = useState<'trace' | 'journey' | 'install'>('trace')
  const [direction, setDirection] = useState<'backward' | 'forward'>('backward')
  const [selectedNode, setSelectedNode] = useState('n_api_51')
  const [selectedHop, setSelectedHop] = useState('n_api_42')
  const [query, setQuery] = useState('')
  const visibleNodes = useMemo(() => nodes.filter((node) => `${node.file} ${node.label}`.toLowerCase().includes(query.toLowerCase())), [query])
  const selected = nodes.find((node) => node.id === (view === 'trace' ? selectedNode : selectedHop)) ?? nodes[0]

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span /><span /><span /></div><span>Lachesis</span><small>GRAPH READER</small></div>
      <nav className="nav-tabs" aria-label="Demo views">{(['trace', 'journey', 'install'] as const).map((item) => <button key={item} className={view === item ? 'nav-tab active' : 'nav-tab'} onClick={() => setView(item)}>{item === 'trace' ? 'Trace' : item === 'journey' ? 'Journey' : 'Install'}{view === item && <i />}</button>)}</nav>
      <div className="repo-control"><span className="status-dot" /> <span>example/webapp</span><span className="chevron">⌄</span></div>
    </header>

    <section className="intro"><div><p className="eyebrow">DETERMINISTIC CODE UNDERSTANDING</p><h1>{view === 'trace' ? 'Follow a value through the graph.' : view === 'journey' ? 'Walk one request, end to end.' : 'Put the reader on your codebase.'}</h1><p className="lede">{view === 'trace' ? 'See exactly where data comes from and where it goes — across aliases, calls, and indirection.' : view === 'journey' ? 'A focused call path answers how the code actually works, hop by hop.' : 'Lachesis is a deterministic code-graph MCP. This demo is its cached output.'}</p></div><div className="commit"><span>CURATED REPOSITORY</span><strong>python · a1b2c3d</strong></div></section>

    {view === 'trace' && <section className="workspace trace-workspace">
      <aside className="sidebar"><div className="panel-label">TRACE A VALUE</div><div className="search"><Icon>⌕</Icon><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files or symbols" /></div><div className="node-list">{visibleNodes.map((node) => <button key={node.id} className={selectedNode === node.id ? 'node-row selected' : 'node-row'} onClick={() => setSelectedNode(node.id)}><span className={`kind-dot ${node.kind}`} /><span><b>{node.label}</b><small>{node.file}:{node.line}</small></span></button>)}</div><div className="sidebar-foot"><span className="tiny-dot" /> 18432 lines indexed</div></aside>
      <div className="main-panel"><div className="toolbar"><div><span className="panel-label">VALUE FLOW</span><h2><code>user_input</code></h2></div><div className="segmented"><button className={direction === 'backward' ? 'selected' : ''} onClick={() => setDirection('backward')}>← comes from</button><button className={direction === 'forward' ? 'selected' : ''} onClick={() => setDirection('forward')}>goes to →</button></div></div><div className="flow-list">{(direction === 'backward' ? flow : [...flow].reverse()).map((step, index) => { const node = nodes.find((n) => n.id === step.node_id)!; return <button className={selectedNode === node.id ? 'flow-step current' : 'flow-step'} key={node.id} onClick={() => setSelectedNode(node.id)}><span className="flow-marker"><span>{index === 0 || index === flow.length - 1 ? '●' : '○'}</span>{index < flow.length - 1 && <i />}</span><span className="flow-content"><span className="flow-meta"><b>{step.role}</b><em>{node.file}:{node.line}</em>{step.edge?.alias && <label>alias</label>}{step.edge?.dynamic && <label>dynamic</label>}</span><strong>{node.snippet}</strong></span><span className="arrow">↗</span></button> })}</div><div className="evidence"><div className="evidence-head"><span className="mcp-icon">◈</span><span><b>Reader evidence</b><small>MCP query · deterministic result</small></span><span className="evidence-ok">PATH FOUND</span></div><div className="evidence-query"><code>reaches</code><span>(</span><strong>user_input</strong><span> → </span><strong>cursor.execute</strong><span>)</span><i>4 hops</i></div></div></div>
      <aside className="detail-panel"><div className="panel-label">SOURCE LOCATION</div><div className="detail-title"><strong>{selected.file}</strong><span>line {selected.line}</span></div><div className="source-card"><div className="line-number">{selected.line}</div><code>{selected.snippet}</code></div><div className="detail-note"><span>◌</span><p>This step is part of the <b>user_input</b> flow. Select any step to inspect its source location.</p></div></aside>
    </section>}

    {view === 'journey' && <section className="journey-layout"><aside className="journey-rail"><div className="panel-label">ENTRY POINT</div><button className="entry-select"><span className="route-icon">↗</span><span><b>POST /api/search</b><small>routes.py:12</small></span><span>⌄</span></button><div className="panel-label hops-label">REQUEST HOPS <span>5</span></div>{hops.map((hop, i) => { const node = nodes.find(n => n.id === hop.node_id)!; return <button key={hop.node_id} className={selectedHop === hop.node_id ? 'hop-row selected' : 'hop-row'} onClick={() => setSelectedHop(hop.node_id)}><span className="hop-index">0{i + 1}</span><span><b>{hop.edge_label}</b><small>{node.file}:{node.line}</small></span></button> })}</aside><div className="journey-main"><div className="journey-heading"><div><span className="panel-label">FOCUSED CALL GRAPH</span><h2>One request. Five hops.</h2></div><span className="precomputed">● PRECOMPUTED LAYOUT</span></div><div className="graph-card"><svg viewBox="0 0 720 220" role="img" aria-label="Focused call graph from route to repository"><path className="graph-line" d="M95 110 H205 M265 110 H375 M435 110 H545 M605 110 H680" />{hops.map((hop, i) => { const active = selectedHop === hop.node_id; const x = 65 + i * 130; return <g key={hop.node_id} onClick={() => setSelectedHop(hop.node_id)} className="graph-node"><circle cx={x} cy="110" r="27" className={active ? 'graph-circle active' : 'graph-circle'} /><text x={x} y="106" textAnchor="middle">{String(i + 1).padStart(2, '0')}</text><text x={x} y="154" textAnchor="middle" className="graph-label">{hop.edge_label}</text></g> })}</svg></div><div className="hop-detail"><span className="hop-big">{String(hops.findIndex(h => h.node_id === selectedHop) + 1).padStart(2, '0')}</span><div><span className="panel-label">{hops.find(h => h.node_id === selectedHop)?.edge_label}</span><h3>{selected.label}</h3><p>{hops.find(h => h.node_id === selectedHop)?.caption}</p></div><div className="source-mini"><span>{selected.file}:{selected.line}</span><code>{selected.snippet}</code></div></div></div></section>}

    {view === 'install' && <section className="install-layout"><div className="install-copy"><span className="install-glyph">⌁</span><span className="panel-label">THE READER, ON YOUR MACHINE</span><h2>Trace your own codebase.</h2><p>Run the Lachesis CLI locally. It emits the same bundle this demo renders — no server, no model, no guessing.</p><a className="primary-button" href="https://github.com" target="_blank" rel="noreferrer">View the open source repo <span>↗</span></a></div><div className="install-code"><span className="code-label">INSTALL</span><CodeBlock>{'npx lachesis init\nlachesis trace --repo . --out bundle.json'}</CodeBlock><span className="code-label">MCP CONFIG</span><CodeBlock>{'{\n  "mcpServers": {\n    "lachesis": {\n      "command": "npx",\n      "args": ["lachesis-mcp"]\n    }\n  }\n}'}</CodeBlock></div></section>}

    <footer><span><i className="status-dot" /> Curated repos show the reader&apos;s real output, cached.</span><span>Trace-your-own runs locally. <b>No model in the loop.</b></span><span className="footer-brand">Lachesis · graph reader</span></footer>
  </main>
}
