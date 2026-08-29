import type { Node } from '../lib/lachesis'

const descriptions:Record<string,string> = {sink:'Execution boundary or sensitive effect reached by this path.',route:'Request entrypoint represented in the code graph.',guard:'Control that checks identity, state, or authorization.',call:'A resolved call site connecting this path to another function.',service:'Application service participating in this request path.',assignment:'A value definition or reassignment in the flow.'}

export function NodeInspector({node}:{node:Node}) {
  return <aside className="detail-panel"><div className="inspector-heading"><span className={`kind-badge kind-${node.kind}`}><i/>{node.kind}</span><span className="node-identity">{node.id}</span></div><div className="inspector-source"><span className="panel-label">SOURCE LOCATION</span><h3>{node.file || 'Unknown file'}</h3><span className="line-number">line {node.line || '—'}</span><pre className="source-code"><code>{node.snippet || node.label || 'Source unavailable in this bundle.'}</code></pre></div><div className="detail-rule"/><span className="panel-label">WHAT THIS NODE MEANS</span><p className="detail-copy">{descriptions[node.kind]||'A node participating in the selected graph path.'}</p><dl className="node-facts"><div><dt>Kind</dt><dd>{node.kind}</dd></div><div><dt>Graph ID</dt><dd>{node.id}</dd></div></dl></aside>
}
