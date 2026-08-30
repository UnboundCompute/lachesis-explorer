'use client'
import type { App } from '../lib/lachesis'

type Props={base:App;compare:App|null;onUpload:()=>void}
const ids=(values:{id:string}[])=>new Set(values.map(value=>value.id))
function delta(base:{id:string}[],next:{id:string}[]){const a=ids(base),b=ids(next);return {added:next.filter(item=>!a.has(item.id)),removed:base.filter(item=>!b.has(item.id))}}
export function CompareView({base,compare,onUpload}:Props){
  if(!compare)return <section className="compare-empty"><span className="context-kicker">REVISION DIFF</span><h2>Compare two evidence bundles.</h2><p>Load a second bundle to see added, removed, and changed graph evidence without replacing the active investigation.</p><button className="context-upload" onClick={onUpload}><span>Load comparison bundle</span><span>＋</span></button></section>
  const nodes=delta(base.nodes,compare.nodes),edges=delta(base.edges,compare.edges),flows=delta(base.flows,compare.flows),entries=delta(base.entries,compare.entries)
  const changedFlows=base.flows.filter(flow=>{const other=compare.flows.find(item=>item.id===flow.id);return other&&JSON.stringify(other.steps)!==JSON.stringify(flow.steps)})
  const groups=[['Nodes',nodes],['Relationships',edges],['Value flows',flows],['Request paths',entries]] as const
  return <section className="compare-workspace"><header className="compare-heading"><div><span className="context-kicker">REVISION DIFF</span><h2>{base.commit||'base'} <span>→</span> {compare.commit||'comparison'}</h2><p>Deterministic ID and step comparisons. A missing item means it is absent from that bundle, not necessarily deleted from source.</p></div><button className="secondary-button" onClick={onUpload}>Load another</button></header><div className="compare-summary"><div><span>BASE</span><b>{base.name}</b><small>{base.nodes.length} nodes · {base.flows.length} flows</small></div><div><span>COMPARISON</span><b>{compare.name}</b><small>{compare.nodes.length} nodes · {compare.flows.length} flows</small></div><div><span>CHANGED FLOWS</span><b>{changedFlows.length}</b><small>same ID, different step sequence</small></div></div><div className="compare-grid">{groups.map(([label,result])=><section key={label}><h3>{label}</h3><div className="diff-columns"><div><span className="diff-added">ADDED · {result.added.length}</span>{result.added.slice(0,8).map(item=><p key={item.id}>{item.id}</p>)}</div><div><span className="diff-removed">REMOVED · {result.removed.length}</span>{result.removed.slice(0,8).map(item=><p key={item.id}>{item.id}</p>)}</div></div></section>)}</div></section>
}
