import type { App } from '../lib/lachesis'

type Props={app:App;view:string;flowId:string;stepId:string;stepIndex?:number;entryIndex:number;hopId:string;hopIndex?:number;sinkId:string;focusNodeId?:string;onHome?:()=>void}
const viewNames: Record<string, string> = {
  trace: 'Trace',
  journey: 'Request flow',
  investigate: 'What reaches here',
  map: 'Explore',
  compare: 'Compare',
  install: 'Setup',
}
function pathContextLabel(kind?: string, security = false) {
  if (security) return 'SECURITY WITNESS'
  const normalized = kind?.trim().toLowerCase()
  if (normalized === 'value-flow' || normalized === 'valueflow') return 'VALUE PATH'
  if (normalized === 'call-path' || normalized === 'callpath') return 'CALL PATH'
  if (normalized === 'data-flow' || normalized === 'dataflow') return 'DATA FLOW'
  return 'GRAPH PATH'
}
function nodeContext(node?: App['nodes'][number]) {
  return node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository || ''
}
function nodeLocation(node?: App['nodes'][number]) {
  return node?.file ? `${node.file}:${node.line || '—'}` : ''
}
export function InvestigationContext({app,view,flowId,stepId,stepIndex=0,entryIndex,hopId,hopIndex=0,sinkId,focusNodeId,onHome}:Props){
  if(view==='home')return null
  const flow=app.flows.find(item=>item.id===flowId),step=app.nodes.find(item=>item.id===stepId),entry=app.entries[entryIndex],hop=app.nodes.find(item=>item.id===hopId),sink=app.nodes.find(item=>item.id===sinkId),focused=app.nodes.find(item=>item.id===focusNodeId)
  const withContext = (value: string | undefined, node?: App['nodes'][number]) => `${value||'—'}${nodeContext(node) ? ` · ${nodeContext(node)}` : ''}${nodeLocation(node) ? ` · ${nodeLocation(node)}` : ''}`
  const parts: Array<[string, string | undefined]> = view === 'trace'
    ? flow
      ? [[pathContextLabel(flow.kind, app.findings.some(item => item.id === flow.id)), flow.name], ['STEP', withContext(`${stepIndex + 1}/${flow.steps.length} · ${step?.label || step?.id}`, step)]]
      : [['TRACE', 'No graph path included']]
    : view === 'journey'
      ? entry?.hops?.length
        ? [['REQUEST FLOW', entry.label], ['STEP', withContext(`${hopIndex + 1}/${entry.hops.length} · ${hop?.label || hop?.id}`, hop)]]
        : [['REQUEST FLOW', 'No request flow included']]
      : view === 'investigate'
        ? [['DESTINATION', sink ? withContext(sink.label || sink.id, sink) : 'No destination selected']]
        : view === 'map'
          ? [['EXPLORE', focused ? withContext(focused.label || focused.id, focused) : 'Workspace']]
          : [[viewNames[view] || view, 'Workspace']]
  return <div className="investigation-context" aria-label="Current code exploration context" aria-live="polite" aria-atomic="true">{onHome ? <button type="button" className="context-home" onClick={onHome} title="Return to understanding home">{app.name||'Untitled bundle'}</button> : <span className="context-home">{app.name||'Untitled bundle'}</span>}{parts.map(([label,value])=><span key={label} className="context-crumb"><i>／</i><small>{label}</small><b title={value||'—'}>{value||'—'}</b></span>)}</div>
}
