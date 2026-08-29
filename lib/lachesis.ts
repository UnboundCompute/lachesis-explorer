export type Node = { id: string; kind: string; file: string; line: number; label: string; snippet: string }
export type Step = { node_id: string; role: string; note?: string; edge?: { alias?: boolean; dynamic?: boolean } }
export type Flow = { id: string; name: string; steps: Step[] }
export type Evidence = { for: string; verb: string; args: string; result_summary: string; hops?: number; nodes?: number; indirections?: number }
export type LayoutPoint = { x: number; y: number }
export type Hop = { node_id: string; edge_label: string; caption: string; layout?: LayoutPoint }
export type Entry = { id: string; label: string; file: string; entry_node?: string; hops: Hop[]; hasLayout: boolean }
export type App = { name: string; language: string; commit: string; lines: number; nodes: Node[]; flows: Flow[]; entries: Entry[]; mcp: Evidence[] }

export const starterNodes: Node[] = [
  { id:'n_api_42',kind:'assignment',file:'handlers/api.py',line:42,label:'data = request.json["q"]',snippet:'data = request.json["q"]' },
  { id:'n_api_51',kind:'call',file:'handlers/api.py',line:51,label:'q = normalize(data)',snippet:'q = normalize(data)' },
  { id:'n_db_88',kind:'call',file:'db/query.py',line:88,label:'sql = build(q)',snippet:'sql = build(q)' },
  { id:'n_db_93',kind:'sink',file:'db/query.py',line:93,label:'cursor.execute(sql)',snippet:'cursor.execute(sql)' },
  { id:'n_route_12',kind:'route',file:'routes.py',line:12,label:'@app.post("/api/search")',snippet:'@app.post("/api/search")' },
  { id:'n_auth_30',kind:'guard',file:'mw/auth.py',line:30,label:'AuthMiddleware.process',snippet:'token = request.headers.get("Authorization")' },
  { id:'n_svc_70',kind:'service',file:'services/search.py',line:70,label:'run_query(q)',snippet:'return repository.build_and_execute(q)' },
  { id:'n_cache_18',kind:'assignment',file:'cache/keys.ts',line:18,label:'key = hash(query)',snippet:'const key = hash(query)' },
]
export const starterFlows: Flow[] = [
  {id:'user_input',name:'user_input',steps:[{node_id:'n_api_42',role:'origin'},{node_id:'n_api_51',role:'transform',edge:{alias:true}},{node_id:'n_db_88',role:'transform'},{node_id:'n_db_93',role:'sink',edge:{dynamic:true}}]},
  {id:'normalized_query',name:'normalized_query',steps:[{node_id:'n_api_51',role:'origin'},{node_id:'n_svc_70',role:'call',edge:{alias:true}},{node_id:'n_db_88',role:'transform'},{node_id:'n_db_93',role:'sink'}]},
  {id:'sql_statement',name:'sql_statement',steps:[{node_id:'n_db_88',role:'origin'},{node_id:'n_db_93',role:'sink',edge:{dynamic:true}}]},
  {id:'cache_key',name:'cache_key',steps:[{node_id:'n_api_51',role:'origin'},{node_id:'n_cache_18',role:'transform'}]},
]
const layout = (xs: number[]) => xs.map((x, i) => ({ node_id: ['n_route_12','n_auth_30','n_api_42','n_svc_70','n_db_88'][i], edge_label: ['route','middleware','handler','service','repository'][i], caption: ['route — accepts POST /api/search','guard — checks the request token','handler — reads the query value','service — delegates query execution','repository — builds the statement'][i], layout: {x, y: 110} }))
export const starterEntries: Entry[] = [
  {id:'cp_search',label:'POST /api/search',file:'routes.py:12',entry_node:'n_route_12',hasLayout:true,hops:layout([72,210,350,490,628])},
  {id:'cp_suggestions',label:'GET /api/suggestions',file:'routes.py:28',entry_node:'n_route_12',hasLayout:true,hops:layout([72,286,500]).map((hop, i) => ({...hop, edge_label:['route','middleware','cache'][i], caption:['route — accepts GET /api/suggestions','guard — checks the request token','cache — derives a stable lookup key'][i], node_id:['n_route_12','n_auth_30','n_cache_18'][i]}))}
]
export const starterEvidence: Evidence[] = [
  {for:'user_input',verb:'trace',args:'value="user_input"',result_summary:'reaches(cursor.execute) → sink found',hops:4,nodes:4,indirections:2},
  {for:'cp_search',verb:'cursor.exec',args:'/api/search',result_summary:'request path resolved',hops:5,nodes:5,indirections:0}
]
export const starter: App = {name:'example/webapp',language:'python',commit:'a1b2c3d',lines:18432,nodes:starterNodes,flows:starterFlows,entries:starterEntries,mcp:starterEvidence}

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

