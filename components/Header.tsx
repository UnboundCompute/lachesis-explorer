'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { App } from '../lib/lachesis'
import { trackEvent } from '../lib/analytics'

type View = 'home' | 'trace' | 'journey' | 'investigate' | 'map' | 'compare' | 'install'
export type RecentBundle = { name: string; language: string; commit: string; lines: number; flows: number; loadedAt: number }
type Props = { view: View; setView: (view: View) => void; app: App; menu: boolean; setMenu: (open: boolean) => void; onUpload: () => void; onCommand: () => void; dark: boolean; setDark: (dark: boolean) => void; recentBundles: RecentBundle[]; canGoBack: boolean; canGoForward: boolean; onGoBack: () => void; onGoForward: () => void }

const primary: Array<{ id: View; label: string; detail: string }> = [
  { id: 'home', label: 'Understand', detail: 'Start with a question' },
  { id: 'trace', label: 'Trace', detail: 'Follow one behavior' },
  { id: 'map', label: 'Explore', detail: 'See the codebase' },
  { id: 'compare', label: 'Compare', detail: 'Review revisions' },
]
const secondary: Array<{ id: View; label: string; detail: string }> = [
  { id: 'journey', label: 'Request flow', detail: 'Walk from starting point to effect' },
  { id: 'investigate', label: 'What reaches here', detail: 'Compare incoming paths' },
  { id: 'install', label: 'Setup', detail: 'Build graphs locally' },
]

