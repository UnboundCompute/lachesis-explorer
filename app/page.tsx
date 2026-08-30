'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Header, type RecentBundle } from '../components/Header'
import { Intro } from '../components/Intro'
import { InstallView } from '../components/InstallView'
import { JourneyView } from '../components/JourneyView'
import { TraceView } from '../components/TraceView'
import { SinkView } from '../components/SinkView'
import { OverviewView } from '../components/OverviewView'
import { CompareView } from '../components/CompareView'
import { HomeView } from '../components/HomeView'
import { InvestigationContext } from '../components/InvestigationContext'
import { ResourceLinks } from '../components/ResourceLinks'
import { Icon } from '../components/Icon'
import { CommandPalette } from '../components/CommandPalette'
import { InvestigationTrail, type InvestigationEvent } from '../components/InvestigationTrail'
import { starter, normalize, type App } from '../lib/lachesis'
import { trackEvent } from '../lib/analytics'

type View = 'home' | 'trace' | 'journey' | 'investigate' | 'map' | 'compare' | 'install'
type LoadState = {type:'idle'|'loading'|'success'|'error';message:string}
type PendingLink = {view?:string;flow?:string;node?:string;direction?:string;entry?:string;hop?:string;sink?:string}

const viewLabels:Record<View,string>={home:'Briefing',trace:'Value flow',journey:'Request path',investigate:'Sink field',map:'System map',compare:'Revision diff',install:'Local workflow'}

