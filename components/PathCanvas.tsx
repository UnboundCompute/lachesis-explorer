'use client'

import { useEffect, useRef, useState } from 'react'
import type { LayoutPoint, Node, Step } from '../lib/lachesis'
import { trackEvent } from '../lib/analytics'

export type PathItem = {
  id: string
  node: Node
  label: string
  caption?: string
  occurrenceId?: string
  relation?: string
  edge?: Step['edge']
}

type Props = {
  items: PathItem[]
  selectedId: string
  selectedIndex?: number
  onSelect: (id: string, index: number) => void
  points?: Array<LayoutPoint | undefined>
  layoutSource: 'precomputed' | 'derived'
  title?: string
}

const shorten = (value: string, limit = 18) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value

const nodeLocation = (node: Node) =>
  `${node.file || 'Source unavailable'}:${node.line || '—'}`

const nodeFile = (node: Node) =>
  node.file ? node.file.split('/').pop() || node.file : 'Source unavailable'

const scopeKey = (node: Node) => {
  const scope = node.scope
  if (!scope) return ''
  return [scope.repository, scope.service, scope.package, scope.module, scope.kind].filter(Boolean).join(' · ')
}

const scopeLabel = (node: Node) => {
  const scope = node.scope
  if (!scope) return 'No boundary metadata'
  return scope.label || scope.service || scope.package || scope.module || scope.repository || 'Unlabelled boundary'
}

const scopeKind = (node: Node) =>
  node.scope?.kind?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || ''

