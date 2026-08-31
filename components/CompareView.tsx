'use client'

import type { App, Flow } from '../lib/lachesis'

type Props = { base: App; compare: App | null; onUpload: () => void; onOpenFlow?: (flowId: string, nodeId: string) => void }

const ids = (values: { id: string }[]) => new Set(values.map((value) => value.id))

function delta(base: { id: string }[], next: { id: string }[]) {
  const baseIds = ids(base)
  const nextIds = ids(next)
  return {
    added: next.filter((item) => !baseIds.has(item.id)),
    removed: base.filter((item) => !nextIds.has(item.id)),
  }
}

function flowPath(flow: Flow, app: App) {
  return flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id)?.label || step.node_id)
    .join(' → ')
}

function flowKind(flow: Flow) {
  const kind = flow.kind?.trim().toLowerCase()
  if (kind === 'call-path' || kind === 'callpath') return 'Call paths'
  if (kind === 'data-flow' || kind === 'dataflow') return 'Data flows'
  if (kind === 'value-flow' || kind === 'valueflow') return 'Value paths'
  return flow.kind?.trim() || 'Graph paths'
}

function itemLabel(item: { id: string }, app: App) {
  const node = app.nodes.find((value) => value.id === item.id)
  if (node) return node.label || node.id
  const flow = app.flows.find((value) => value.id === item.id)
  if (flow) return flow.name
  const entry = app.entries.find((value) => value.id === item.id)
  if (entry) return entry.label
  const edge = app.edges.find((value) => value.id === item.id)
  if (edge) {
    const source = app.nodes.find((value) => value.id === edge.source)?.label || edge.source
    const target = app.nodes.find((value) => value.id === edge.target)?.label || edge.target
    return `${source} → ${target}`
  }
  return item.id
}

function DiffColumn({
  label,
  items,
  app,
  empty,
  className,
  actionable = false,
  previewFlows = false,
  onOpenFlow,
}: {
  label: string
  items: { id: string }[]
  app: App
  empty: string
  className: string
  actionable?: boolean
  previewFlows?: boolean
  onOpenFlow?: (flowId: string, nodeId: string) => void
}) {
  return (
    <div>
      <span className={className}>{label} · {items.length}</span>
      {items.length ? (
        items.slice(0, 8).map((item) => {
          const flow = actionable ? app.flows.find((value) => value.id === item.id) : undefined
          const preview = previewFlows ? app.flows.find((value) => value.id === item.id) : undefined
          const firstNodeId = flow?.steps[0]?.node_id
          return preview ? (
            <details className="diff-flow-preview" key={item.id}>
              <summary title={item.id}><span>{itemLabel(item, app)}</span><small>Preview</small></summary>
              <p>{flowPath(preview, app) || "No step sequence available."}</p>
            </details>
          ) : flow && onOpenFlow && firstNodeId ? (
            <button
              type="button"
              className="diff-item-action"
              key={item.id}
              title={`Open ${itemLabel(item, app)} in Graph Path`}
              onClick={() => onOpenFlow(flow.id, firstNodeId)}
            >
              <span>{itemLabel(item, app)}</span><small>Open ↗</small>
            </button>
          ) : <p key={item.id} title={item.id}>{itemLabel(item, app)}</p>
        })
      ) : (
        <p className="diff-empty">{empty}</p>
      )}
      {items.length > 8 && <p className="diff-more">+ {items.length - 8} more</p>}
    </div>
  )
}

