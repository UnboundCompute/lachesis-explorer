import demoBundle from '../public/demo-bundle.json'

export type Node = { id: string; kind: string; file: string; line: number; column?: number; label: string; snippet: string }
export type Step = { node_id: string; role: string; note?: string; edge?: { alias?: boolean; dynamic?: boolean } }
export type Flow = { id: string; name: string; steps: Step[] }
export type GuardEvidence = { verdict?: string; note?: string; items?: {node_id?:string;effect?:string}[] }
export type Evidence = { for: string; verb: string; args: string; result_summary: string; hops?: number; nodes?: number; node_ids?: string[]; indirections?: number; confidence?: string; origin?: string; status?: string; lifecycle?: string; limitations?: string[]; guards?: GuardEvidence }
export type LayoutPoint = { x: number; y: number }
export type Hop = { node_id: string; edge_label: string; caption: string; layout?: LayoutPoint }
export type Entry = { id: string; label: string; file: string; entry_node?: string; hops: Hop[]; hasLayout: boolean }
export type EdgeOrigin = 'bundle' | 'value-flow' | 'request-path'
export type GraphEdge = { id:string; source:string; target:string; relation:string; alias:boolean; dynamic:boolean; origins:EdgeOrigin[]; flow_ids:string[]; entry_ids:string[] }
export type BundleInfo = { format:string; schemaVersion:string; findingSchemaVersion?:string; projection?:string; engine?:string; catalog?:string; toolchain?:string; generatedAt?:string; fixture:boolean }
export type App = { name: string; language: string; commit: string; lines: number; nodes: Node[]; edges: GraphEdge[]; flows: Flow[]; entries: Entry[]; mcp: Evidence[]; bundle:BundleInfo }

function formatArgs(args: unknown) {
  if (typeof args === 'string') return args
  if (args == null) return ''
  if (typeof args === 'object') return Object.entries(args as Record<string, unknown>).map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ')
  return String(args)
}

function pointFor(rawLayout: unknown, nodeId: string, index: number): LayoutPoint | undefined {
  if (Array.isArray(rawLayout)) {
    const point = rawLayout.find((item: any) => String(item.node_id ?? item.nodeId ?? item.id ?? '') === nodeId) ?? rawLayout[index]
    return point && Number.isFinite(Number(point.x)) ? {x:Number(point.x), y:Number(point.y ?? 110)} : undefined
  }
  const point = rawLayout && typeof rawLayout === 'object' ? (rawLayout as Record<string, any>)[nodeId] : undefined
  return point && Number.isFinite(Number(point.x)) ? {x:Number(point.x), y:Number(point.y ?? 110)} : undefined
}

type EdgeSeed = Omit<GraphEdge,'id'|'origins'|'flow_ids'|'entry_ids'> & {origin:EdgeOrigin;flow_id?:string;entry_id?:string}

function normalizeEntries(rawPaths:unknown,nodes:Node[]):Entry[]{
  if(!Array.isArray(rawPaths))return []
  return rawPaths.map((e:any,i:number)=>{
    const rawHops=Array.isArray(e.hops)?e.hops:[]
    const entryNode=String(e.entry_node??e.entryNode??rawHops[0]?.node_id??'')
    const hops=rawHops.map((h:any,j:number)=>({node_id:String(h.node_id??h.nodeId??h.id??''),edge_label:String(h.edge_label??h.label??''),caption:String(h.caption??''),layout:pointFor(e.layout,String(h.node_id??h.nodeId??h.id??''),j)}))
    const firstNode=nodes.find(node=>node.id===entryNode)
    return {id:String(e.id??e.callpath_id??`callpath_${i}`),label:String(e.entry??e.label??''),file:firstNode?`${firstNode.file}:${firstNode.line}`:'',entry_node:entryNode,hops,hasLayout:hops.length>0&&hops.every((hop:Hop)=>hop.layout!==undefined)}
  })
}

