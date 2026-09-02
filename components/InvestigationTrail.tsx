'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { entryDisplayName, flowDisplayName, type App } from '../lib/lachesis'
import { readLocal, writeLocal } from '../lib/storage'
import { downloadText } from '../lib/clipboard'
import { trackEvent } from '../lib/analytics'

export type InvestigationEvent={id:number;action:string;target:string;detail:string;at:number}

function targetLabel(app:App,target:string){
  const node=app.nodes.find(item=>item.id===target||item.label===target)
  if(node){
    const scope=node.scope?.label||node.scope?.service||node.scope?.package||node.scope?.module||node.scope?.repository
    const location=node.file?`${node.file}:${node.line||'—'}`:'graph node'
    return `${node.label||node.id} · ${scope||location}`
  }
  const flow=app.flows.find(item=>item.id===target||item.name===target)
  if(flow)return flowDisplayName(flow,app.nodes,app.flows)
  const entry=app.entries.find(item=>item.id===target||item.label===target)
  return entry ? entryDisplayName(entry,app.nodes,app.entries) : target
}

export function InvestigationTrail({app,items,onClear,onReplay}:{app:App;items:InvestigationEvent[];onClear:()=>void;onReplay?:(target:string)=>void}){
  const [open,setOpen]=useState(false)
  const [notes,setNotes]=useState('')
  const [savedNotes,setSavedNotes]=useState('')
  const [confirmClear,setConfirmClear]=useState(false)
  const [exportState,setExportState]=useState<'idle'|'saved'|'failed'>('idle')
  const triggerRef=useRef<HTMLButtonElement>(null)
  const drawerRef=useRef<HTMLElement>(null)
  const notesKey=`lachesis-casefile-notes:${app.name||'untitled'}:${app.commit||'unknown'}`
  useEffect(()=>{setNotes(readLocal(notesKey)??'');setSavedNotes('');setConfirmClear(false)},[notesKey])
  useEffect(()=>{if(!open)return;drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();function onKeyDown(event:KeyboardEvent){if(event.key==='Escape'){setOpen(false);return}if(event.key!=='Tab')return;const focusable=[...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')??[])];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}window.addEventListener('keydown',onKeyDown);return()=>{window.removeEventListener('keydown',onKeyDown);triggerRef.current?.focus()}},[open])
  function saveNotes(){setSavedNotes(writeLocal(notesKey,notes)?'Saved locally':'Available for this session only');window.setTimeout(()=>setSavedNotes(''),1400)}
  function clearHistory(){if(!confirmClear){setConfirmClear(true);window.setTimeout(()=>setConfirmClear(false),2600);return}onClear();setConfirmClear(false)}
  function exportTrail(){const rows=items.slice().reverse().map(item=>`- **${item.action}** — ${targetLabel(app,item.target)}${item.detail?` (${item.detail})`:''}`).join('\n');const sourcePreviews=app.nodes.filter(node=>Boolean(node.snippet.trim()||node.sourceWindow?.lines.length)).length;const limitations=app.coverage.limitations.length?`\n\n## Bundle limitations\n\n${app.coverage.limitations.map(limitation=>`- ${limitation}`).join('\n')}`:'';const body=`# Lachesis code exploration\n\nBundle: ${app.name||'Untitled'}\nRevision: ${app.commit||'unknown'}\n\n## Bundle context\n\n- Graph nodes: ${app.nodes.length}\n- Relationships: ${app.edges.length}\n- Source previews: ${sourcePreviews} / ${app.nodes.length}\n- Graph paths: ${app.flows.length}\n- Request flows: ${app.entries.length}${limitations}\n\n## Notes\n\n${notes||'No notes recorded.'}\n\n## Exploration history\n\n${rows||'No exploration steps recorded.'}\n`;try{downloadText(body,'lachesis-code-exploration.md');setExportState('saved');trackEvent('exploration_history_downloaded');window.setTimeout(()=>setExportState('idle'),1800)}catch{setExportState('failed');trackEvent('exploration_history_download_failed')}}
  function isReplayable(target:string){return Boolean(app.nodes.some(item=>item.id===target||item.label===target)||app.flows.some(item=>item.id===target||item.name===target)||app.entries.some(item=>item.id===target||item.label===target))}
  return <>
    <button type="button" ref={triggerRef} className="trail-trigger" onClick={()=>setOpen(true)} aria-label="Open exploration history" aria-expanded={open} aria-controls="investigation-trail"><Icon name="history" size={15}/><span>History</span>{items.length>0&&<b>{items.length}</b>}</button>
    {open&&<div className="trail-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><aside id="investigation-trail" ref={drawerRef} className="trail-drawer" role="dialog" aria-modal="true" aria-label="Exploration history">
      <header><div><span className="panel-label">LOCAL WORKSPACE</span><h2>Exploration history</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close exploration history"><Icon name="close" size={14}/></button></header>
      <p className="trail-intro">A local record of the paths and symbols you opened. Nothing here is sent through analytics.</p>
      <section className="casefile-notes"><span className="panel-label">NOTES</span><textarea value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Record what you learned or what to inspect next…" aria-label="Exploration notes"/><button type="button" onClick={saveNotes}>{savedNotes||'Save note'}</button></section>
      <div className="trail-actions"><button type="button" onClick={exportTrail} disabled={!items.length&&!notes} aria-live="polite">{exportState==='saved'?'Markdown saved':exportState==='failed'?'Download failed':'Export Markdown'}</button><button type="button" className={confirmClear?'confirming':''} onClick={clearHistory} disabled={!items.length} aria-live="polite">{confirmClear?'Clear history?':'Clear'}</button></div>
      <ol className="trail-list">{items.length?items.map((item,index)=>{const replayable=Boolean(onReplay&&isReplayable(item.target));const content=<><span>{String(items.length-index).padStart(2,'0')}</span><div><b>{item.action}</b><strong>{targetLabel(app,item.target)}</strong><small>{item.detail}</small></div><time>{new Date(item.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></>;return <li key={item.id}>{replayable?<button type="button" className="trail-item" onClick={()=>{onReplay?.(item.target);setOpen(false)}} aria-label={`Reopen ${targetLabel(app,item.target)}`}>{content}<Icon name="arrow" size={12}/></button>:<div className="trail-item">{content}</div>}</li>}):<li className="trail-empty"><span>00</span><div><b>No steps yet</b><small>Open a path or graph node to begin.</small></div></li>}</ol>
    </aside></div>}
  </>
}
