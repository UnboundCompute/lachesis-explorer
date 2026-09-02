'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Flow, Node } from '../lib/lachesis'
import { trackEvent } from '../lib/analytics'

type Props = { flows: Flow[]; nodes: Node[]; sinkId: string; selectedId: string; onSelect: (nodeId: string) => void; securityMode?: boolean }
type Point = { id: string; x: number; y: number; node: Node; roles: Set<string>; lanes: Set<number> }
type ConvergenceEdge = { source: string; target: string; relation: string; alias: boolean; dynamic: boolean }

const short = (value: string, limit = 17) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value
const scopeKey = (node: Node) => node.scope ? [node.scope.repository, node.scope.service, node.scope.package, node.scope.module, node.scope.kind].filter(Boolean).join(' · ') : ''
const scopeLabel = (node: Node) => node.scope?.label || node.scope?.service || node.scope?.package || node.scope?.module || node.scope?.repository || ''
const scopeKind = (node: Node) => node.scope?.kind?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unscoped'
const nodeLocation = (node: Node) => `${node.file || 'source unavailable'}:${node.line || '—'}`

function pathLocation(flow: Flow, nodes: Node[]) {
  const pathNodes = flow.steps.map(step => nodes.find(node => node.id === step.node_id)).filter(Boolean)
  if (!pathNodes.length) return 'source unavailable'
  const first = pathNodes[0]!
  return `${first.file || 'source unavailable'}:${first.line || '—'}`
}

