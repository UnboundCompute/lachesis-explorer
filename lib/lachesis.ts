import demoBundle from '../public/demo-bundle.json'

export type Node = { id: string; kind: string; file: string; line: number; column?: number; endLine?: number; endColumn?: number; label: string; qualifiedName?: string; module?: string; signature?: string; documentation?: string; snippet: string }
export type Step = { id?: string; node_id: string; role: string; note?: string; edge?: { relation?: string; alias?: boolean; dynamic?: boolean; confidence?: string; limitations?: string[] } }
export type Flow = { id: string; name: string; steps: Step[]; description?: string; sourceNodeId?: string; sinkNodeId?: string; confidence?: string; limitations?: string[] }
export type GuardEvidence = { verdict?: string; note?: string; items?: {node_id?:string;effect?:string}[] }
export type Evidence = { for: string; verb: string; args: string; result_summary: string; hops?: number; nodes?: number; node_ids?: string[]; indirections?: number; confidence?: string; origin?: string; status?: string; lifecycle?: string; limitations?: string[]; guards?: GuardEvidence }
export type LayoutPoint = { x: number; y: number }
export type Hop = { id?: string; node_id: string; edge_label: string; caption: string; layout?: LayoutPoint; confidence?: string; limitations?: string[] }
export type Entry = { id: string; label: string; file: string; entry_node?: string; hops: Hop[]; hasLayout: boolean; description?: string; kind?: string; confidence?: string; limitations?: string[] }
export type GraphFile = { id: string; path: string; module?: string; language?: string; lines?: number }
export type GraphModule = { id: string; name: string; path?: string; parentId?: string; nodeIds?: string[] }
export type GraphEntrypoint = { id: string; label: string; kind?: string; nodeId?: string; file?: string }
export type GraphCoverage = { scope?: string; includedNodes?: number; indexedNodes?: number; limitations: string[]; capabilities: string[] }
export type EdgeOrigin = 'bundle' | 'value-flow' | 'request-path'
export type GraphEdge = { id:string; source:string; target:string; relation:string; alias:boolean; dynamic:boolean; confidence?:string; limitations?:string[]; origins:EdgeOrigin[]; flow_ids:string[]; entry_ids:string[] }
export type BundleInfo = { format:string; schemaVersion:string; findingSchemaVersion?:string; projection?:string; description?:string; engine?:string; catalog?:string; toolchain?:string; generatedAt?:string; fixture:boolean; indexedNodes?:number; includedNodes?:number; capabilities?:string[]; limitations?:string[] }
export type App = { name: string; language: string; commit: string; lines: number; nodes: Node[]; edges: GraphEdge[]; flows: Flow[]; findings: Flow[]; entries: Entry[]; mcp: Evidence[]; files: GraphFile[]; modules: GraphModule[]; entrypoints: GraphEntrypoint[]; coverage: GraphCoverage; bundle:BundleInfo }

function coverageLimitations(includedNodes: number, indexedNodes: number | undefined, limitations: string[] = []) {
  const result = [...limitations]
  if (indexedNodes != null && indexedNodes > includedNodes && !result.some((item) => /projected subset|indexed nodes/i.test(item))) {
    result.push(`This bundle contains ${includedNodes.toLocaleString()} of ${indexedNodes.toLocaleString()} indexed nodes; it is a projected subset.`)
  }
  return result
}

function formatArgs(args: unknown) {
  if (typeof args === 'string') return args
  if (args == null) return ''
  if (typeof args === 'object') return Object.entries(args as Record<string, unknown>).map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ')
  return String(args)
}

function normalizeRelation(value: unknown) {
  const relation = String(value ?? 'connects').trim()
  return relation ? relation.replace(/[_-]+/g, ' ').toLowerCase() : 'connects'
}

function normalizeKind(value: unknown) {
  const kind = String(value ?? 'node').trim()
  return kind ? kind.replace(/[_\s]+/g, '-').toLowerCase() : 'node'
}

function flowRelation(step: Step) {
  const role = step.role.trim().toLowerCase()
  return normalizeRelation(step.edge?.relation ?? (['origin', 'source', 'sink', 'boundary'].includes(role) ? 'value flows to' : step.role || 'value flows to'))
}

