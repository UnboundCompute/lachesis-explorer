import type { Evidence } from '../lib/lachesis'
import { Icon } from './Icon'

type Props={evidence?:Evidence;fallbackTool:string;fallbackArgs:string;fallbackSummary:string;nodeCount:number;indirections?:number}
const labels:Record<string,string>={lead:'Lead · review needed',inconclusive:'Inconclusive',refuted:'Refuted by guard',verified:'Verified evidence'}

export function EvidencePanel({evidence,fallbackTool,fallbackArgs,fallbackSummary,nodeCount,indirections}:Props){
  const grounded=Boolean(evidence)
  const status=evidence?.status??(evidence?.confidence==='exact'?'verified':'lead')
  const limitations=evidence?.limitations??[]
  const guard=evidence?.guards
  return <section className={`evidence-panel ${grounded?'grounded':'derived'} evidence-${status}`}>
    <div className="evidence-head"><span className="evidence-symbol"><Icon name="spark" size={15}/></span><div><b>Evidence capsule</b><small>{grounded?'Reported by the loaded bundle':'Calculated from visible path metadata'}</small></div><span className="evidence-status"><i/>{labels[status]??status}</span></div>
    <div className="evidence-command"><code>{evidence?.verb||fallbackTool}</code><span>(</span><code>{evidence?.args||fallbackArgs}</code><span>)</span></div>
    <p className="evidence-result">{evidence?.result_summary||fallbackSummary}</p>
    <dl className="evidence-metrics"><div><dt>Confidence</dt><dd>{evidence?.confidence??(grounded?'bundle':'derived')}</dd></div><div><dt>Nodes</dt><dd>{evidence?.nodes??nodeCount}</dd></div>{indirections!==undefined&&<div><dt>Indirections</dt><dd>{evidence?.indirections??indirections}</dd></div>}<div><dt>Origin</dt><dd>{evidence?.origin||(grounded?'bundle':'derived')}</dd></div></dl>
    {(guard?.note||limitations.length>0)&&<div className="evidence-boundaries">{guard?.note&&<div><span className={`boundary-mark guard-${guard.verdict??'unknown'}`}/><p><b>Guard evidence · {guard.verdict?.replace('-', ' ')??'reported'}</b>{guard.note}</p></div>}{limitations.map(limit=><div key={limit}><span className="boundary-mark limit"/><p><b>Known limitation</b>{limit}</p></div>)}</div>}
  </section>
}