export function ConvergenceCanvas({ flows: allFlows, nodes, sinkId, selectedId, onSelect, securityMode = true }: Props) {
  const [zoom, setZoom] = useState(1)
  const [focusedOnly, setFocusedOnly] = useState(false)
  const flowIdentity = allFlows.map(flow => `${flow.id}:${flow.steps.map(step => step.node_id).join(',')}`).join('|')
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  useEffect(() => { setZoom(1); setFocusedOnly(false) }, [flowIdentity, sinkId, selectedId])
  const flows = focusedOnly && selectedId
    ? allFlows.filter(flow => flow.steps.some(step => step.node_id === selectedId))
    : allFlows
  const graph = useMemo(() => {
    const occurrences = new Map<string, Array<{ distance: number; lane: number; role: string }>>()
    const edges = new Map<string, ConvergenceEdge>()
    flows.forEach((flow, lane) => {
      const sinkIndex = flow.steps.findIndex(step => step.node_id === sinkId)
      if (sinkIndex < 0) return
      flow.steps.slice(0, sinkIndex + 1).forEach((step, index) => {
        const current = occurrences.get(step.node_id) ?? []
        current.push({ distance: sinkIndex - index, lane, role: step.role })
        occurrences.set(step.node_id, current)
        if (index > 0) {
          const previous = flow.steps[index - 1]
          const key = `${previous.node_id}:${step.node_id}`
          const existing = edges.get(key)
          edges.set(key, {
            source: previous.node_id,
            target: step.node_id,
            relation: existing?.relation || step.edge?.relation || step.role || 'connected',
            alias: Boolean(existing?.alias || step.edge?.alias),
            dynamic: Boolean(existing?.dynamic || step.edge?.dynamic),
          })
        }
      })
    })
    const points = new Map<string, Point>()
    occurrences.forEach((items, id) => {
      const distance = Math.max(...items.map(item => item.distance))
      const lanes = new Set(items.map(item => item.lane))
      const y = items.reduce((sum, item) => sum + 72 + item.lane * 82, 0) / items.length
      const node = nodeById.get(id)
      if (node) points.set(id, { id, x: 690 - distance * 142, y, node, roles: new Set(items.map(item => item.role)), lanes })
    })
    const width = Math.max(760, Math.max(...[...points.values()].map(point => point.x)) + 70)
    const height = Math.max(250, flows.length * 82 + 92)
    return { points, edges: [...edges.values()], width, height }
  }, [flows, nodeById, sinkId])
  const ordered = [...graph.points.values()].sort((a, b) => a.x - b.x || a.y - b.y)
  const selectedPoint = selectedId ? graph.points.get(selectedId) : undefined
  const selectedRef = useRef<HTMLButtonElement>(null)
  const selectedGraphRef = useRef<SVGGElement>(null)
  const focusAfterSelection = useRef(false)
  useEffect(() => {
    const activeElement = document.activeElement
    if (!focusAfterSelection.current && !activeElement?.closest('.convergence-canvas')) {
      return
    }
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
    selectedGraphRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if (focusAfterSelection.current) {
      selectedGraphRef.current?.focus()
      focusAfterSelection.current = false
    }
  }, [selectedId])

  const pathLabel = securityMode ? 'value flows' : 'graph paths'
  const canvasStyle = { width: `${zoom * 100}%`, minWidth: `${Math.max(760, graph.width) * zoom}px`, height: `${graph.height * zoom}px` }
  const focusDisabledReason = !selectedPoint
    ? selectedId
      ? 'The selected node is outside this boundary’s paths.'
      : 'Select a node in the field or list to focus its paths.'
    : allFlows.length < 2
      ? 'Focus mode needs at least two reaching paths.'
      : undefined
  const focusStatus = focusedOnly
    ? `Showing ${flows.length} paths containing ${selectedPoint?.node.label || selectedId}.`
    : focusDisabledReason || 'Showing every path that reaches this boundary.'
  return <section className="convergence-canvas" aria-label={`Converging ${pathLabel}`} aria-keyshortcuts="ArrowLeft ArrowRight Home End">
    <header className="convergence-bar"><div><span className="canvas-title">Convergence field</span><span className="canvas-count">{flows.length} paths · {graph.points.size} unique nodes</span>{selectedPoint && <span className="convergence-selected" aria-live="polite">Selected · {selectedPoint.node.label || selectedPoint.id}</span>}</div><div className="zoom-controls" role="group" aria-label="Graph zoom"><button type="button" onClick={() => setZoom(value => Math.max(.7, Number((value - .1).toFixed(1))))} aria-label="Zoom out">−</button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button type="button" onClick={() => setZoom(value => Math.min(1.5, Number((value + .1).toFixed(1))))} aria-label="Zoom in">+</button><button type="button" onClick={() => setZoom(1)}>Reset</button></div></header>
    <div className="convergence-filter" role="group" aria-label="Convergence display filter">
      <span aria-live="polite" aria-atomic="true">{focusStatus}</span>
      <button type="button" className={focusedOnly ? 'active' : ''} aria-pressed={focusedOnly} onClick={() => { const next = !focusedOnly; setFocusedOnly(next); trackEvent('convergence_focus_toggled', { focused: next }) }} disabled={Boolean(focusDisabledReason)} title={focusDisabledReason}>
        {focusedOnly ? 'Show all paths' : 'Focus selected node'}
      </button>
    </div>
    <div className="convergence-viewport"><svg viewBox={`0 0 ${graph.width} ${graph.height}`} style={canvasStyle} aria-label="Interactive convergence field" focusable="false"><defs>{(["exact", "alias", "dynamic"] as const).map(kind => <marker key={kind} id={`convergence-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" className={`convergence-arrow convergence-arrow-${kind}`} /></marker>)}</defs>{flows.map((flow, lane) => <text key={flow.id} className="lane-label" x="18" y={76 + lane * 82}>{short(`${String(lane + 1).padStart(2, '0')} · ${flow.name} · ${pathLocation(flow, nodes)}`, 32)}</text>)}{graph.edges.map(edge => { const source = graph.points.get(edge.source); const target = graph.points.get(edge.target); if (!source || !target) return null; const edgeClass = edge.dynamic ? 'dynamic' : edge.alias ? 'alias' : 'exact'; const boundary = scopeKey(source.node) !== scopeKey(target.node) && Boolean(scopeKey(source.node) || scopeKey(target.node)); return <g key={`${edge.source}:${edge.target}`}><path className={`convergence-edge ${edgeClass}${boundary ? ' boundary' : ''}`} markerEnd={`url(#convergence-arrow-${edgeClass})`} d={`M${source.x + 25} ${source.y} C${source.x + 66} ${source.y},${target.x - 66} ${target.y},${target.x - 25} ${target.y}`}><title>{source.node.label || source.id} → {target.node.label || target.id}: {boundary ? 'context boundary · ' : ''}{edge.relation || 'connected'}</title></path><text className={`convergence-edge-label ${edgeClass}`} x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 10} textAnchor="middle">{short(edge.relation || 'connected')}</text></g> })}{ordered.map((point, index) => { const selected = point.id === selectedId; const select = () => onSelect(point.id); const navigate = (event: KeyboardEvent<SVGGElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); return } const isNavigationKey = ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key); if (isNavigationKey) event.preventDefault(); const nextIndex = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? ordered.length - 1 : -1; if (nextIndex >= 0 && nextIndex < ordered.length) { focusAfterSelection.current = true; onSelect(ordered[nextIndex].id) } }; const roleClasses = [...point.roles].map(role => `role-${role.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).join(' '); return <g ref={selected ? selectedGraphRef : undefined} key={point.id} className={`convergence-node kind-${point.node.kind} scope-${scopeKind(point.node)} ${roleClasses}${selected ? ' selected' : ''}`} onClick={(event) => { event.currentTarget.focus(); select() }} onKeyDown={navigate} role="button" tabIndex={0} aria-pressed={selected} aria-label={`${point.node.label || point.id}, ${[...point.roles].join(' / ')}${scopeLabel(point.node) ? `, ${scopeLabel(point.node)}` : ''}${point.node.scope?.kind ? `, ${point.node.scope.kind} boundary` : ''}, ${nodeLocation(point.node)}`}><title>{point.node.label || point.id}</title><circle className="convergence-halo" cx={point.x} cy={point.y} r="34" /><circle className="convergence-body" cx={point.x} cy={point.y} r="24" /><text className="convergence-index" x={point.x} y={point.y + 4} textAnchor="middle">{String(index + 1).padStart(2, '0')}</text><text className="convergence-role" x={point.x} y={point.y + 43} textAnchor="middle">{short([...point.roles].join('/'), 14)}</text></g> })}</svg></div>
    <div className="convergence-legend" aria-label="Convergence relationship legend"><span title="The bundle recorded this relationship directly"><i className="legend-exact" />recorded relationship</span><span title="The relationship uses an alternate or aliased name"><i className="legend-alias" />alternate relationship</span><span title="The relationship depends on runtime behavior"><i className="legend-dynamic" />runtime-dependent relationship</span><span title="The connection crosses a module, service, or repository boundary"><i className="legend-boundary" />module / service boundary</span><span title="This path ends at the selected destination"><i className="legend-sink" />toward destination</span>{ordered.some(point => scopeKind(point.node) === 'external') && <span title="This symbol belongs to external code"><i className="legend-scope-external" />external code</span>}{ordered.some(point => scopeKind(point.node) === 'generated') && <span title="This symbol belongs to generated code"><i className="legend-scope-generated" />generated code</span>}</div>
    <div className="convergence-index-list" aria-label="Graph nodes">{ordered.map((point, index) => <button ref={point.id === selectedId ? selectedRef : undefined} type="button" key={point.id} className={point.id === selectedId ? 'selected' : ''} onClick={() => onSelect(point.id)} title={`${point.node.label || point.id} · ${nodeLocation(point.node)}`} aria-pressed={point.id === selectedId} aria-current={point.id === selectedId ? 'step' : undefined} aria-label={`${point.node.label || point.id}, node ${index + 1} of ${ordered.length}, ${[...point.roles].join(' / ')}${scopeLabel(point.node) ? `, ${scopeLabel(point.node)}` : ''}, ${nodeLocation(point.node)}`}><span>{String(index + 1).padStart(2, '0')}</span><b>{point.node.label || point.id}</b><small>{[...point.roles].join(' · ')} · {scopeLabel(point.node) ? `${scopeLabel(point.node)} · ` : ''}{point.node.file || 'Source unavailable'}:{point.node.line || '—'}</small></button>)}</div>
  </section>
}