function normalizeEvidence(raw: any): Evidence {
  const nodeIds = Array.isArray(raw.nodes)
    ? raw.nodes.map(String)
    : Array.isArray(raw.node_ids)
      ? raw.node_ids.map(String)
      : undefined
  const nodeCount = nodeIds?.length ?? (raw.nodes == null ? undefined : Number(raw.nodes))
  return {for:String(raw.for??raw.flow??''),verb:String(raw.tool??raw.verb??''),args:formatArgs(raw.args),result_summary:String(raw.result_summary??''),hops:raw.hops==null?undefined:Number(raw.hops),nodes:Number.isFinite(nodeCount)?nodeCount:undefined,node_ids:nodeIds,indirections:raw.indirections==null?undefined:Number(raw.indirections),confidence:raw.confidence==null?undefined:String(raw.confidence),origin:raw.origin==null?undefined:String(raw.origin),status:raw.status==null?undefined:String(raw.status),limitations:Array.isArray(raw.limitations)?raw.limitations.map(String):undefined,guards:raw.guards}
}

function pointFor(rawLayout: unknown, nodeId: string, index: number): LayoutPoint | undefined {
  if (Array.isArray(rawLayout)) {
    const point = rawLayout.find((item: any) => String(item.node_id ?? item.nodeId ?? item.id ?? '') === nodeId) ?? rawLayout[index]
    return point && Number.isFinite(Number(point.x)) ? {x:Number(point.x), y:Number(point.y ?? 110)} : undefined
  }
  const point = rawLayout && typeof rawLayout === 'object' ? (rawLayout as Record<string, any>)[nodeId] : undefined
  return point && Number.isFinite(Number(point.x)) ? {x:Number(point.x), y:Number(point.y ?? 110)} : undefined
}

function normalizeNode(n:any,i:number):Node {
  return {id:String(n.id??n.node_id??`node_${i}`),kind:normalizeKind(n.kind??n.type??'node'),file:String(n.file??n.path??''),line:Number(n.line??n.start_line??n.location?.start?.line??0),column:n.column==null?n.location?.start?.column==null?undefined:Number(n.location.start.column):Number(n.column),endLine:n.end_line==null?n.location?.end?.line==null?undefined:Number(n.location.end.line):Number(n.end_line),endColumn:n.end_column==null?n.location?.end?.column==null?undefined:Number(n.location.end.column):Number(n.end_column),label:String(n.label??n.name??n.code??''),qualifiedName:n.qualified_name==null?undefined:String(n.qualified_name),module:n.module==null?undefined:String(n.module),signature:n.signature==null?undefined:String(n.signature),documentation:n.documentation==null?undefined:String(n.documentation),snippet:String(n.snippet??n.code??n.label??n.name??'')}
}

function normalizeFiles(raw:unknown):GraphFile[] { return Array.isArray(raw)?raw.map((f:any,i:number)=>({id:String(f.id??f.path??`file_${i}`),path:String(f.path??f.name??f.id??''),module:f.module==null?undefined:String(f.module),language:f.language==null?undefined:String(f.language),lines:f.lines==null?undefined:Number(f.lines)})):[] }
function normalizeModules(raw:unknown):GraphModule[] { return Array.isArray(raw)?raw.map((m:any,i:number)=>({id:String(m.id??m.path??`module_${i}`),name:String(m.name??m.label??m.path??m.id??''),path:m.path==null?undefined:String(m.path),parentId:m.parent_id==null?m.parentId==null?undefined:String(m.parentId):String(m.parent_id),nodeIds:Array.isArray(m.node_ids)?m.node_ids.map(String):undefined})):[] }
function normalizeEntrypoints(raw:unknown):GraphEntrypoint[] { return Array.isArray(raw)?raw.map((e:any,i:number)=>({id:String(e.id??`entrypoint_${i}`),label:String(e.label??e.name??e.path??e.id??''),kind:e.kind==null?undefined:String(e.kind),nodeId:e.node_id==null?e.nodeId==null?undefined:String(e.nodeId):String(e.node_id),file:e.file==null?undefined:String(e.file)})):[] }
function assertUniqueIds(items:{id:string}[], label:string) {
  const seen=new Set<string>()
  for (const item of items) {
    if (!item.id.trim()) throw new Error(`${label} IDs must be non-empty.`)
    if (seen.has(item.id)) throw new Error(`${label} contains duplicate ID "${item.id}".`)
    seen.add(item.id)
  }
}
function assertUniqueOccurrenceIds(items:{id?:string}[], label:string) {
  const seen=new Set<string>()
  for (const item of items) if (item.id != null) {
    if (!item.id.trim()) throw new Error(`${label} occurrence IDs must be non-empty.`)
    if (seen.has(item.id)) throw new Error(`${label} contains duplicate occurrence ID "${item.id}".`)
    seen.add(item.id)
  }
}
function assertEvidenceNodes(items:Evidence[], ids:Set<string>) {
  const broken=items.flatMap(item=>item.node_ids??[]).find(nodeId=>!ids.has(nodeId))
  if(broken)throw new Error(`MCP evidence references missing node "${broken}".`)
}
function normalizeStep(raw:any):Step {
  const id=raw?.occurrence_id??raw?.step_id??raw?.id
  return {id:id==null?undefined:String(id),node_id:String(raw?.node_id??raw?.nodeId??raw?.node??raw?.id??''),role:String(raw?.role??'node').trim().replace(/[_-]+/g,' ').toLowerCase(),note:raw?.note,edge:raw?.edge}
}