export function PathCanvas({
  items,
  selectedId,
  selectedIndex: requestedIndex,
  onSelect,
  points,
  layoutSource,
  title = 'Evidence path',
}: Props) {
  const itemUnit =
    title === 'Code path' ? 'symbols' : title === 'Request path' ? 'hops' : 'nodes'
  const [viewport, setViewport] = useState<'fit' | 'reset'>('fit')
  const [focused, setFocused] = useState(false)
  const [zoom, setZoom] = useState(1)
  function adjustZoom(delta: number) {
    const next = Math.max(.75, Math.min(1.5, Number((zoom + delta).toFixed(1))))
    if (next !== zoom) trackEvent('path_zoom_changed', { direction: delta > 0 ? 'in' : 'out' })
    setZoom(next)
  }
  const selectedRef = useRef<HTMLButtonElement>(null)
  const selectedIndex = Math.max(
    0,
    requestedIndex != null && items[requestedIndex]?.id === selectedId
      ? requestedIndex
      : items.findIndex((item) => item.id === selectedId),
  )
  const start = focused ? Math.max(0, selectedIndex - 2) : 0
  const end = focused ? Math.min(items.length, selectedIndex + 3) : items.length
  const shown = items.slice(start, end)
  const shownPoints = points?.slice(start, end)
  const resolved = shown.map((_, index) =>
    shownPoints?.[index] ?? {
      x: 78 + index * (564 / Math.max(1, shown.length - 1)),
      y: 116,
    },
  )
  const selectedItem = items[selectedIndex]
  const occurrenceNumbers = items.reduce<number[]>((result, item, index) => {
    result[index] = items.slice(0, index).filter((previous) => previous.id === item.id).length + 1
    return result
  }, [])
  const idCounts = new Map<string, number>()
  items.forEach((item) => idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1))
  const repeatedIds = new Set(items.filter((item) => (idCounts.get(item.id) ?? 0) > 1).map((item) => item.id))
  const boundaries = shown.reduce<Array<{ key: string; label: string; start: number; end: number }>>((result, item, index) => {
    const key = scopeKey(item.node)
    const previous = result.at(-1)
    if (previous?.key === key) previous.end = index
    else result.push({ key, label: scopeLabel(item.node), start: index, end: index })
    return result
  }, [])

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId, selectedIndex, start])

  const xs = resolved.map((point) => point.x)
  const ys = resolved.map((point) => point.y)
  const minX = Math.min(0, ...xs) - 48
  const maxX = Math.max(672, ...xs) + 48
  const minY = Math.min(0, ...ys) - 52
  const maxY = Math.max(220, ...ys) + 72
  const viewBox =
    viewport === 'fit'
      ? `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
      : '0 0 720 250'

  return (
    <div className="path-canvas">
      <div className="canvas-bar">
        <div>
          <span className="canvas-title">{title}</span>
          <span className="canvas-count">
            {focused ? `${start + 1}–${end} of ` : ''}
            {items.length} {itemUnit}
          </span>
        </div>
        <div className="canvas-actions">
          <span className={`layout-source ${layoutSource}`}>
            <i />
            {layoutSource === 'precomputed' ? 'Bundle layout' : 'Derived layout'}
          </span>
          <button
            type="button"
            className={focused ? 'active' : ''}
            aria-pressed={focused}
            onClick={() => setFocused((value) => !value)}
          >
            {focused ? 'Show full path' : 'Focus selection'}
          </button>
          <button
            type="button"
            className={viewport === 'fit' ? 'active' : ''}
            aria-pressed={viewport === 'fit'}
            onClick={() => setViewport('fit')}
          >
            Fit
          </button>
          <button
            type="button"
            className={viewport === 'reset' ? 'active' : ''}
            aria-pressed={viewport === 'reset'}
            onClick={() => { setViewport('reset'); setZoom(1) }}
          >
            Reset
          </button>
          <div className="zoom-controls" aria-label="Path zoom">
            <button type="button" onClick={() => adjustZoom(-.1)} aria-label="Zoom path out">−</button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" onClick={() => adjustZoom(.1)} aria-label="Zoom path in">+</button>
          </div>
        </div>
      </div>

      {selectedItem && (
        <div className="path-reading-cue" aria-live="polite">
          <span>NOW READING · STEP {String(selectedIndex + 1).padStart(2, '0')}</span>
          <strong>{selectedItem.node.label || selectedItem.node.id}</strong>
          <small>
            {selectedItem.label} · {nodeLocation(selectedItem.node)}
            {selectedItem.node.scope && ` · ${scopeLabel(selectedItem.node)}`}
            {selectedItem.occurrenceId ? ` · occurrence ${selectedItem.occurrenceId}` : ''}
            {repeatedIds.has(selectedItem.id) && ` · revisit ${occurrenceNumbers[selectedIndex]}`}
            {selectedItem.caption ? ` · ${selectedItem.caption}` : ''}
          </small>
          {(selectedItem.edge?.confidence || selectedItem.edge?.limitations?.length) && (
            <em>
              {selectedItem.edge.confidence
                ? `${selectedItem.edge.confidence} confidence`
                : 'Known limitation'}
            </em>
          )}
        </div>
      )}

      {boundaries.length > 1 && (
        <div className="path-boundary-ribbon" aria-label="Path boundary context">
          <span className="path-boundary-label">BOUNDARY CONTEXT</span>
          <div className="path-boundary-segments">
            {boundaries.map((boundary, index) => (
              <button
                type="button"
                className="path-boundary-segment"
                key={`${boundary.key}-${boundary.start}`}
                onClick={() => {
                  const item = shown[boundary.start]
                  if (item) onSelect(item.id, start + boundary.start)
                }}
                aria-label={`Jump to ${boundary.label}, steps ${start + boundary.start + 1} through ${start + boundary.end + 1}`}
              >
                {index > 0 && <i aria-hidden="true">→</i>}
                <b>{boundary.label}</b>
                <small>{boundary.end - boundary.start + 1} {itemUnit}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="canvas-viewport">
        <svg
          viewBox={viewBox}
          style={{ width: `${zoom * 100}%`, minWidth: `${Math.max(420, 620 * zoom)}px`, height: `${270 * zoom}px` }}
          aria-label={`Interactive ${title.toLowerCase()}`}
          focusable="false"
        >
          <defs>
            {(['exact', 'alias', 'dynamic'] as const).map((kind) => (
              <marker
                key={kind}
                id={`path-arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className={`path-arrow path-arrow-${kind}`} />
              </marker>
            ))}
          </defs>
          {resolved.slice(0, -1).map((point, index) => {
            const next = resolved[index + 1]
            const item = shown[index + 1]
            const edge = item?.edge
            const edgeClass = edge?.dynamic ? 'dynamic' : edge?.alias ? 'alias' : 'exact'
            const relation = item?.relation || edge?.relation
            return (
              <g key={`edge-${index}`}>
                <path
                  className={`path-edge ${edgeClass}`}
                  markerEnd={`url(#path-arrow-${edgeClass})`}
                  d={`M${point.x + 30} ${point.y} C${point.x + 62} ${point.y},${next.x - 62} ${next.y},${next.x - 30} ${next.y}`}
                ><title>{shown[index]?.node.label || shown[index]?.node.id} → {item?.node.label || item?.node.id}: {relation || edgeClass}</title></path>
                {(relation || edgeClass !== 'exact') && (
                  <text
                    className={`edge-caption ${edgeClass}`}
                    x={(point.x + next.x) / 2}
                    y={(point.y + next.y) / 2 - 10}
                    textAnchor="middle"
                  >
                    {shorten(relation || edgeClass)}
                  </text>
                )}
              </g>
            )
          })}
          {shown.map((item, index) => {
            const point = resolved[index]
            const selected = start + index === selectedIndex
            const select = () => onSelect(item.id, start + index)
            const roleClass = `role-${item.label
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')}`
            return (
              <g
                key={`${item.id}-${start + index}`}
                className={`path-node kind-${item.node.kind} scope-${scopeKind(item.node)}${repeatedIds.has(item.id) ? ' revisited' : ''} ${roleClass}${selected ? ' selected' : ''}`}
                onClick={select}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    select()
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${item.label}, step ${start + index + 1} of ${items.length}, ${item.node.label || item.node.id}${item.node.scope ? `, ${scopeLabel(item.node)}` : ''}${repeatedIds.has(item.id) ? `, revisit ${occurrenceNumbers[start + index]}` : ''}${item.node.scope?.kind ? `, ${item.node.scope.kind} boundary` : ''}`}
              >
                <title>{item.node.label || item.node.id}</title>
                <circle className="node-halo" cx={point.x} cy={point.y} r="38" />
                <circle className="node-body" cx={point.x} cy={point.y} r="29" />
                <text className="node-index" x={point.x} y={point.y + 4} textAnchor="middle">
                  {String(start + index + 1).padStart(2, '0')}
                </text>
                <text className="node-role" x={point.x} y={point.y + 50} textAnchor="middle">
                  {shorten(item.label, 16)}
                </text>
                <text className="node-file" x={point.x} y={point.y + 66} textAnchor="middle">
                  {shorten(nodeFile(item.node), 18)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="path-index-list" aria-label={`${title} ${itemUnit}`}>
        {shown.map((item, index) => {
          const occurrenceSelected = start + index === selectedIndex
          return (
            <button
              ref={occurrenceSelected ? selectedRef : undefined}
              type="button"
              key={`${item.id}-${start + index}`}
              className={occurrenceSelected ? 'selected' : ''}
              onClick={() => onSelect(item.id, start + index)}
              aria-pressed={occurrenceSelected}
              aria-current={occurrenceSelected ? 'step' : undefined}
                aria-label={`${item.label}, step ${start + index + 1} of ${items.length}, ${item.node.label || item.node.id}${item.node.scope ? `, ${scopeLabel(item.node)}` : ''}${item.node.scope?.kind ? `, ${item.node.scope.kind} boundary` : ''}`}
            >
              <span>{String(start + index + 1).padStart(2, '0')}</span>
              <b>{item.label}</b>
              <small>
                {item.node.label || item.node.id} · {item.node.scope ? `${scopeLabel(item.node)} · ` : ''}{nodeLocation(item.node)}
                {repeatedIds.has(item.id) ? ` · revisit ${occurrenceNumbers[start + index]}` : ''}
                {item.edge?.alias ? ' · alias' : ''}
                {item.edge?.dynamic ? ' · dynamic' : ''}
              </small>
            </button>
          )
        })}
      </div>

      <div className="graph-legend" aria-label="Graph color legend">
        <span><i className="legend-exact" />exact path</span>
        <span><i className="legend-alias" />alias</span>
        <span><i className="legend-dynamic" />dynamic</span>
        <span><i className="legend-sink" />sink</span>
        {items.some((item) => item.node.scope?.kind === 'external' || item.node.scope?.kind === 'generated') && <span><i className="legend-scope" />external / generated context</span>}
        {repeatedIds.size > 0 && <span><i className="legend-revisited" />revisited symbol</span>}
      </div>
    </div>
  )
}
