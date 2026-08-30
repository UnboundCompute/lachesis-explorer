import type { App } from '../lib/lachesis'

type Props={app:App;view:string;flowId:string;stepId:string;stepIndex?:number;entryIndex:number;hopId:string;hopIndex?:number;sinkId:string}
export function InvestigationContext({app,view,flowId,stepId,stepIndex=0,entryIndex,hopId,hopIndex=0,sinkId}:Props){
  if(view==='home')return null
  const flow=app.flows.find(item=>item.id===flowId),step=app.nodes.find(item=>item.id===stepId),entry=app.entries[entryIndex],hop=app.nodes.find(item=>item.id===hopId),sink=app.nodes.find(item=>item.id===sinkId)
  const parts=view==='trace'?[['FLOW',flow?.name],['STEP',`${stepIndex+1}/${flow?.steps.length??0} · ${step?.label||step?.id}`]]:view==='journey'?[['ENTRY',entry?.label],['HOP',`${hopIndex+1}/${entry?.hops.length??0} · ${hop?.label||hop?.id}`]]:view==='investigate'?[['SINK',sink?.label||sink?.id]]:[[view.toUpperCase(),'Workspace']]
  return <div className="investigation-context" aria-label="Current investigation context"><span className="context-home">{app.name||'Untitled bundle'}</span>{parts.map(([label,value])=><span key={label} className="context-crumb"><i>／</i><small>{label}</small><b>{value||'—'}</b></span>)}</div>
}