export function deriveGraphEdges(explicit:EdgeSeed[], flows:Flow[], entries:Entry[]): GraphEdge[] {
  const collected = new Map<string,GraphEdge>()
  function include(seed:EdgeSeed) {
    if (!seed.source || !seed.target) return
    const key=[seed.source,seed.target,seed.relation,seed.alias?'alias':'exact',seed.dynamic?'dynamic':'static'].join('|')
    const current=collected.get(key)
    if(current){if(!current.origins.includes(seed.origin))current.origins.push(seed.origin);if(seed.flow_id&&!current.flow_ids.includes(seed.flow_id))current.flow_ids.push(seed.flow_id);if(seed.entry_id&&!current.entry_ids.includes(seed.entry_id))current.entry_ids.push(seed.entry_id);return}
    collected.set(key,{id:`edge_${collected.size+1}`,source:seed.source,target:seed.target,relation:seed.relation||'connects',alias:seed.alias,dynamic:seed.dynamic,origins:[seed.origin],flow_ids:seed.flow_id?[seed.flow_id]:[],entry_ids:seed.entry_id?[seed.entry_id]:[]})
  }
  explicit.forEach(include)
  flows.forEach(flow=>flow.steps.slice(1).forEach((step,index)=>include({source:flow.steps[index].node_id,target:step.node_id,relation:step.role||'flows to',alias:Boolean(step.edge?.alias),dynamic:Boolean(step.edge?.dynamic),origin:'value-flow',flow_id:flow.id})))
  entries.forEach(entry=>entry.hops.slice(1).forEach((hop,index)=>include({source:entry.hops[index].node_id,target:hop.node_id,relation:hop.edge_label||'calls',alias:false,dynamic:false,origin:'request-path',entry_id:entry.id})))
  return [...collected.values()]
}

export function normalize(raw: any): App {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Bundle must be a JSON object.')
  // bundle/1.0: findings are versioned envelopes. bundle/0.x (below) stays a
  // permissive adapter for the flow-centric prototype format.
  if (Array.isArray(raw.findings) || raw.format === 'lachesis-explorer-bundle') return normalizeBundleV1(raw)
  const source = raw.graph ?? raw
  if (!source || typeof source !== 'object') throw new Error('Expected a graph object in bundle.json.')
  const meta = raw.meta ?? source.meta ?? {}
  if (!Array.isArray(source.nodes)) throw new Error('Expected graph.nodes to be an array.')
  if (!Array.isArray(source.flows)) throw new Error('Expected graph.flows to be an array.')
  const nodes = source.nodes.map((n:any,i:number)=>({id:String(n.id??n.node_id??`node_${i}`),kind:String(n.kind??n.type??'node'),file:String(n.file??n.path??''),line:Number(n.line??n.start_line??0),column:n.column==null?undefined:Number(n.column),label:String(n.label??n.name??n.code??''),snippet:String(n.snippet??n.code??n.label??n.name??'')}))
  const flows = source.flows.map((f:any,i:number)=>{const id=String(f.id??`flow_${i}`);return {id,name:String(f.value??f.name??id),steps:Array.isArray(f.steps)?f.steps.map((s:any)=>({node_id:String(s.node_id??s.nodeId??s.node??''),role:String(s.role??'node'),note:s.note,edge:s.edge})) : []}})
  const entries=normalizeEntries(raw.callpaths??source.callpaths??[],nodes)
  const rawMcp = raw.mcp ?? source.mcp
  const mcp = Array.isArray(rawMcp) ? rawMcp.map((m:any)=>({for:String(m.for??m.flow??''),verb:String(m.tool??m.verb??''),args:formatArgs(m.args),result_summary:String(m.result_summary??''),hops:m.hops==null?undefined:Number(m.hops),nodes:m.nodes==null?undefined:Number(m.nodes),indirections:m.indirections==null?undefined:Number(m.indirections),confidence:m.confidence==null?undefined:String(m.confidence),origin:m.origin==null?undefined:String(m.origin)})) : []
  const rawEdges = Array.isArray(source.edges) ? source.edges : []
  const explicitEdges:EdgeSeed[] = rawEdges.map((edge:any)=>({source:String(edge.source??edge.from??edge.source_id??''),target:String(edge.target??edge.to??edge.target_id??''),relation:String(edge.relation??edge.kind??edge.type??edge.label??'connects'),alias:Boolean(edge.alias),dynamic:Boolean(edge.dynamic),origin:'bundle'}))
  if (!nodes.length) throw new Error('The bundle contains no graph nodes.')
  if (!flows.length) throw new Error('The bundle contains no value flows.')
  const ids = new Set(nodes.map((node:Node)=>node.id))
  if (ids.size !== nodes.length) throw new Error('The bundle contains duplicate node IDs.')
  const emptyFlow = flows.find((flow:Flow)=>flow.steps.length===0)
  if (emptyFlow) throw new Error(`Flow "${emptyFlow.name}" contains no steps.`)
  const brokenStep = flows.flatMap((flow:Flow)=>flow.steps).find((step:Step)=>!ids.has(step.node_id))
  if (brokenStep) throw new Error(`A flow references missing node "${brokenStep.node_id}".`)
  const brokenHop = entries.flatMap((entry:Entry)=>entry.hops).find((hop:Hop)=>!ids.has(hop.node_id))
  if (brokenHop) throw new Error(`A callpath references missing node "${brokenHop.node_id}".`)
  const brokenEdge = explicitEdges.find(edge=>!ids.has(edge.source)||!ids.has(edge.target))
  if (brokenEdge) throw new Error(`A graph edge references missing node "${!ids.has(brokenEdge.source)?brokenEdge.source:brokenEdge.target}".`)
  const edges=deriveGraphEdges(explicitEdges,flows,entries)
  return {name:String(meta.repo??''),language:String(meta.lang??meta.language??''),commit:String(meta.commit??''),lines:Number(meta.loc??meta.lines??0),nodes,edges,flows,entries,mcp,bundle:{format:'bundle/0.x',schemaVersion:String(raw.schema_version??'0.x'),generatedAt:meta.generated_at==null?undefined:String(meta.generated_at),fixture:Boolean(meta.fixture)}}
}

