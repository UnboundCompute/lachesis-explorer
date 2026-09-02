import type { Evidence } from '../lib/lachesis'
import { Icon } from './Icon'

type Props={evidence?:Evidence;fallbackTool:string;fallbackArgs:string;fallbackSummary:string;nodeCount:number;indirections?:number;variant?:'evidence'|'path'}
const labels:Record<string,string>={lead:'Lead · review needed',reported:'Reported evidence',inconclusive:'Inconclusive',refuted:'Refuted by guard',verified:'Verified evidence'}

export function EvidencePanel({evidence,fallbackTool,fallbackArgs,fallbackSummary,nodeCount,indirections,variant='evidence'}:Props){
  const isPath = variant === 'path'
  const grounded=Boolean(evidence)
  const commandName = isPath ? 'trace' : evidence?.verb || fallbackTool
  const commandArgs = isPath ? fallbackArgs : evidence?.args || fallbackArgs
  const status=evidence?.status??(grounded?'reported':evidence?.confidence==='exact'?'verified':'lead')
  const limitations=evidence?.limitations??[]
  const guard=evidence?.guards
  const resolution=status==='inconclusive'
    ? limitations.some(item=>/dynamic|indirect|unknown/i.test(item))
      ? 'Confirm the unresolved target or runtime edge, then rerun the projection.'
      : 'Add the missing supporting evidence before treating this path as a conclusion.'
    : status==='refuted'
      ? 'Keep this path as a counter-signal and compare it with the guard evidence above.'
      : status==='lead'
        ? 'Inspect the source and boundary before making a claim about this path.'
        : undefined
  const statusLabel = isPath ? (grounded ? 'Bundle context' : 'Path summary') : labels[status] ?? status
  return <section className={`evidence-panel ${grounded?'grounded':'derived'} evidence-${status}${isPath?' path-context':''}`}>
    <div className="evidence-head"><span className="evidence-symbol"><Icon name={isPath ? 'code' : 'spark'} size={15}/></span><div><b>{isPath ? 'Path context' : 'Evidence capsule'}</b><small>{grounded?'Reported by the loaded bundle':isPath?'Calculated from the visible graph path':'Calculated from visible path metadata'}</small></div><span className="evidence-status"><i/>{statusLabel}</span></div>
    <div className="evidence-command"><code>{commandName}</code><span>(</span><code>{commandArgs}</code><span>)</span></div>
    <p className="evidence-result">{evidence?.result_summary||fallbackSummary}</p>
    <dl className="evidence-metrics"><div><dt>{isPath?'Basis':'Confidence'}</dt><dd>{evidence?.confidence??(grounded?'bundle':'derived')}</dd></div><div><dt>{isPath?'Symbols':'Nodes'}</dt><dd>{evidence?.nodes??nodeCount}</dd></div>{indirections!==undefined&&<div><dt>{isPath?'Path links':'Indirections'}</dt><dd>{evidence?.indirections??indirections}</dd></div>}<div><dt>Origin</dt><dd>{evidence?.origin||(grounded?'bundle':'derived')}</dd></div></dl>
    {!isPath&&resolution&&<div className={`evidence-next next-${status}`}><span><Icon name="target" size={12}/><b>Next resolving check</b></span><p>{resolution}</p></div>}
    {(guard?.note||limitations.length>0)&&<div className="evidence-boundaries">{guard?.note&&<div><span className={`boundary-mark guard-${guard.verdict??'unknown'}`}/><p><b>Guard evidence · {guard.verdict?.replace('-', ' ')??'reported'}</b>{guard.note}</p></div>}{limitations.map(limit=><div key={limit}><span className="boundary-mark limit"/><p><b>Known limitation</b>{limit}</p></div>)}</div>}
  </section>
}