export function Header({ view, setView, app, menu, setMenu, onUpload, onCommand, dark, setDark, recentBundles, canGoBack, canGoForward, onGoBack, onGoForward }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [mobileLensOpen, setMobileLensOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileLensRef = useRef<HTMLDivElement>(null)
  const appPickerRef = useRef<HTMLDivElement>(null)
  const appTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    const items = () => [...(moreRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    items()[0]?.focus()
    function close(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      const menuItems = items()
      const current = menuItems.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'Escape') {
        event.preventDefault()
        setMoreOpen(false)
        moreTriggerRef.current?.focus()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        menuItems[(current + delta + menuItems.length) % menuItems.length]?.focus()
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        menuItems[event.key === 'Home' ? 0 : menuItems.length - 1]?.focus()
        return
      }
      if (event.key === 'Tab') setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  useEffect(() => {
    if (!mobileLensOpen) return
    const items = () => [...(mobileLensRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    items()[0]?.focus()
    function close(event: MouseEvent) {
      if (!mobileLensRef.current?.contains(event.target as Node)) setMobileLensOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      const menuItems = items()
      const current = menuItems.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileLensOpen(false)
        mobileLensRef.current?.querySelector<HTMLButtonElement>('.mobile-lens-trigger')?.focus()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        menuItems[(current + delta + menuItems.length) % menuItems.length]?.focus()
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        menuItems[event.key === 'Home' ? 0 : menuItems.length - 1]?.focus()
        return
      }
      if (event.key === 'Tab') setMobileLensOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileLensOpen])

  useEffect(() => {
    if (!menu) return
    appPickerRef.current?.querySelector<HTMLButtonElement>('.upload-action')?.focus()
    function close(event: MouseEvent) {
      if (!appPickerRef.current?.contains(event.target as Node)) {
        setMenu(false)
        appTriggerRef.current?.focus()
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenu(false)
        appTriggerRef.current?.focus()
        return
      }
      if (event.key === 'Tab') setMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu, setMenu])

  useEffect(() => {
    document.querySelector<HTMLElement>('.nav-tab[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [view])

  function choose(next: View) {
    setView(next)
    setMoreOpen(false)
    setMobileLensOpen(false)
    setMenu(false)
    trackEvent('view_changed', { view: next })
  }

  const currentLens = [...primary, ...secondary].find(item => item.id === view) ?? primary[0]

  return (
    <div className="topbar-wrap">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Lachesis Explorer home" onClick={event => { event.preventDefault(); choose('home') }}>
          <span className="brand-mark"><i /><i /><i /></span>
          <span><b>Lachesis</b><small>graph explorer</small></span>
        </a>
        <nav className="nav-tabs" aria-label="Primary analysis lenses">
          {primary.map(item => (
            <button type="button" key={item.id} className={view === item.id ? 'nav-tab active' : 'nav-tab'} aria-current={view === item.id ? 'page' : undefined} onClick={() => choose(item.id)}>
              <span>{item.label}</span><small>{item.detail}</small>
            </button>
          ))}
        </nav>
        <div className="mobile-lens-picker" ref={mobileLensRef}>
          <button type="button" className="mobile-lens-trigger" aria-expanded={mobileLensOpen} aria-controls="mobile-analysis-menu" aria-haspopup="menu" onClick={() => { setMenu(false); setMobileLensOpen(open => !open) }}>
            <span><small>Current lens</small><b>{currentLens.label}</b></span><Icon name="chevron" size={12} />
          </button>
          {mobileLensOpen && (
            <div id="mobile-analysis-menu" className="mobile-lens-menu" role="menu" aria-label="Analysis lenses">
              {[...primary, ...secondary].map(item => (
                <button type="button" key={item.id} role="menuitem" aria-current={view === item.id ? 'page' : undefined} onClick={() => choose(item.id)}>
                  <span><b>{item.label}</b><small>{item.detail}</small></span><Icon name="arrow" size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="more-views" ref={moreRef}>
          <button ref={moreTriggerRef} type="button" className={secondary.some(item => item.id === view) ? 'nav-tab active' : 'nav-tab'} aria-current={secondary.some(item => item.id === view) ? 'page' : undefined} onClick={() => { setMenu(false); setMobileLensOpen(false); setMoreOpen(open => !open) }} aria-expanded={moreOpen} aria-controls="more-analysis-menu" aria-haspopup="menu">
            <span>More</span><small>Focused views</small><Icon name="chevron" size={11} />
          </button>
          {moreOpen && (
            <div id="more-analysis-menu" className="more-menu" role="menu" aria-label="More analysis views">
              {secondary.map(item => (
                <button type="button" key={item.id} role="menuitem" tabIndex={-1} aria-current={view === item.id ? 'page' : undefined} onClick={() => choose(item.id)}>
                  <span><b>{item.label}</b><small>{item.detail}</small></span><Icon name="arrow" size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="header-actions">
          <div className="navigation-controls desktop-navigation-controls" role="group" aria-label="Investigation navigation">
            <button type="button" onClick={onGoBack} disabled={!canGoBack} aria-label="Go back in investigation" title={canGoBack ? "Go back in investigation" : "No earlier investigation state"}><Icon name="back" size={15} /></button>
            <button type="button" onClick={onGoForward} disabled={!canGoForward} aria-label="Go forward in investigation" title={canGoForward ? "Go forward in investigation" : "No later investigation state"}><Icon name="forward" size={15} /></button>
          </div>
          <button type="button" className="command-trigger" onClick={onCommand} aria-label="Open command palette"><Icon name="search" size={14} /><span>Jump</span><kbd>⌘K /</kbd></button>
          <button type="button" className="theme-toggle" suppressHydrationWarning aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} onClick={() => { setDark(!dark); trackEvent('theme_toggled', { theme: dark ? 'light' : 'dark' }) }}><Icon name={dark ? 'sun' : 'moon'} size={15} /><span>{dark ? 'Light' : 'Dark'}</span></button>
          <div className="app-picker" ref={appPickerRef}>
            <button ref={appTriggerRef} type="button" className="repo-control" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="bundle-context-menu" aria-haspopup="dialog">
              <span className="status-dot" /><span><small>Active bundle</small><b>{app.name || 'Untitled bundle'}</b></span><Icon name="chevron" size={14} />
            </button>
            {menu && (
              <div id="bundle-context-menu" className="app-menu" role="dialog" aria-label="Bundle context">
                <span className="menu-title">BUNDLE CONTEXT</span>
                <div className="active-bundle">
                  <span className="status-dot" />
                  <span><b>{app.name || 'Untitled bundle'}</b><small>{app.language || 'unknown'} · {app.commit || 'no commit'}</small></span>
                </div>
                {app.bundle.description && <p className="bundle-description">{app.bundle.description}</p>}
                {app.coverage.limitations[0] && <p className="bundle-coverage-warning"><i />{app.coverage.limitations[0]}</p>}
                <div className="menu-metrics"><span><b>{app.nodes.length}</b> nodes</span><span><b>{app.flows.length}</b> graph paths</span><span><b>{app.entries.length}</b> request flows</span></div>
                {recentBundles.length > 0 && (
                  <div className="recent-bundles">
                    <span className="menu-title">RECENT METADATA · LOCAL ONLY</span>
                    {recentBundles.map(item => <div className="recent-bundle" key={`${item.name}:${item.commit}`}><span><b>{item.name}</b><small>{item.language} · {item.commit}</small></span><em>{item.flows} flows</em></div>)}
                  </div>
                )}
                <button type="button" className="upload-action" onClick={() => { setMenu(false); onUpload(); trackEvent('bundle_upload_started') }}><span>Load another bundle</span><span className="button-icon"><Icon name="upload" size={14} /></span></button>
              </div>
            )}
          </div>
        </div>
      </header>
      {(canGoBack || canGoForward) && <div className="navigation-controls mobile-navigation-controls" role="group" aria-label="Investigation navigation">
        <span className="mobile-navigation-label">History</span>
        <button type="button" onClick={onGoBack} disabled={!canGoBack} aria-label="Go back in investigation" title={canGoBack ? "Go back in investigation" : "No earlier investigation state"}><Icon name="back" size={15} /></button>
        <button type="button" onClick={onGoForward} disabled={!canGoForward} aria-label="Go forward in investigation" title={canGoForward ? "Go forward in investigation" : "No later investigation state"}><Icon name="forward" size={15} /></button>
      </div>}
    </div>
  )
}
