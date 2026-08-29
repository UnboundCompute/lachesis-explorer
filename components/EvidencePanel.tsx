import type { Evidence } from '../lib/lachesis'
import { Icon } from './Icon'

type Props = { evidence?:Evidence; fallbackTool:string; fallbackArgs:string; fallbackSummary:string; nodeCount:number; indirections?:number }
export function EvidencePanel({evidence,fallbackTool,fallbackArgs,fallbackSummary,nodeCount,indirections}:Props) {
  const grounded=Boolean(evidence); const confidence=evidence?.confidence||'bundle'; const status=grounded?(confidence==='exact'?'Exact evidence':'Bundle evidence'):'Derived summary'
  return <section className={`evidence-panel ${grounded?'grounded':'derived'}`}><div className="evidence-head"><span className="evidence-symbol"><Icon name="spark" size={15}/></span><div><b>Reader evidence</b><small>{grounded?'Reported by the loaded bundle':'Calculated from visible path metadata'}</small></div><span className="evidence-status"><i/>{status}</span></div><div className="evidence-command"><code>{evidence?.verb||fallbackTool}</code><span>(</span><code>{evidence?.args||fallbackArgs}</code><span>)</span></div><p className="evidence-result">{evidence?.result_summary||fallbackSummary}</p><dl className="evidence-metrics"><div><dt>Nodes</dt><dd>{evidence?.nodes??nodeCount}</dd></div>{indirections!==undefined&&<div><dt>Indirections</dt><dd>{evidence?.indirections??indirections}</dd></div>}{evidence?.hops!==undefined&&<div><dt>Hops</dt><dd>{evidence.hops}</dd></div>}<div><dt>Origin</dt><dd>{evidence?.origin|| (grounded?'bundle':'derived')}</dd></div></dl></section>
}