export function CompareView({ base, compare, onUpload, onOpenFlow }: Props) {
  const securityMode =
    base.findings.length > 0 ||
    base.bundle.projection === 'security projection' ||
    Boolean(compare?.findings.length || compare?.bundle.projection === 'security projection')

  if (!compare) {
    return (
      <section className="compare-empty">
        <span className="context-kicker">REVISION DIFF</span>
        <h2>Compare two {securityMode ? 'evidence' : 'graph'} bundles.</h2>
        <p>
          Load a second bundle to see added, removed, and changed{' '}
          {securityMode ? 'evidence' : 'graph structure'} without replacing the active investigation.
        </p>
        <button type="button" className="context-upload" onClick={onUpload}>
          <span>Load comparison bundle</span>
          <span>＋</span>
        </button>
        <div className="compare-steps">
          <div><b>01</b><span><strong>Added</strong><small>New nodes, relationships, paths, and request paths.</small></span></div>
          <div><b>02</b><span><strong>Removed</strong><small>Items absent from the comparison bundle.</small></span></div>
          <div><b>03</b><span><strong>Changed</strong><small>Same path IDs with a different kind or step sequence.</small></span></div>
        </div>
      </section>
    )
  }

  const nodes = delta(base.nodes, compare.nodes)
  const edges = delta(base.edges, compare.edges)
  const paths = delta(base.flows, compare.flows)
  const entries = delta(base.entries, compare.entries)
  const changedPaths = base.flows
    .map((flow) => ({ base: flow, compare: compare.flows.find((item) => item.id === flow.id) }))
    .filter(
      (item) =>
        item.compare &&
        (item.compare.kind !== item.base.kind ||
          JSON.stringify(item.compare.steps) !== JSON.stringify(item.base.steps)),
    ) as { base: Flow; compare: Flow }[]
  const kinds = [...new Set([...base.flows, ...compare.flows].map(flowKind))]
  const pathGroup = kinds.length === 1 ? kinds[0] : 'Graph paths'
  const groups = [
    ['Nodes', nodes],
    ['Relationships', edges],
    [pathGroup, paths],
    ['Request paths', entries],
  ] as const

  return (
    <section className="compare-workspace">
      <header className="compare-heading">
        <div>
          <span className="context-kicker">REVISION DIFF</span>
          <h2>{base.commit || 'base'} <span>→</span> {compare.commit || 'comparison'}</h2>
          <p>Deterministic ID and step comparisons. A missing item means it is absent from that bundle, not necessarily deleted from source. Removed paths open in the active bundle; added paths stay comparison-only here.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onUpload}>Load another</button>
      </header>
      <div className="compare-summary">
        <div><span>BASE</span><b>{base.name}</b><small>{base.nodes.length} nodes · {base.flows.length} paths</small></div>
        <div><span>COMPARISON</span><b>{compare.name}</b><small>{compare.nodes.length} nodes · {compare.flows.length} paths</small></div>
        <div><span>CHANGED PATHS</span><b>{changedPaths.length}</b><small>same path ID, changed kind or sequence</small></div>
      </div>
      <div className="compare-grid">
        {groups.map(([label, result]) => (
          <section key={label}>
            <h3>{label}</h3>
            <div className="diff-columns">
              <DiffColumn label="ADDED" items={result.added} app={compare} empty="No additions" className="diff-added" previewFlows={label === pathGroup} />
              <DiffColumn label="REMOVED" items={result.removed} app={base} empty="No removals" className="diff-removed" actionable={label === pathGroup} onOpenFlow={onOpenFlow} />
            </div>
          </section>
        ))}
      </div>
      <section className="compare-changed">
        <div className="compare-changed-heading">
          <div>
            <h3>Changed {pathGroup.toLowerCase()}</h3>
            <p>Same path ID, different kind or step sequence.</p>
          </div>
          <span>{changedPaths.length}</span>
        </div>
        {changedPaths.length ? (
          changedPaths.slice(0, 8).map((item) => (
            <button type="button" className="changed-flow" key={item.base.id} onClick={() => onOpenFlow?.(item.base.id, item.base.steps[0]?.node_id ?? "")} disabled={!onOpenFlow || !item.base.steps[0]?.node_id}>
              <b>{item.base.name}</b>
              <div>
                <span><small>BASE</small>{flowPath(item.base, base)}</span>
                <i>→</i>
                <span><small>COMPARISON</small>{flowPath(item.compare, compare)}</span>
              </div>
              {onOpenFlow && <small className="changed-flow-action">Open base path in Graph Path ↗</small>}
            </button>
          ))
        ) : (
          <p className="diff-empty">No existing paths changed between these bundles.</p>
        )}
      </section>
    </section>
  )
}