function normalizePathMetadata(raw:any) {
  const sourceNodeId = raw?.source_node ?? raw?.sourceNode ?? raw?.source_id
  const sinkNodeId = raw?.sink_node ?? raw?.sinkNode ?? raw?.sink_id
  return {
    description: raw?.description == null ? raw?.summary == null ? undefined : String(raw.summary) : String(raw.description),
    sourceNodeId: sourceNodeId == null ? undefined : String(sourceNodeId),
    sinkNodeId: sinkNodeId == null ? undefined : String(sinkNodeId),
    confidence: raw?.confidence == null ? undefined : String(raw.confidence),
    limitations: Array.isArray(raw?.limitations) ? raw.limitations.map(String) : undefined,
  }
}

type EdgeSeed = Omit<GraphEdge,'id'|'origins'|'flow_ids'|'entry_ids'> & {id?:string;origin:EdgeOrigin;flow_id?:string;entry_id?:string}

function normalizeEntries(rawPaths:unknown,nodes:Node[]):Entry[]{
  if(!Array.isArray(rawPaths))return []
  const entries=rawPaths.map((e:any,i:number)=>{
    const rawHops=Array.isArray(e.hops)?e.hops:[]
    const entryNode=String(e.entry_node??e.entryNode??rawHops[0]?.node_id??'')
    const hops=rawHops.map((h:any,j:number)=>({id:(h.occurrence_id??h.hop_id??h.id)==null?undefined:String(h.occurrence_id??h.hop_id??h.id),node_id:String(h.node_id??h.nodeId??h.node??h.id??''),edge_label:normalizeRelation(h.edge_label??h.label??'calls'),caption:String(h.caption??''),confidence:h.confidence==null?undefined:String(h.confidence),limitations:Array.isArray(h.limitations)?h.limitations.map(String):undefined,layout:pointFor(e.layout,String(h.node_id??h.nodeId??h.node??h.id??''),j)}))
    const firstNode=nodes.find(node=>node.id===entryNode)
    const metadata=normalizePathMetadata(e)
    return {id:String(e.id??e.callpath_id??`callpath_${i}`),label:String(e.entry??e.label??''),file:firstNode?`${firstNode.file}:${firstNode.line}`:'',entry_node:entryNode,hops,hasLayout:hops.length>0&&hops.every((hop:Hop)=>hop.layout!==undefined),description:metadata.description,kind:e.kind==null?undefined:String(e.kind),confidence:metadata.confidence,limitations:metadata.limitations}
  })
  assertUniqueIds(entries,'Request paths')
  entries.forEach((entry,index)=>assertUniqueOccurrenceIds(entry.hops,`Request path ${entry.id||index}`))
  return entries
}

export function deriveGraphEdges(explicit:EdgeSeed[], flows:Flow[], entries:Entry[]): GraphEdge[] {
  const collected = new Map<string,GraphEdge>()
  const ids = new Map<string,string>()
  const reservedIds = new Set(explicit.map(seed => seed.id?.trim()).filter(Boolean) as string[])
  const usedIds = new Set<string>()
  let generatedId = 1
  function nextId() {
    while (reservedIds.has(`edge_${generatedId}`) || usedIds.has(`edge_${generatedId}`)) generatedId += 1
    const id = `edge_${generatedId}`
    generatedId += 1
    return id
  }
  function include(seed:EdgeSeed) {
    if (!seed.source || !seed.target) return
    const key=[seed.source,seed.target,seed.relation,seed.alias?'alias':'exact',seed.dynamic?'dynamic':'static'].join('|')
    const requestedId=seed.id?.trim()
    if(requestedId){const previousKey=ids.get(requestedId);if(previousKey&&previousKey!==key)throw new Error(`Duplicate graph edge ID "${requestedId}".`);ids.set(requestedId,key)}
    const current=collected.get(key)
    if(current){if(!current.origins.includes(seed.origin))current.origins.push(seed.origin);if(seed.flow_id&&!current.flow_ids.includes(seed.flow_id))current.flow_ids.push(seed.flow_id);if(seed.entry_id&&!current.entry_ids.includes(seed.entry_id))current.entry_ids.push(seed.entry_id);if(!current.confidence&&seed.confidence)current.confidence=seed.confidence;for(const limitation of seed.limitations??[])if(!current.limitations?.includes(limitation))(current.limitations??=[]).push(limitation);return}
    const id = seed.id || nextId()
    usedIds.add(id)
    collected.set(key,{id,source:seed.source,target:seed.target,relation:seed.relation||'connects',alias:seed.alias,dynamic:seed.dynamic,confidence:seed.confidence,limitations:seed.limitations,origins:[seed.origin],flow_ids:seed.flow_id?[seed.flow_id]:[],entry_ids:seed.entry_id?[seed.entry_id]:[]})
  }
  explicit.forEach(include)
  flows.forEach(flow=>flow.steps.slice(1).forEach((step,index)=>include({source:flow.steps[index].node_id,target:step.node_id,relation:flowRelation(step),alias:Boolean(step.edge?.alias),dynamic:Boolean(step.edge?.dynamic),confidence:step.edge?.confidence,limitations:step.edge?.limitations,origin:'value-flow',flow_id:flow.id})))
  entries.forEach(entry=>entry.hops.slice(1).forEach((hop,index)=>include({source:entry.hops[index].node_id,target:hop.node_id,relation:normalizeRelation(hop.edge_label||'calls'),alias:false,dynamic:false,confidence:hop.confidence,limitations:hop.limitations,origin:'request-path',entry_id:entry.id})))
  return [...collected.values()]
}

