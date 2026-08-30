'use client'
import { useState } from 'react'
import type { App, Node } from '../lib/lachesis'
import { Icon } from './Icon'
import { trackEvent } from '../lib/analytics'

const descriptions:Record<string,string>={sink:'Execution boundary or sensitive effect reached by this path.',route:'Request entrypoint represented in the code graph.',guard:'Control that checks identity, state, or authorization.',call:'A resolved call site connecting this path to another function.',service:'Application service participating in this request path.',assignment:'A value definition or reassignment in the flow.'}
type Props={node:Node;onClose:()=>void;app?:App}

export function NodeInspector({node,onClose,app}:Props){
  const [copied,setCopied]=useState(false)
  const location=`${node.file}:${node.line}`
  const flows=app?.flows.filter(flow=>flow.steps.some(step=>step.node_id===node.id))??[]
  const entries=app?.entries.filter(entry=>entry.hops.some(hop=>hop.node_id===node.id))??[]
  const relationships=app?.edges.filter(edge=>edge.source===node.id||edge.target===node.id)??[]
  async function copyLocation(){await navigator.clipboard?.writeText(location);setCopied(true);trackEvent('source_location_copied');window.setTimeout(()=>setCopied(false),1200)}
  return <aside className="detail-panel"><div className="inspector-heading"><span className={`kind-badge kind-${node.kind}`}><i/>{node.kind}</span><span className="node-identity">{node.id}</span><button className="inspector-close" onClick={onClose} aria-label="Close source inspector"><Icon name="close" size={13}/></button></div><div className="inspector-source"><span className="panel-label">SOURCE LOCATION</span><h3>{node.file||'Unknown file'}</h3><div className="location-row"><span className="line-number">line {node.line||'—'}</span><button onClick={copyLocation} aria-label="Copy source location"><Icon name="code" size={12}/>{copied?'Copied':'Copy'}</button></div><pre className="source-code"><code>{node.snippet||node.label||'Source unavailable in this bundle.'}</code></pre></div><div className="detail-rule"/><span className="panel-label">WHAT THIS NODE MEANS</span><p className="detail-copy">{descriptions[node.kind]||'A node participating in the selected graph path.'}</p>{app&&<><div className="detail-rule"/><span className="panel-label">WHY IT IS INCLUDED</span><p className="detail-copy">This node is present in {flows.length} value flow{flows.length===1?'':'s'}, {entries.length} request path{entries.length===1?'':'s'}, and {relationships.length} normalized relationship{relationships.length===1?'':'s'} in this bundle.</p><div className="inspector-context"><span className="panel-label">CONNECTED EVIDENCE</span>{flows.length>0&&<div><small>VALUE FLOWS</small>{flows.slice(0,4).map(flow=><span key={flow.id}>{flow.name}</span>)}</div>}{entries.length>0&&<div><small>REQUEST PATHS</small>{entries.slice(0,4).map(entry=><span key={entry.id}>{entry.label}</span>)}</div>}{relationships.length>0&&<div><small>RELATIONSHIPS</small>{relationships.slice(0,4).map(edge=><span key={edge.id}>{edge.source===node.id?'→':'←'} {edge.relation||edge.alias||'connected'}{edge.dynamic?' · dynamic':''}</span>)}</div>}{!flows.length&&!entries.length&&!relationships.length&&<p>No connected evidence records in this bundle.</p>}</div></>}<dl className="node-facts"><div><dt>Kind</dt><dd>{node.kind}</dd></div><div><dt>Graph ID</dt><dd>{node.id}</dd></div>{app&&<><div><dt>Value flows</dt><dd>{flows.length}</dd></div><div><dt>Request paths</dt><dd>{entries.length}</dd></div></>}</dl></aside>
}
