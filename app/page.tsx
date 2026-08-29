'use client'

import { useMemo, useState } from 'react'

type Node = { id: string; kind: string; file: string; line: number; label: string; snippet: string }
type Flow = { id: string; name: string; steps: { node_id: string; role: string; note?: string; edge?: { alias?: boolean; dynamic?: boolean } }[] }
type Hop = { node_id: string; edge_label: string; caption: string }

const repos = [
  { name: 'example/webapp', language: 'python', commit: 'a1b2c3d' },
  { name: 'acme/checkout', language: 'typescript', commit: '7e91c4a' },
  { name: 'data-lab/ingest', language: 'javascript', commit: 'f02d88b' },
]
const nodes: Node[] = [
  { id: 'n_api_42', kind: 'assignment', file: 'handlers/api.py', line: 42, label: 'data = request.json["q"]', snippet: 'data = request.json["q"]' },
  { id: 'n_api_51', kind: 'call', file: 'handlers/api.py', line: 51, label: 'q = normalize(data)', snippet: 'q = normalize(data)' },
  { id: 'n_db_88', kind: 'call', file: 'db/query.py', line: 88, label: 'sql = build(q)', snippet: 'sql = build(q)' },
  { id: 'n_db_93', kind: 'sink', file: 'db/query.py', line: 93, label: 'cursor.execute(sql)', snippet: 'cursor.execute(sql)' },
  { id: 'n_route_12', kind: 'route', file: 'routes.py', line: 12, label: '@app.post("/api/search")', snippet: '@app.post("/api/search")' },
  { id: 'n_auth_30', kind: 'guard', file: 'mw/auth.py', line: 30, label: 'AuthMiddleware.process', snippet: 'token = request.headers.get("Authorization")' },
  { id: 'n_svc_70', kind: 'service', file: 'services/search.py', line: 70, label: 'run_query(q)', snippet: 'return repository.build_and_execute(q)' },
  { id: 'n_cache_18', kind: 'assignment', file: 'cache/keys.ts', line: 18, label: 'key = hash(query)', snippet: 'const key = hash(query)' },
]
const flows: Flow[] = [
  { id: 'user_input', name: 'user_input', steps: [
    { node_id: 'n_api_42', role: 'origin' }, { node_id: 'n_api_51', role: 'transform', edge: { alias: true } }, { node_id: 'n_db_88', role: 'transform' }, { node_id: 'n_db_93', role: 'sink', edge: { dynamic: true } },
  ] },
  { id: 'normalized_query', name: 'normalized_query', steps: [
    { node_id: 'n_api_51', role: 'origin' }, { node_id: 'n_svc_70', role: 'call', edge: { alias: true } }, { node_id: 'n_db_88', role: 'transform' }, { node_id: 'n_db_93', role: 'sink' },
  ] },
  { id: 'sql_statement', name: 'sql_statement', steps: [
    { node_id: 'n_db_88', role: 'origin' }, { node_id: 'n_db_93', role: 'sink', edge: { dynamic: true } },
  ] },
  { id: 'cache_key', name: 'cache_key', steps: [
    { node_id: 'n_api_51', role: 'origin' }, { node_id: 'n_cache_18', role: 'transform' },
  ] },
]
const entries = [
  { label: 'POST /api/search', file: 'routes.py:12', hops: [
    { node_id: 'n_route_12', edge_label: 'route', caption: 'route — accepts POST /api/search' }, { node_id: 'n_auth_30', edge_label: 'middleware', caption: 'guard — checks the request token' }, { node_id: 'n_api_42', edge_label: 'handler', caption: 'handler — reads the query value' }, { node_id: 'n_svc_70', edge_label: 'service', caption: 'service — delegates query execution' }, { node_id: 'n_db_88', edge_label: 'repository', caption: 'repository — builds the statement' },
  ] },
  { label: 'GET /api/suggestions', file: 'routes.py:28', hops: [
    { node_id: 'n_route_12', edge_label: 'route', caption: 'route — accepts GET /api/suggestions' }, { node_id: 'n_auth_30', edge_label: 'middleware', caption: 'guard — checks the request token' }, { node_id: 'n_api_51', edge_label: 'handler', caption: 'handler — normalizes the query' }, { node_id: 'n_cache_18', edge_label: 'cache', caption: 'cache — derives a stable lookup key' },
  ] },
]
function Icon({ children }: { children: string }) { return <span className="icon" aria-hidden="true">{children}</span> }
function CodeBlock({ children }: { children: string }) { return <pre className="code-block"><code>{children}</code><button className="copy-button" aria-label="Copy code">copy</button></pre> }