export function normalize(raw: any): App {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Bundle must be a JSON object.')
  // bundle/1.0: findings are versioned envelopes. bundle/0.x (below) stays a
  // permissive adapter for the flow-centric prototype format.
  if (String(raw.schema_version ?? '') === '2.0') {
    if (String(raw.format ?? '') !== 'lachesis-explorer-bundle') throw new Error('Graph-first bundles must use format "lachesis-explorer-bundle".')
    return normalizeGraphV2(raw)
  }
  if (Array.isArray(raw.findings) || raw.format === 'lachesis-explorer-bundle') return normalizeBundleV1(raw)
  const source = raw.graph ?? raw
  if (!source || typeof source !== 'object') throw new Error('Expected a graph object in bundle.json.')
  const meta = raw.meta ?? source.meta ?? {}
  if (!Array.isArray(source.nodes)) throw new Error('Expected graph.nodes to be an array.')
  if (!Array.isArray(source.flows)) throw new Error('Expected graph.flows to be an array.')
  const nodes = source.nodes.map(normalizeNode)
  const flows = source.flows.map((f:any,i:number)=>{const id=String(f.id??`flow_${i}`);return {id,name:String(f.value??f.name??id),steps:Array.isArray(f.steps)?f.steps.map(normalizeStep) : [],...normalizePathMetadata(f)}})
  assertUniqueIds(flows,'Graph paths')
  const entries=normalizeEntries(raw.callpaths??source.callpaths??[],nodes)
  const rawMcp = raw.mcp ?? source.mcp
  const mcp = Array.isArray(rawMcp) ? rawMcp.map(normalizeEvidence) : []
  const rawEdges = Array.isArray(source.edges) ? source.edges : []
  const explicitEdges:EdgeSeed[] = rawEdges.map((edge:any)=>({id:edge.id==null?undefined:String(edge.id),source:String(edge.source??edge.from??edge.source_id??''),target:String(edge.target??edge.to??edge.target_id??''),relation:normalizeRelation(edge.relation??edge.kind??edge.type??edge.label??'connects'),alias:Boolean(edge.alias),dynamic:Boolean(edge.dynamic),confidence:edge.confidence==null?undefined:String(edge.confidence),limitations:Array.isArray(edge.limitations)?edge.limitations.map(String):undefined,origin:'bundle'}))
  if (!nodes.length) throw new Error('The bundle contains no graph nodes.')
  const ids = new Set<string>(nodes.map((node:Node)=>node.id))
  if (ids.size !== nodes.length) throw new Error('The bundle contains duplicate node IDs.')
  const emptyFlow = flows.find((flow:Flow)=>flow.steps.length===0)
  if (emptyFlow) throw new Error(`Flow "${emptyFlow.name}" contains no steps.`)
  const brokenStep = flows.flatMap((flow:Flow)=>flow.steps).find((step:Step)=>!ids.has(step.node_id))
  if (brokenStep) throw new Error(`A flow references missing node "${brokenStep.node_id}".`)
  const brokenHop = entries.flatMap((entry:Entry)=>entry.hops).find((hop:Hop)=>!ids.has(hop.node_id))
  if (brokenHop) throw new Error(`A callpath references missing node "${brokenHop.node_id}".`)
  assertEvidenceNodes(mcp,ids)
  const brokenEdge = explicitEdges.find(edge=>!ids.has(edge.source)||!ids.has(edge.target))
  if (brokenEdge) throw new Error(`A graph edge references missing node "${!ids.has(brokenEdge.source)?brokenEdge.source:brokenEdge.target}".`)
  const edges=deriveGraphEdges(explicitEdges,flows,entries)
  const indexedNodes=Number(meta.nodes_total??0)||undefined
  const limitations=coverageLimitations(nodes.length,indexedNodes)
  return {name:String(meta.repo??''),language:String(meta.lang??meta.language??''),commit:String(meta.commit??''),lines:Number(meta.loc??meta.lines??0),nodes,edges,flows,findings:flows,entries,mcp,files:normalizeFiles(source.files),modules:normalizeModules(source.modules),entrypoints:normalizeEntrypoints(source.entrypoints),coverage:{scope:'projection',includedNodes:nodes.length,indexedNodes,limitations,capabilities:[]},bundle:{format:'bundle/0.x',schemaVersion:String(raw.schema_version??'0.x'),description:meta.description==null?undefined:String(meta.description),generatedAt:meta.generated_at==null?undefined:String(meta.generated_at),fixture:Boolean(meta.fixture),indexedNodes,includedNodes:nodes.length,limitations}}
}