export function normalize(raw: any): App {
  const source = raw.graph ?? raw
  const meta = raw.meta ?? source.meta ?? {}
  const nodes = Array.isArray(source.nodes) ? source.nodes.map((n:any,i:number)=>({id:String(n.id??n.node_id??`node_${i}`),kind:String(n.kind??n.type??'node'),file:String(n.file??n.path??''),line:Number(n.line??n.start_line??0),label:String(n.label??n.name??n.code??''),snippet:String(n.snippet??n.code??n.label??n.name??'')})) : []
  const flows = Array.isArray(source.flows) ? source.flows.map((f:any,i:number)=>({id:String(f.id??`flow_${i}`),name:String(f.value??f.name??''),steps:Array.isArray(f.steps)?f.steps.map((s:any)=>({node_id:String(s.node_id??s.nodeId??s.node),role:String(s.role??''),note:s.note,edge:s.edge})) : []})) : []
  const rawPaths = raw.callpaths ?? source.callpaths ?? []
  const entries = Array.isArray(rawPaths) ? rawPaths.map((e:any,i:number)=>{
    const rawHops = Array.isArray(e.hops) ? e.hops : []
    const entryNode = String(e.entry_node ?? e.entryNode ?? rawHops[0]?.node_id ?? '')
    const hops = rawHops.map((h:any,j:number)=>({node_id:String(h.node_id??h.nodeId??h.id??''),edge_label:String(h.edge_label??h.label??''),caption:String(h.caption??''),layout:pointFor(e.layout, String(h.node_id??h.nodeId??h.id??''), j)}))
    const firstNode = nodes.find((n: Node) => n.id === entryNode)
    return {id:String(e.id??e.callpath_id??`callpath_${i}`),label:String(e.entry??e.label??''),file:firstNode ? `${firstNode.file}:${firstNode.line}` : '',entry_node:entryNode,hops,hasLayout:hops.length > 0 && hops.every((h: Hop) => h.layout !== undefined)}
  }) : []
  const rawMcp = raw.mcp ?? source.mcp
  const mcp = Array.isArray(rawMcp) ? rawMcp.map((m:any)=>({for:String(m.for??m.flow??''),verb:String(m.tool??m.verb??''),args:formatArgs(m.args),result_summary:String(m.result_summary??''),hops:m.hops==null?undefined:Number(m.hops),nodes:m.nodes==null?undefined:Number(m.nodes),indirections:m.indirections==null?undefined:Number(m.indirections)})) : []
  if (!nodes.length || !flows.length) throw new Error('Expected graph.nodes and graph.flows in bundle.json')
  return {name:String(meta.repo??''),language:String(meta.lang??meta.language??''),commit:String(meta.commit??''),lines:Number(meta.loc??meta.lines??0),nodes,flows,entries,mcp}
}

export function indirectionCount(flow: Flow, evidence?: Evidence) {
  return evidence?.indirections ?? flow.steps.filter(step => step.edge?.alias || step.edge?.dynamic).length
}