export default function Page() {
  const [view, setView] = useState<'trace' | 'journey' | 'install'>('trace')
  const [direction, setDirection] = useState<'backward' | 'forward'>('backward')
  const [flowId, setFlowId] = useState('user_input')
  const [stepId, setStepId] = useState('n_api_42')
  const [entryIndex, setEntryIndex] = useState(0)
  const [hopId, setHopId] = useState('n_api_42')
  const [query, setQuery] = useState('')
  const flow = flows.find((item) => item.id === flowId) ?? flows[0]
  const entry = entries[entryIndex]
  const visibleFlows = useMemo(() => flows.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [query])
  const selected = nodes.find((node) => node.id === stepId) ?? nodes[0]
  const traceSteps = direction === 'backward' ? flow.steps : [...flow.steps].reverse()
  const selectedHop = nodes.find((node) => node.id === hopId) ?? nodes[0]

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><span /><span /><span /></div><span>Lachesis</span><small>GRAPH READER</small></div><nav className="nav-tabs" aria-label="Demo views">{(['trace', 'journey', 'install'] as const).map((item) => <button key={item} className={view === item ? 'nav-tab active' : 'nav-tab'} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}{view === item && <i />}</button>)}</nav><button className="repo-control" aria-label="Choose repository"><span className="status-dot" /><span>{repos[0].name}</span><span className="chevron">⌄</span></button></header>
    <section className="intro"><div><p className="eyebrow">DETERMINISTIC CODE UNDERSTANDING</p><h1>{view === 'trace' ? 'Follow a value through the graph.' : view === 'journey' ? 'Walk one request, end to end.' : 'Put the reader on your codebase.'}</h1><p className="lede">{view === 'trace' ? 'See exactly where data comes from and where it goes — across aliases, calls, and indirection.' : view === 'journey' ? 'A focused call path answers how the code actually works, hop by hop.' : 'Lachesis is a deterministic code-graph MCP. This demo is its cached output.'}</p></div><div className="commit"><span>CURATED REPOSITORY</span><strong>{repos[0].language} · {repos[0].commit}</strong><span>{repos.length} cached bundles · 3 languages</span></div></section>
    {view === 'trace' && <section className="workspace trace-workspace"><aside className="sidebar"><div className="panel-label">TRACE A VALUE</div><div className="search"><Icon>⌕</Icon><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search values or symbols" aria-label="Search values or symbols" /></div><div className="node-list">{visibleFlows.map((item) => <button key={item.id} className={flowId === item.id ? 'node-row selected' : 'node-row'} onClick={() => { setFlowId(item.id); setStepId(item.steps[0].node_id) }}><span className="kind-dot" /><span><b>{item.name}</b><small>{item.steps.length} reachable steps</small></span></button>)}</div><div className="sidebar-foot"><span className="tiny-dot" /> 18432 lines indexed</div></aside><div className="main-panel"><div className="toolbar"><div><span className="panel-label">VALUE FLOW</span><h2><code>{flow.name}</code></h2></div><div className="segmented"><button className={direction === 'backward' ? 'selected' : ''} onClick={() => setDirection('backward')}>← comes from</button><button className={direction === 'forward' ? 'selected' : ''} onClick={() => setDirection('forward')}>goes to →</button></div></div><div className="flow-list">{traceSteps.map((step, index) => { const node = nodes.find((n) => n.id === step.node_id)!; return <button className={stepId === node.id ? 'flow-step current' : 'flow-step'} key={node.id} onClick={() => setStepId(node.id)}><span className="flow-marker"><span>{index === 0 || index === traceSteps.length - 1 ? '●' : '○'}</span>{index < traceSteps.length - 1 && <i />}</span><span className="flow-content"><span className="flow-meta"><b>{step.role}</b><em>{node.file}:{node.line}</em>{step.edge?.alias && <label>alias</label>}{step.edge?.dynamic && <label>dynamic</label>}</span><strong>{node.snippet}</strong></span><span className="arrow">↗</span></button> })}</div><div className="evidence"><div className="evidence-head"><span className="mcp-icon">◈</span><span><b>Reader evidence</b><small>MCP query · deterministic result</small></span><span className="evidence-ok">PATH FOUND</span></div><div className="evidence-query"><code>reaches</code><span>(</span><strong>{flow.name}</strong><span> → </span><strong>{traceSteps[traceSteps.length - 1] ? nodes.find((n) => n.id === traceSteps[traceSteps.length - 1].node_id)?.label : 'sink'}</strong><span>)</span><i>{traceSteps.length} hops</i></div></div></div><aside className="detail-panel"><div className="panel-label">SOURCE LOCATION</div><div className="detail-title"><strong>{selected.file}</strong><span>line {selected.line}</span></div><div className="source-card"><div className="line-number">{selected.line}</div><code>{selected.snippet}</code></div><div className="detail-note"><span>◌</span><p>This step is part of the <b>{flow.name}</b> flow. Select a center step to inspect its source location.</p></div></aside></section>}
    {view === 'journey' && <section className="journey-layout"><aside className="journey-rail"><div className="panel-label">ENTRY POINT</div><select className="entry-select" value={entryIndex} onChange={(e) => { const next = Number(e.target.value); setEntryIndex(next); setHopId(entries[next].hops[0].node_id) }}>{entries.map((item, i) => <option value={i} key={item.label}>{item.label} · {item.file}</option>)}</select><div className="panel-label hops-label">REQUEST HOPS <span>{entry.hops.length}</span></div>{entry.hops.map((hop, i) => { const node = nodes.find(n => n.id === hop.node_id)!; return <button key={`${entryIndex}-${hop.node_id}-${i}`} className={hopId === hop.node_id ? 'hop-row selected' : 'hop-row'} onClick={() => setHopId(hop.node_id)}><span className="hop-index">0{i + 1}</span><span><b>{hop.edge_label}</b><small>{hop.caption}</small></span></button> })}</aside><div className="journey-main"><div className="journey-heading"><div><span className="panel-label">FOCUSED CALL GRAPH</span><h2>One request. {entry.hops.length} hops.</h2></div><span className="precomputed">● PRECOMPUTED LAYOUT</span></div><div className="graph-card"><svg viewBox="0 0 720 220" role="img" aria-label="Focused call graph">{entry.hops.slice(0, -1).map((_, i) => <path key={i} className="graph-line" d={`M${95 + i * 130} 110 H${205 + i * 130}`} />)}{entry.hops.map((hop, i) => { const active = hopId === hop.node_id; const x = 65 + i * (650 / Math.max(1, entry.hops.length - 1)); return <g key={`${hop.node_id}-${i}`} onClick={() => setHopId(hop.node_id)} className="graph-node"><circle cx={x} cy="110" r="27" className={active ? 'graph-circle active' : 'graph-circle'} /><text x={x} y="106" textAnchor="middle">{String(i + 1).padStart(2, '0')}</text><text x={x} y="154" textAnchor="middle" className="graph-label">{hop.edge_label}</text></g> })}</svg></div><div className="evidence"><div className="evidence-head"><span className="mcp-icon">◈</span><span><b>Reader evidence</b><small>MCP query · deterministic result</small></span><span className="evidence-ok">PATH FOUND</span></div><div className="evidence-query"><code>callpath</code><span>(</span><strong>{entry.label}</strong><span>)</span><i>{entry.hops.length} hops</i></div></div><div className="hop-detail"><span className="hop-big">{String(entry.hops.findIndex(h => h.node_id === hopId) + 1).padStart(2, '0')}</span><div><span className="panel-label">{entry.hops.find(h => h.node_id === hopId)?.edge_label}</span><h3>{selectedHop.label}</h3><p>{entry.hops.find(h => h.node_id === hopId)?.caption}</p></div><div className="source-mini"><span>{selectedHop.file}</span><b>line {selectedHop.line}</b></div></div></div></section>}
    {view === 'install' && <section className="install-layout"><div className="install-copy"><span className="install-glyph">⌁</span><span className="panel-label">THE READER, ON YOUR MACHINE</span><h2>Trace your own codebase.</h2><p>Run the Lachesis CLI locally. It emits the same bundle this demo renders — no server, no model, no guessing.</p><a className="primary-button" href="https://github.com" target="_blank" rel="noreferrer">View the open source repo <span>↗</span></a></div><div className="install-code"><span className="code-label">INSTALL</span><CodeBlock>{'npx lachesis init\nlachesis trace --repo . --out bundle.json'}</CodeBlock><span className="code-label">MCP CONFIG</span><CodeBlock>{'{\n  "mcpServers": {\n    "lachesis": {\n      "command": "npx",\n      "args": ["lachesis-mcp"]\n    }\n  }\n}'}</CodeBlock></div></section>}
    <footer><span><i className="status-dot" /> Curated repos show the reader&apos;s real output, cached.</span><span>Trace-your-own runs locally. <b>No model in the loop.</b></span><span className="footer-brand">Lachesis · graph reader</span></footer>
  </main>
}