function normalizeBundleV1(raw: any): App {
  if (raw.format != null && String(raw.format) !== 'lachesis-explorer-bundle') throw new Error('Finding bundles must use format "lachesis-explorer-bundle".')
  const graph = raw.graph ?? {}
  const manifest = raw.evidence_manifest ?? {}
  const meta = raw.meta ?? {}
  if (!Array.isArray(graph.nodes)) throw new Error('Expected graph.nodes to be an array.')
  if (!Array.isArray(raw.findings)) throw new Error('Expected findings to be an array.')
  const nodes:Node[] = graph.nodes.map(normalizeNode)
  const findingFlows:Flow[] = raw.findings.map((f:any,i:number)=>{
    const id=String(f.finding_id??f.id??`finding_${i}`)
    const steps=Array.isArray(f.witness?.steps)?f.witness.steps.map(normalizeStep) : []
    const source=f.locations?.find((location:any)=>location.role==='source')?.symbol
    const sink=f.locations?.find((location:any)=>location.role==='sink')?.symbol
    return {id,name:String(f.display_name??f.name??((source&&sink)?`${source} → ${sink}`:sink??source??id)),steps,...normalizePathMetadata(f)}
  })
  assertUniqueIds(findingFlows,'Security findings')
  const flows = findingFlows.filter(flow=>flow.steps.length>0)
  findingFlows.forEach((flow)=>assertUniqueOccurrenceIds(flow.steps,`Security finding ${flow.id}`))
  const findingEvidence:Evidence[] = raw.findings.map((f:any,i:number)=>{
    const id=String(f.finding_id??f.id??`finding_${i}`)
    const steps=Array.isArray(f.witness?.steps)?f.witness.steps:[]
    const node_ids=steps.map((s:any)=>String(s.node_id??s.nodeId??s.node??'')).filter(Boolean)
    const indirections=steps.filter((s:any)=>s.edge?.alias||s.edge?.dynamic).length
    const loc=(f.locations??[]).map((l:any)=>l.symbol?`${l.symbol}${l.file?` (${l.file}${l.line?`:${l.line}`:''})`:''}`:'').filter(Boolean).join(' · ')
    const status=f.status==null?undefined:String(f.status)
    const summary=status==='refuted'?'A bundled guard refutes this candidate path.':status==='inconclusive'?'The witness reaches the boundary, but unresolved evidence prevents a conclusion.':'A source-to-sink witness is present and ready for review.'
    return {for:id,verb:String(f.analysis?.projection??f.projection??'finding'),args:loc,result_summary:String(f.result_summary??f.objective??summary),nodes:node_ids.length,node_ids,indirections,confidence:f.analysis?.confidence==null?undefined:String(f.analysis.confidence),origin:String(f.origin??f.analysis?.origin??'finding envelope'),status,lifecycle:f.lifecycle_state==null?undefined:String(f.lifecycle_state),limitations:Array.isArray(f.analysis?.limitations)?f.analysis.limitations.map(String):undefined,guards:f.witness?.guards}
  })
  const explicitMcp:Evidence[]=Array.isArray(raw.mcp??graph.mcp)?(raw.mcp??graph.mcp).map(normalizeEvidence):[]
  const evidenceById=new Map<string,Evidence>()
  explicitMcp.forEach((item)=>{if(item.for)evidenceById.set(item.for,item)})
  findingEvidence.forEach((item)=>{if(item.for&&!evidenceById.has(item.for))evidenceById.set(item.for,item)})
  const mcp=[...evidenceById.values()]
  const entries=normalizeEntries(raw.callpaths??graph.callpaths??[],nodes)
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : []
  const explicitEdges:EdgeSeed[] = rawEdges.map((edge:any)=>({id:edge.id==null?undefined:String(edge.id),source:String(edge.source??edge.from??edge.source_id??''),target:String(edge.target??edge.to??edge.target_id??''),relation:normalizeRelation(edge.relation??edge.kind??edge.type??edge.label??'connects'),alias:Boolean(edge.alias),dynamic:Boolean(edge.dynamic),confidence:edge.confidence==null?undefined:String(edge.confidence),limitations:Array.isArray(edge.limitations)?edge.limitations.map(String):undefined,origin:'bundle'}))
  if (!nodes.length) throw new Error('The bundle contains no graph nodes.')
  const ids = new Set<string>(nodes.map((node:Node)=>node.id))
  if (ids.size !== nodes.length) throw new Error('The bundle contains duplicate node IDs.')
  const brokenStep = flows.flatMap((flow:Flow)=>flow.steps).find((step:Step)=>!ids.has(step.node_id))
  if (brokenStep) throw new Error(`A finding references missing node "${brokenStep.node_id}".`)
  const brokenHop=entries.flatMap(entry=>entry.hops).find(hop=>!ids.has(hop.node_id))
  if(brokenHop)throw new Error(`A callpath references missing node "${brokenHop.node_id}".`)
  assertEvidenceNodes(mcp,ids)
  const brokenEdge = explicitEdges.find(edge=>!ids.has(edge.source)||!ids.has(edge.target))
  if (brokenEdge) throw new Error(`A graph edge references missing node "${!ids.has(brokenEdge.source)?brokenEdge.source:brokenEdge.target}".`)
  const edges=deriveGraphEdges(explicitEdges,flows,entries)
  const indexedNodes=Number(meta.nodes_total??0)||undefined
  const limitations=coverageLimitations(nodes.length,indexedNodes)
  return {name:String(meta.repo??manifest.repository??''),language:String(meta.lang??meta.language??''),commit:String(meta.commit??manifest.commit_sha??''),lines:Number(meta.loc??meta.lines??0),nodes,edges,flows,findings:flows,entries,mcp,files:normalizeFiles(graph.files),modules:normalizeModules(graph.modules),entrypoints:normalizeEntrypoints(graph.entrypoints),coverage:{scope:'security projection',includedNodes:nodes.length,indexedNodes,limitations,capabilities:[]},bundle:{format:String(raw.format??'lachesis-explorer-bundle'),schemaVersion:String(raw.schema_version??'1.0'),findingSchemaVersion:manifest.finding_schema_version==null?undefined:String(manifest.finding_schema_version),projection:manifest.analysis_projection==null?undefined:String(manifest.analysis_projection),description:meta.description==null?undefined:String(meta.description),engine:manifest.engine_sha==null?undefined:String(manifest.engine_sha),catalog:manifest.catalog_sha==null?undefined:String(manifest.catalog_sha),toolchain:manifest.toolchain_fingerprint==null?undefined:String(manifest.toolchain_fingerprint),generatedAt:meta.generated_at==null?undefined:String(meta.generated_at),fixture:Boolean(meta.fixture),indexedNodes,includedNodes:nodes.length,limitations}}
}