export default function Page() {
  const [view,setView]=useState<View>('home')
  const [direction,setDirection]=useState<'backward'|'forward'>('backward')
  const [app,setApp]=useState<App>(starter)
  const [compareApp,setCompareApp]=useState<App|null>(null)
  const [menu,setMenu]=useState(false)
  const [dark,setDark]=useState(true)
  const [flowId,setFlowId]=useState(starter.flows[0].id)
  const [stepId,setStepId]=useState(starter.flows[0].steps[0].node_id)
  const [entryIndex,setEntryIndex]=useState(0)
  const [hopId,setHopId]=useState(starter.entries[0].hops[0].node_id)
  const [sinkId,setSinkId]=useState(starter.nodes.find(node=>node.kind==='sink')?.id??'')
  const [query,setQuery]=useState('')
  const [loadState,setLoadState]=useState<LoadState>({type:'idle',message:''})
  const [isDemo,setIsDemo]=useState(true)
  const [dragActive,setDragActive]=useState(false)
  const [commandOpen,setCommandOpen]=useState(false)
  const [inspectorOpen,setInspectorOpen]=useState(true)
  const [recentBundles,setRecentBundles]=useState<RecentBundle[]>([])
  const [activity,setActivity]=useState<InvestigationEvent[]>([])
  const fileRef=useRef<HTMLInputElement>(null)
  const compareFileRef=useRef<HTMLInputElement>(null)
  const dragDepth=useRef(0)
  const pendingLink=useRef<PendingLink|null>(null)

  const record=useCallback((action:string,target:string,detail:string)=>setActivity(current=>[{id:Date.now()+Math.random(),action,target,detail,at:Date.now()},...current].slice(0,20)),[])

  useEffect(()=>{const stored=window.localStorage.getItem('lachesis-theme');if(stored==='light')setDark(false)},[])
  useEffect(()=>{try{const stored=JSON.parse(window.localStorage.getItem('lachesis-recent-bundles')??'[]');if(Array.isArray(stored))setRecentBundles(stored.filter(item=>item&&typeof item.name==='string'&&typeof item.loadedAt==='number').slice(0,3))}catch{window.localStorage.removeItem('lachesis-recent-bundles')}},[])
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';window.localStorage.setItem('lachesis-theme',dark?'dark':'light')},[dark])

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const link:PendingLink={view:params.get('view')??undefined,flow:params.get('flow')??undefined,node:params.get('node')??undefined,direction:params.get('direction')??undefined,entry:params.get('entry')??undefined,hop:params.get('hop')??undefined,sink:params.get('sink')??undefined}
    if(params.get('scope')==='local'){
      pendingLink.current=link
      setLoadState({type:'idle',message:'This link belongs to a local bundle. Load that bundle to restore its investigation state.'})
      return
    }
    if(link.view==='home'||link.view==='trace'||link.view==='journey'||link.view==='investigate'||link.view==='map'||link.view==='compare'||link.view==='install')setView(link.view)
    const flow=starter.flows.find(item=>item.id===link.flow)
    if(flow){setFlowId(flow.id);if(link.node&&flow.steps.some(step=>step.node_id===link.node))setStepId(link.node)}
    const index=starter.entries.findIndex(item=>item.id===link.entry)
    if(index>=0){setEntryIndex(index);if(link.hop&&starter.entries[index].hops.some(item=>item.node_id===link.hop))setHopId(link.hop)}
    if(link.sink&&starter.nodes.some(node=>node.id===link.sink&&node.kind==='sink'))setSinkId(link.sink)
    if(link.direction==='forward')setDirection('forward')
  },[])

  useEffect(()=>{
    function onKeyDown(event:KeyboardEvent){
      const target=event.target as HTMLElement
      const editing=target.matches('input, textarea, select, [contenteditable="true"]')
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setCommandOpen(open=>!open);return}
      if(event.key==='Escape'){setCommandOpen(false);setMenu(false);setInspectorOpen(false);dragDepth.current=0;setDragActive(false);return}
      if(editing)return
      if(event.key==='/'&&view==='trace'){event.preventDefault();document.querySelector<HTMLInputElement>('.search input')?.focus()}
      if(view==='trace'&&event.key==='ArrowLeft'){setDirection('backward');record('Changed direction',flowId,'comes from');trackEvent('trace_direction_changed',{direction:'backward',source:'keyboard'})}
      if(view==='trace'&&event.key==='ArrowRight'){setDirection('forward');record('Changed direction',flowId,'goes to');trackEvent('trace_direction_changed',{direction:'forward',source:'keyboard'})}
    }
    window.addEventListener('keydown',onKeyDown)
    return()=>window.removeEventListener('keydown',onKeyDown)
  },[view,flowId,record])

  function changeView(next:View){setView(next);record('Changed lens',viewLabels[next],'')}

  function activate(next:App){
    const pending=pendingLink.current
    const firstSink=next.nodes.find(node=>node.kind==='sink'||next.flows.some(flow=>flow.steps.some(step=>step.node_id===node.id&&step.role==='sink')))?.id??''
    setApp(next);setFlowId(next.flows[0].id);setStepId(next.flows[0].steps[0].node_id);setEntryIndex(0);setHopId(next.entries[0]?.hops[0]?.node_id??next.nodes[0].id);setSinkId(firstSink)
    let restored=false
    if(pending){
      if(pending.view==='home'||pending.view==='trace'||pending.view==='journey'||pending.view==='investigate'||pending.view==='map'||pending.view==='compare'||pending.view==='install')setView(pending.view)
      const linkedFlow=next.flows.find(flow=>flow.id===pending.flow)
      if(linkedFlow){setFlowId(linkedFlow.id);setStepId(pending.node&&linkedFlow.steps.some(step=>step.node_id===pending.node)?pending.node:linkedFlow.steps[0].node_id);restored=true}
      const linkedEntry=next.entries.findIndex(entry=>entry.id===pending.entry)
      if(linkedEntry>=0){setEntryIndex(linkedEntry);setHopId(pending.hop&&next.entries[linkedEntry].hops.some(hop=>hop.node_id===pending.hop)?pending.hop:next.entries[linkedEntry].hops[0]?.node_id??next.nodes[0].id);restored=true}
      if(pending.sink&&next.nodes.some(node=>node.id===pending.sink)){setSinkId(pending.sink);restored=true}
      if(pending.view==='install'||pending.view==='map')restored=true
      if(pending.direction==='forward')setDirection('forward')
      pendingLink.current=null
    }
    setMenu(false);setInspectorOpen(true);setIsDemo(false)
    setLoadState({type:restored||!pending?'success':'error',message:restored?`Loaded ${next.name||'bundle.json'} and restored the local investigation link.`:pending?`Loaded ${next.name||'bundle.json'}, but its linked evidence IDs were not found. Opened the first available evidence.`:`Loaded ${next.name||'bundle.json'}.`})
    const recent:RecentBundle={name:next.name||'Untitled bundle',language:next.language||'unknown',commit:next.commit||'no commit',lines:next.lines,flows:next.flows.length,loadedAt:Date.now()}
    setRecentBundles(current=>{const updated=[recent,...current.filter(item=>`${item.name}:${item.commit}`!==`${recent.name}:${recent.commit}`)].slice(0,3);window.localStorage.setItem('lachesis-recent-bundles',JSON.stringify(updated));return updated})
    record('Loaded bundle',next.name||'Untitled bundle',`${next.nodes.length} nodes · ${next.flows.length} flows`)
    trackEvent('bundle_loaded',{has_callpaths:next.entries.length>0,flow_count:next.flows.length})
  }

  async function upload(file?:File){
    if(!file)return
    setLoadState({type:'loading',message:`Reading ${file.name}…`})
    try{const text=await file.text();let raw:unknown;try{raw=JSON.parse(text)}catch{throw new Error('This file is not valid JSON.')}activate(normalize(raw))}
    catch(error){setLoadState({type:'error',message:`${error instanceof Error?error.message:'Could not read bundle.json'} The current bundle was kept.`});trackEvent('bundle_load_failed')}
    finally{setDragActive(false)}
  }

  async function uploadComparison(file?:File){if(!file)return;try{const raw=JSON.parse(await file.text());setCompareApp(normalize(raw));setView('compare');setLoadState({type:'success',message:`Loaded ${file.name} as the comparison bundle.`});record('Loaded comparison bundle',file.name,'active bundle kept');trackEvent('comparison_bundle_loaded')}catch(error){setLoadState({type:'error',message:`${error instanceof Error?error.message:'Could not read comparison bundle'} The active bundle was kept.`});trackEvent('comparison_bundle_load_failed')}finally{if(compareFileRef.current)compareFileRef.current.value=''}}

  return <main className="app-shell" id="top" onDragEnter={event=>{event.preventDefault();dragDepth.current+=1;setDragActive(true)}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy'}} onDragLeave={event=>{event.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(dragDepth.current===0)setDragActive(false)}} onDragEnd={()=>{dragDepth.current=0;setDragActive(false)}} onDrop={event=>{event.preventDefault();dragDepth.current=0;setDragActive(false);upload(event.dataTransfer.files?.[0])}}>
    <Header view={view} setView={changeView} app={app} menu={menu} setMenu={setMenu} onUpload={()=>fileRef.current?.click()} onCommand={()=>setCommandOpen(true)} dark={dark} setDark={setDark} recentBundles={recentBundles}/>
    <input id="bundle-upload" ref={fileRef} type="file" accept=".json,application/json" hidden onChange={event=>{upload(event.target.files?.[0]);event.target.value=''}}/>
    <input ref={compareFileRef} type="file" accept=".json,application/json" hidden onChange={event=>uploadComparison(event.target.files?.[0])}/>
    {commandOpen&&<CommandPalette app={app} onClose={()=>setCommandOpen(false)} onView={changeView} onFlow={(nextFlow,nextNode)=>{setView('trace');setFlowId(nextFlow);setStepId(nextNode);setInspectorOpen(true);record('Opened value flow',nextFlow,'via command palette')}} onEntry={(nextIndex,nextHop)=>{setView('journey');setEntryIndex(nextIndex);setHopId(nextHop);setInspectorOpen(true);record('Opened request path',app.entries[nextIndex]?.label??'Unknown entry','via command palette')}} onSink={nextSink=>{setView('investigate');setSinkId(nextSink);record('Focused sink',app.nodes.find(node=>node.id===nextSink)?.label??nextSink,'via command palette')}}/>}
    {dragActive&&<div className="drop-overlay" role="presentation"><div><span className="drop-glyph"><Icon name="upload" size={22}/></span><b>Drop bundle.json to inspect</b><small>Your current bundle changes only after validation succeeds.</small></div></div>}
    {view!=='home'&&<Intro view={view==='compare'?'map':view as Exclude<View,'home'|'compare'>} app={app} loadState={loadState} isDemo={isDemo} onUpload={()=>fileRef.current?.click()}/>} 
    {view==='home'&&<HomeView app={app} isDemo={isDemo} loadState={loadState} onUpload={()=>fileRef.current?.click()} onView={next=>changeView(next)}/>} 
    <InvestigationContext app={app} view={view} flowId={flowId} stepId={stepId} entryIndex={entryIndex} hopId={hopId} sinkId={sinkId}/>
    {view==='trace'&&<TraceView app={app} flowId={flowId} setFlowId={setFlowId} stepId={stepId} setStepId={setStepId} query={query} setQuery={setQuery} direction={direction} setDirection={setDirection} inspectorOpen={inspectorOpen} onInspectorOpen={()=>setInspectorOpen(true)} onInspectorClose={()=>setInspectorOpen(false)} onRecord={record}/>}
    {view==='journey'&&<JourneyView app={app} entryIndex={entryIndex} setEntryIndex={setEntryIndex} hopId={hopId} setHopId={setHopId} inspectorOpen={inspectorOpen} onInspectorOpen={()=>setInspectorOpen(true)} onInspectorClose={()=>setInspectorOpen(false)} onRecord={record}/>}
    {view==='investigate'&&<SinkView app={app} sinkId={sinkId} setSinkId={setSinkId} onRecord={record} onOpenFlow={(nextFlow,nextNode)=>{setView('trace');setFlowId(nextFlow);setStepId(nextNode);setInspectorOpen(true)}}/>}
    {view==='map'&&<OverviewView app={app} onRecord={record}/>} 
    {view==='compare'&&<CompareView base={app} compare={compareApp} onUpload={()=>compareFileRef.current?.click()}/>} 
    {view==='install'&&<InstallView onUpload={()=>fileRef.current?.click()}/>}<ResourceLinks/>
    <InvestigationTrail app={app} items={activity} onClear={()=>setActivity([])}/>
    <footer><span><i className="status-dot"/> Active bundle: <b>{app.name}</b></span><span>Shortcuts: <b>⌘K</b> jump · <b>/</b> search · <b>← →</b> direction · <b>Esc</b> close</span><span className="footer-brand">Lachesis · graph reader</span></footer>
  </main>
}
