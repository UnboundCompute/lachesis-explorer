'use client'

import { useEffect, useRef, useState } from 'react'
import { Header } from '../components/Header'
import { Intro } from '../components/Intro'
import { InstallView } from '../components/InstallView'
import { JourneyView } from '../components/JourneyView'
import { TraceView } from '../components/TraceView'
import { ResourceLinks } from '../components/ResourceLinks'
import { starter, normalize, type App } from '../lib/lachesis'
import { trackEvent } from '../lib/analytics'

type View = 'trace' | 'journey' | 'install'

export default function Page() {
  const [view,setView]=useState<View>('trace')
  const [direction,setDirection]=useState<'backward'|'forward'>('backward')
  const [app,setApp]=useState<App>(starter)
  const [menu,setMenu]=useState(false)
  const [dark,setDark]=useState(true)
  const [flowId,setFlowId]=useState(starter.flows[0].id)
  const [stepId,setStepId]=useState(starter.flows[0].steps[0].node_id)
  const [entryIndex,setEntryIndex]=useState(0)
  const [hopId,setHopId]=useState(starter.entries[0].hops[0].node_id)
  const [query,setQuery]=useState('')
  const [notice,setNotice]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{ const stored=window.localStorage.getItem('lachesis-theme'); if(stored==='light') setDark(false) },[])
  useEffect(()=>{ document.documentElement.dataset.theme=dark?'dark':'light'; window.localStorage.setItem('lachesis-theme',dark?'dark':'light') },[dark])
  function activate(next:App){setApp(next);setFlowId(next.flows[0]?.id??'');setStepId(next.flows[0]?.steps[0]?.node_id??next.nodes[0]?.id??'');setEntryIndex(0);setHopId(next.entries[0]?.hops[0]?.node_id??next.nodes[0]?.id??'');setMenu(false);setNotice(`Loaded ${next.name || 'bundle.json'}`);trackEvent('bundle_loaded',{has_callpaths:next.entries.length>0,flow_count:next.flows.length})}
  async function upload(file?:File){if(!file)return;try{activate(normalize(JSON.parse(await file.text())))}catch(error){setNotice(error instanceof Error?error.message:'Could not read bundle.json');trackEvent('bundle_load_failed')}}
  return <main className="app-shell" id="top"><Header view={view} setView={setView} app={app} menu={menu} setMenu={setMenu} onUpload={()=>fileRef.current?.click()} dark={dark} setDark={setDark}/><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>upload(e.target.files?.[0])}/><Intro view={view} app={app} notice={notice}/>{view==='trace'&&<TraceView app={app} flowId={flowId} setFlowId={setFlowId} stepId={stepId} setStepId={setStepId} query={query} setQuery={setQuery} direction={direction} setDirection={setDirection}/>} {view==='journey'&&<JourneyView app={app} entryIndex={entryIndex} setEntryIndex={setEntryIndex} hopId={hopId} setHopId={setHopId}/>} {view==='install'&&<InstallView onUpload={()=>fileRef.current?.click()}/>}<ResourceLinks/><footer><span><i className="status-dot"/> Active bundle: <b>{app.name}</b></span><span>Trace-your-own runs locally. <b>No model in the loop.</b></span><span className="footer-brand">Lachesis · graph reader</span></footer></main>
}