function normalizeGraphV2(raw:any):App {
  const graph=raw.graph??{}
  const meta=raw.meta??{}
  if (!raw.meta || typeof raw.meta !== 'object' || Array.isArray(raw.meta)) throw new Error('Graph-first bundles require a meta object.')
  for (const field of ['repository','language','revision','lines','indexed_nodes']) {
    if (meta[field] == null) throw new Error(`Graph-first bundles require meta.${field}.`)
  }
  for (const field of ['lines','indexed_nodes']) {
    if (typeof meta[field] !== 'number' || !Number.isInteger(meta[field]) || meta[field] < 0)
      throw new Error(`Graph-first bundles require meta.${field} to be a non-negative integer.`)
  }
  const nodes:Node[]=Array.isArray(graph.nodes)?graph.nodes.map(normalizeNode):[]
  if(!nodes.length)throw new Error('The bundle contains no graph nodes.')
  const nodeIds=new Set(nodes.map(node=>node.id))
  if(nodeIds.size!==nodes.length)throw new Error('The bundle contains duplicate node IDs.')
  const files=normalizeFiles(graph.files)
  const modules=normalizeModules(graph.modules)
  const entrypoints=normalizeEntrypoints(graph.entrypoints)
  assertUniqueIds(files,'Graph files')
  assertUniqueIds(modules,'Graph modules')
  assertUniqueIds(entrypoints,'Graph entrypoints')
  const knownNodeIds=new Set(nodes.map(node=>node.id))
  const brokenModule=modules.flatMap(module=>module.nodeIds??[]).find(nodeId=>!knownNodeIds.has(nodeId))
  if (brokenModule) throw new Error(`A graph module references missing node "${brokenModule}".`)
  const brokenEntrypoint=entrypoints.find(entrypoint=>entrypoint.nodeId&&!knownNodeIds.has(entrypoint.nodeId))
  if (brokenEntrypoint) throw new Error(`Graph entrypoint "${brokenEntrypoint.id}" references missing node "${brokenEntrypoint.nodeId}".`)
  const pathValues=raw.paths?.values??raw.paths?.value_flows??graph.value_flows??raw.value_flows??[]
  const pathRequests=raw.paths?.requests??raw.paths?.request_paths??graph.request_paths??raw.callpaths??[]
  const findings=raw.security?.findings??raw.findings??[]
  const flowRaw=Array.isArray(pathValues)?pathValues:[]
  const flows:Flow[]=flowRaw.map((f:any,i:number)=>{const id=String(f.id??f.finding_id??`value_flow_${i}`);return {id,name:String(f.name??f.value??f.display_name??id),steps:Array.isArray(f.steps)?f.steps.map(normalizeStep):[],...normalizePathMetadata(f)}})
  const findingFlows:Flow[]=Array.isArray(findings)?findings.map((f:any,i:number)=>{const id=String(f.finding_id??f.id??`finding_${i}`);return {id,name:String(f.display_name??f.name??id),steps:Array.isArray(f.witness?.steps)?f.witness.steps.map(normalizeStep):[],...normalizePathMetadata(f)}}):[]
  flows.forEach((flow)=>assertUniqueOccurrenceIds(flow.steps,`Value path ${flow.id}`))
  findingFlows.forEach((flow)=>assertUniqueOccurrenceIds(flow.steps,`Security finding ${flow.id}`))
  assertUniqueIds(findingFlows,'Security findings')
  const emptyValuePath=flows.find(flow=>flow.steps.length===0)
  if(emptyValuePath)throw new Error(`Value path "${emptyValuePath.name}" contains no steps.`)
  const valueIds=new Set(flows.map(flow=>flow.id))
  const overlappingFinding=findingFlows.find(flow=>valueIds.has(flow.id))
  if (overlappingFinding) throw new Error(`Security finding ID "${overlappingFinding.id}" conflicts with a value path ID.`)
  const allFlows=[...flows,...findingFlows.filter(f=>f.steps.length>0)]
  assertUniqueIds(allFlows,'Graph paths')
  const entries=normalizeEntries(pathRequests,nodes)
  const emptyRequestPath=entries.find(entry=>entry.hops.length===0)
  if(emptyRequestPath)throw new Error(`Request path "${emptyRequestPath.label||emptyRequestPath.id}" contains no hops.`)
  const rawEdges=Array.isArray(graph.edges)?graph.edges:[]
  const explicitEdges:EdgeSeed[]=rawEdges.map((edge:any)=>({id:edge.id==null?undefined:String(edge.id),source:String(edge.source??edge.from??edge.source_id??''),target:String(edge.target??edge.to??edge.target_id??''),relation:normalizeRelation(edge.relation??edge.kind??edge.type??edge.label??'connects'),alias:Boolean(edge.alias),dynamic:Boolean(edge.dynamic),confidence:edge.confidence==null?undefined:String(edge.confidence),limitations:Array.isArray(edge.limitations)?edge.limitations.map(String):undefined,origin:'bundle'}))
  const ids=new Set(nodes.map(node=>node.id))
  const brokenStep=allFlows.flatMap(flow=>flow.steps).find(step=>!ids.has(step.node_id))
  if(brokenStep)throw new Error(`A path references missing node "${brokenStep.node_id}".`)
  const brokenEndpoint=allFlows.flatMap(flow=>[flow.sourceNodeId,flow.sinkNodeId].filter(Boolean) as string[]).find(nodeId=>!ids.has(nodeId))
  if(brokenEndpoint)throw new Error(`A path endpoint references missing node "${brokenEndpoint}".`)
  const detachedEndpoint=allFlows.find(flow=>[flow.sourceNodeId,flow.sinkNodeId].filter(Boolean).some(nodeId=>!flow.steps.some(step=>step.node_id===nodeId)))
  if(detachedEndpoint)throw new Error(`Path "${detachedEndpoint.name}" declares an endpoint outside its step sequence.`)
  const brokenEntry=entries.flatMap(entry=>entry.hops).find(hop=>!ids.has(hop.node_id))
  if(brokenEntry)throw new Error(`An entrypoint references missing node "${brokenEntry.node_id}".`)
  const brokenEdge=explicitEdges.find(edge=>!ids.has(edge.source)||!ids.has(edge.target))
  if(brokenEdge)throw new Error(`A graph edge references missing node "${!ids.has(brokenEdge.source)?brokenEdge.source:brokenEdge.target}".`)
  const findingEvidence:Evidence[]=Array.isArray(findings)?findings.map((f:any)=>{const id=String(f.finding_id??f.id??'');const steps=Array.isArray(f.witness?.steps)?f.witness.steps:[];const nodeIds=steps.map((s:any)=>String(s.node_id??s.nodeId??s.node??'')).filter(Boolean);const loc=(f.locations??[]).map((l:any)=>l.symbol?`${l.symbol}${l.file?` (${l.file}${l.line?`:${l.line}`:''})`:''}`:'').filter(Boolean).join(' · ');return {for:id,verb:String(f.analysis?.projection??f.projection??'finding'),args:loc,result_summary:String(f.result_summary??f.objective??'Security evidence attached to this graph path.'),nodes:nodeIds.length,node_ids:nodeIds,confidence:f.analysis?.confidence==null?undefined:String(f.analysis.confidence),origin:String(f.origin??f.analysis?.origin??'finding envelope'),status:f.status==null?undefined:String(f.status),lifecycle:f.lifecycle_state==null?undefined:String(f.lifecycle_state),limitations:Array.isArray(f.analysis?.limitations)?f.analysis.limitations.map(String):undefined,guards:f.witness?.guards}}):[]
  const rawMcp=raw.mcp??graph.mcp
  const mcpEvidence:Array<Evidence>=Array.isArray(rawMcp)?rawMcp.map(normalizeEvidence):[]
  const evidenceById=new Map<string,Evidence>()
  mcpEvidence.forEach((item)=>{if(item.for)evidenceById.set(item.for,item)})
  findingEvidence.forEach((item)=>{if(item.for&&!evidenceById.has(item.for))evidenceById.set(item.for,item)})
  const evidence=[...evidenceById.values()]
  assertEvidenceNodes(evidence,ids)
  const coverage=graph.coverage??{}
  const limitations=Array.isArray(coverage.limitations)?coverage.limitations.map(String):[]
  const capabilities=Array.isArray(graph.capabilities)?graph.capabilities.map(String):[]
  const indexedNodes=Number(coverage.indexed_nodes??meta.indexed_nodes??meta.nodes_total)
  if (!Number.isInteger(indexedNodes)||indexedNodes<0) throw new Error('Coverage indexed_nodes must be a non-negative integer.')
  const includedNodes=Number(coverage.included_nodes??nodes.length)
  if(!Number.isFinite(includedNodes)||includedNodes!==nodes.length)throw new Error(`Coverage included_nodes (${coverage.included_nodes}) does not match graph.nodes (${nodes.length}).`)
  if(indexedNodes!==undefined&&indexedNodes<includedNodes)throw new Error(`Coverage indexed_nodes (${indexedNodes}) cannot be less than included_nodes (${includedNodes}).`)
  const effectiveLimitations=coverageLimitations(includedNodes,indexedNodes,limitations)
  return {name:String(meta.repository??meta.repo??''),language:String(meta.language??meta.lang??''),commit:String(meta.revision??meta.commit??''),lines:Number(meta.lines??meta.loc??0),nodes,edges:deriveGraphEdges(explicitEdges,allFlows,entries),flows:allFlows,findings:findingFlows.filter(flow=>flow.steps.length>0),entries,mcp:evidence,files,modules,entrypoints,coverage:{scope:String(coverage.scope??'repository'),includedNodes,indexedNodes,limitations:effectiveLimitations,capabilities},bundle:{format:String(raw.format??'lachesis-explorer-bundle'),schemaVersion:'2.0',projection:String(raw.analysis_projection??'' )||undefined,description:meta.description==null?undefined:String(meta.description),generatedAt:meta.generated_at==null?undefined:String(meta.generated_at),fixture:Boolean(meta.fixture),indexedNodes,includedNodes:nodes.length,capabilities,limitations:effectiveLimitations}}
}

export function indirectionCount(flow: Flow, evidence?: Evidence) {
  return evidence?.indirections ?? flow.steps.filter(step => step.edge?.alias || step.edge?.dynamic).length
}

export const starter:App=normalize(demoBundle)