function normalizeBundleV1(raw: any): App {
  const graph = raw.graph ?? {}
  const manifest = raw.evidence_manifest ?? {}
  const meta = raw.meta ?? {}
  if (!Array.isArray(graph.nodes)) throw new Error('Expected graph.nodes to be an array.')
  if (!Array.isArray(raw.findings)) throw new Error('Expected findings to be an array.')
  const nodes:Node[] = graph.nodes.map((n:any,i:number)=>({id:String(n.id??n.node_id??`node_${i}`),kind:String(n.kind??n.type??'node'),file:String(n.file??n.path??''),line:Number(n.line??n.start_line??0),column:n.column==null?undefined:Number(n.column),label:String(n.label??n.name??n.code??''),snippet:String(n.snippet??n.code??n.label??n.name??'')}))
  const flows:Flow[] = raw.findings.map((f:any,i:number)=>{
    const id=String(f.finding_id??f.id??`finding_${i}`)
    const steps=Array.isArray(f.witness?.steps)?f.witness.steps.map((s:any)=>({node_id:String(s.node_id??s.nodeId??s.node??''),role:String(s.role??'node'),note:s.note,edge:s.edge})) : []
    const source=f.locations?.find((location:any)=>location.role==='source')?.symbol
    const sink=f.locations?.find((location:any)=>location.role==='sink')?.symbol
    return {id,name:String(f.display_name??f.name??((source&&sink)?`${source} → ${sink}`:sink??source??id)),steps}
  })
  const mcp:Evidence[] = raw.findings.map((f:any,i:number)=>{
    const id=String(f.finding_id??f.id??`finding_${i}`)
    const steps=Array.isArray(f.witness?.steps)?f.witness.steps:[]
    const node_ids=steps.map((s:any)=>String(s.node_id??s.nodeId??s.node??'')).filter(Boolean)
    const indirections=steps.filter((s:any)=>s.edge?.alias||s.edge?.dynamic).length
    const loc=(f.locations??[]).map((l:any)=>l.symbol?`${l.symbol}${l.file?` (${l.file}${l.line?`:${l.line}`:''})`:''}`:'').filter(Boolean).join(' · ')
    const status=f.status==null?undefined:String(f.status)
    const summary=status==='refuted'?'A bundled guard refutes this candidate path.':status==='inconclusive'?'The witness reaches the boundary, but unresolved evidence prevents a conclusion.':'A source-to-sink witness is present and ready for review.'
    return {for:id,verb:String(f.analysis?.projection??f.constructor??''),args:loc,result_summary:String(f.result_summary??f.objective??summary),nodes:node_ids.length,node_ids,indirections,confidence:f.analysis?.confidence==null?undefined:String(f.analysis.confidence),origin:f.constructor==null?'finding envelope':String(f.constructor),status,lifecycle:f.lifecycle_state==null?undefined:String(f.lifecycle_state),limitations:Array.isArray(f.analysis?.limitations)?f.analysis.limitations.map(String):undefined,guards:f.witness?.guards}
  })
  const entries=normalizeEntries(raw.callpaths??graph.callpaths??[],nodes)
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : []
  const explicitEdges:EdgeSeed[] = rawEdges.map((edge:any)=>({source:String(edge.source??edge.from??edge.source_id??''),target:String(edge.target??edge.to??edge.target_id??''),relation:String(edge.relation??edge.kind??edge.type??edge.label??'connects'),alias:Boolean(edge.alias),dynamic:Boolean(edge.dynamic),origin:'bundle'}))
  if (!nodes.length) throw new Error('The bundle contains no graph nodes.')
  if (!flows.length) throw new Error('The bundle contains no findings.')
  const ids = new Set(nodes.map((node:Node)=>node.id))
  if (ids.size !== nodes.length) throw new Error('The bundle contains duplicate node IDs.')
  const emptyFlow = flows.find((flow:Flow)=>flow.steps.length===0)
  if (emptyFlow) throw new Error(`Finding "${emptyFlow.name}" contains no witness steps.`)
  const brokenStep = flows.flatMap((flow:Flow)=>flow.steps).find((step:Step)=>!ids.has(step.node_id))
  if (brokenStep) throw new Error(`A finding references missing node "${brokenStep.node_id}".`)
  const brokenHop=entries.flatMap(entry=>entry.hops).find(hop=>!ids.has(hop.node_id))
  if(brokenHop)throw new Error(`A callpath references missing node "${brokenHop.node_id}".`)
  const brokenEdge = explicitEdges.find(edge=>!ids.has(edge.source)||!ids.has(edge.target))
  if (brokenEdge) throw new Error(`A graph edge references missing node "${!ids.has(brokenEdge.source)?brokenEdge.source:brokenEdge.target}".`)
  const edges=deriveGraphEdges(explicitEdges,flows,entries)
  return {name:String(meta.repo??manifest.repository??''),language:String(meta.lang??meta.language??''),commit:String(meta.commit??manifest.commit_sha??''),lines:Number(meta.loc??meta.lines??0),nodes,edges,flows,entries,mcp,bundle:{format:String(raw.format??'lachesis-explorer-bundle'),schemaVersion:String(raw.schema_version??'1.0'),findingSchemaVersion:manifest.finding_schema_version==null?undefined:String(manifest.finding_schema_version),projection:manifest.analysis_projection==null?undefined:String(manifest.analysis_projection),engine:manifest.engine_sha==null?undefined:String(manifest.engine_sha),catalog:manifest.catalog_sha==null?undefined:String(manifest.catalog_sha),toolchain:manifest.toolchain_fingerprint==null?undefined:String(manifest.toolchain_fingerprint),generatedAt:meta.generated_at==null?undefined:String(meta.generated_at),fixture:Boolean(meta.fixture)}}
}

export function indirectionCount(flow: Flow, evidence?: Evidence) {
  return evidence?.indirections ?? flow.steps.filter(step => step.edge?.alias || step.edge?.dynamic).length
}

export const starter:App=normalize(demoBundle)
