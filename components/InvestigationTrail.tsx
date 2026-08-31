'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { App } from '../lib/lachesis'
import { readLocal, writeLocal } from '../lib/storage'

export type InvestigationEvent={id:number;action:string;target:string;detail:string;at:number}

function targetLabel(app:App,target:string){
  const node=app.nodes.find(item=>item.id===target||item.label===target)
  if(node){
    const scope=node.scope?.label||node.scope?.service||node.scope?.package||node.scope?.module||node.scope?.repository
    const location=node.file?`${node.file}:${node.line||'—'}`:'graph node'
    return `${node.label||node.id} · ${scope||location}`
  }
  const flow=app.flows.find(item=>item.id===target||item.name===target)
  if(flow)return flow.name
  const entry=app.entries.find(item=>item.id===target||item.label===target)
  return entry?.label||target
}

export function InvestigationTrail({app,items,onClear}:{app:App;items:InvestigationEvent[];onClear:()=>void}){
  const [open,setOpen]=useState(false)
  const [notes,setNotes]=useState('')
  const [savedNotes,setSavedNotes]=useState('')
  const triggerRef=useRef<HTMLButtonElement>(null)
  const drawerRef=useRef<HTMLElement>(null)
  const notesKey=`lachesis-casefile-notes:${app.name||'untitled'}:${app.commit||'unknown'}`
  useEffect(()=>{setNotes(readLocal(notesKey)??'');setSavedNotes('')},[notesKey])
  useEffect(()=>{if(!open)return;drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();function onKeyDown(event:KeyboardEvent){if(event.key==='Escape'){setOpen(false);return}if(event.key!=='Tab')return;const focusable=[...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')??[])];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}window.addEventListener('keydown',onKeyDown);return()=>{window.removeEventListener('keydown',onKeyDown);triggerRef.current?.focus()}},[open])
  function saveNotes(){setSavedNotes(writeLocal(notesKey,notes)?'Saved locally':'Available for this session only');window.setTimeout(()=>setSavedNotes(''),1400)}
  function exportTrail(){const rows=items.slice().reverse().map(item=>`- **${item.action}** — ${targetLabel(app,item.target)}${item.detail?` (${item.detail})`:''}`).join('\n');const body=`# Lachesis investigation\n\nBundle: ${app.name||'Untitled'}\nRevision: ${app.commit||'unknown'}\n\n## Notes\n\n${notes||'No notes recorded.'}\n\n## Trail\n\n${rows||'No investigation steps recorded.'}\n`;const href=URL.createObjectURL(new Blob([body],{type:'text/markdown'}));const link=document.createElement('a');link.href=href;link.download='lachesis-investigation.md';link.click();URL.revokeObjectURL(href)}
  return <><button type="button" ref={triggerRef} className="trail-trigger" onClick={()=>setOpen(true)} aria-label="Open investigation trail" aria-expanded={open} aria-controls="investigation-trail"><Icon name="history" size={15}/><span>Trail</span>{items.length>0&&<b>{items.length}</b>}</button>{open&&<div className="trail-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><aside id="investigation-trail" ref={drawerRef} className="trail-drawer" role="dialog" aria-modal="true" aria-label="Investigation trail"><header><div><span className="panel-label">LOCAL ANALYSIS PROVENANCE</span><h2>Investigation trail</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close investigation trail"><Icon name="close" size={14}/></button></header><p className="trail-intro">A local record of how you moved through this bundle. Nothing here is sent through analytics.</p><section className="casefile-notes"><span className="panel-label">CASEFILE NOTES</span><textarea value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Record a hypothesis, follow-up, or caveat…" aria-label="Casefile notes"/><button type="button" onClick={saveNotes}>{savedNotes||'Save note'}</button></section><div className="trail-actions"><button type="button" onClick={exportTrail} disabled={!items.length&&!notes}>Export Markdown</button><button type="button" onClick={onClear} disabled={!items.length}>Clear</button></div><ol className="trail-list">{items.length?items.map((item,index)=><li key={item.id}><span>{String(items.length-index).padStart(2,'0')}</span><div><b>{item.action}</b><strong>{targetLabel(app,item.target)}</strong><small>{item.detail}</small></div><time>{new Date(item.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></li>):<li className="trail-empty"><span>00</span><div><b>No steps yet</b><small>Select a value, request node, or sink to begin.</small></div></li>}</ol></aside></div>}</>
}
