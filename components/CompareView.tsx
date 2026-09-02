'use client'

import { useEffect, useState } from 'react'
import type { App, Flow } from '../lib/lachesis'
import { copyText } from '../lib/clipboard'
import { trackEvent } from '../lib/analytics'

type Props = { base: App; compare: App | null; onUpload: () => void; loading?: boolean; onOpenFlow?: (flowId: string, nodeId: string) => void; onOpenNode?: (nodeId: string) => void }

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

function flowSequence(flow: Flow, app: App) {
  return flow.steps
    .map((step, index) => {
      const node = app.nodes.find((item) => item.id === step.node_id)
      const location = node ? `${node.file || 'Source unavailable'}:${node.line || '—'}` : 'Source location unavailable'
      const scope = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository
      return `${String(index + 1).padStart(2, '0')}. ${step.role} — ${node?.label || step.node_id} · ${location}${scope ? ` · ${scope}` : ''}${step.edge?.relation ? ` · via ${step.edge.relation}` : ''}${step.note ? ` · ${step.note}` : ''}`
    })
    .join('\n')
}

function flowScopes(flow: Flow, app: App) {
  const scopes: string[] = []
  flow.steps.forEach((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id)
    const scope = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository
    if (scope && scopes.at(-1) !== scope) scopes.push(scope)
  })
  return scopes
}

function sourceCoverage(flow: Flow, app: App) {
  const available = flow.steps.filter((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
  }).length;
  return `${available}/${flow.steps.length} source previews`;
}

function changeReasons(base: Flow, compare: Flow) {
  const reasons: string[] = [];
  if (base.kind !== compare.kind) reasons.push("kind changed");
  if (JSON.stringify(base.steps) !== JSON.stringify(compare.steps)) reasons.push("path changed");
  return reasons;
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

function diffSearchText(item: { id: string }, app: App) {
  const node = app.nodes.find((value) => value.id === item.id)
  const flow = app.flows.find((value) => value.id === item.id)
  const edge = app.edges.find((value) => value.id === item.id)
  return [
    itemLabel(item, app),
    node?.qualifiedName, node?.signature, node?.documentation, node?.snippet, node?.sourceWindow?.lines.join(" "),
    node?.file, node?.module, node?.scope?.label, node?.scope?.service,
    flow?.description, flow ? flowPath(flow, app) : undefined,
    flow?.steps.flatMap((step) => [step.role, step.note, step.edge?.relation]).join(" "),
    edge?.relation,
  ].filter(Boolean).join(" ").toLowerCase()
}

function matchesQuery(text: string, query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => text.includes(term))
}

function matchingFlowNodeId(flow: Flow, app: App, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term && !term.includes(":"));
  if (!terms.length) return flow.steps[0]?.node_id ?? "";
  const match = flow.steps.find((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const haystack = [
      step.role,
      step.note,
      step.edge?.relation,
      node?.label,
      node?.qualifiedName,
      node?.signature,
      node?.documentation,
      node?.snippet,
      node?.sourceWindow?.lines.join(" "),
      node?.file,
      node?.module,
      node?.scope?.label,
      node?.scope?.service,
      node?.scope?.package,
      node?.scope?.module,
      node?.scope?.repository,
    ].filter(Boolean).join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return match?.node_id ?? flow.steps[0]?.node_id ?? "";
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
  openNodes = false,
  onOpenNode,
  comparisonOnly = false,
  query = "",
}: {
  label: string
  items: { id: string }[]
  app: App
  empty: string
  className: string
  actionable?: boolean
  previewFlows?: boolean
  onOpenFlow?: (flowId: string, nodeId: string) => void
  openNodes?: boolean
  onOpenNode?: (nodeId: string) => void
  comparisonOnly?: boolean
  query?: string
}) {
  const [copyState, setCopyState] = useState<{ id: string; status: 'copied' | 'failed' } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const filteredItems = query.trim()
    ? items.filter((item) => matchesQuery(diffSearchText(item, app), query))
    : items
  const itemIdentity = `${items.map(item => item.id).join('|')}|${query}`
  useEffect(() => { setCopyState(null); setExpanded(false) }, [app, itemIdentity])
  async function copyPreview(flow: Flow) {
    try {
      await copyText(`${flow.name}\n${flowSequence(flow, app)}`)
      setCopyState({ id: flow.id, status: 'copied' })
      trackEvent('revision_path_copied')
    } catch {
      setCopyState({ id: flow.id, status: 'failed' })
      trackEvent('revision_path_copy_failed')
    }
    window.setTimeout(() => setCopyState((current) => current?.id === flow.id ? null : current), 1600)
  }
  return (
    <div>
      <span className={className}>{label} · {query.trim() ? `${filteredItems.length} / ${items.length}` : items.length}</span>
      {filteredItems.length ? (
        (expanded ? filteredItems : filteredItems.slice(0, 8)).map((item) => {
          const flow = actionable ? app.flows.find((value) => value.id === item.id) : undefined
          const preview = previewFlows ? app.flows.find((value) => value.id === item.id) : undefined
          const previewScopes = preview ? flowScopes(preview, app) : []
          const firstNodeId = flow ? matchingFlowNodeId(flow, app, query) : undefined
          const node = openNodes ? app.nodes.find((value) => value.id === item.id) : undefined
          return preview ? (
            <details className="diff-flow-preview" key={item.id}>
              <summary title={item.id}><span>{itemLabel(item, app)}</span><small>Preview · {preview.steps.length} steps · {sourceCoverage(preview, app)}</small></summary>
              <p>{flowPath(preview, app) || "No step sequence available."}</p>
              {previewScopes.length > 1 && <small className="diff-flow-context">Context: {previewScopes.join(' → ')}</small>}
              <button type="button" className="diff-copy-action" onClick={() => copyPreview(preview)}>{copyState?.id === preview.id && copyState.status === 'copied' ? 'Copied' : copyState?.id === preview.id && copyState.status === 'failed' ? 'Copy failed' : 'Copy sequence'}</button>
            </details>
          ) : flow && onOpenFlow && firstNodeId ? (
            <button
              type="button"
              className="diff-item-action"
              key={item.id}
              title={`Open ${itemLabel(item, app)} in Trace`}
              onClick={() => onOpenFlow(flow.id, firstNodeId)}
            >
              <span>{itemLabel(item, app)}</span><small>Open ↗</small>
            </button>
          ) : node && onOpenNode ? (
            <button
              type="button"
              className="diff-item-action"
              key={item.id}
              title={`Open ${itemLabel(item, app)} in Graph`}
              onClick={() => onOpenNode(node.id)}
            >
              <span>{itemLabel(item, app)}</span><small>Open ↗</small>
            </button>
          ) : <p key={item.id} title={item.id}><span>{itemLabel(item, app)}</span>{comparisonOnly && <small>Comparison only</small>}</p>
        })
      ) : (
        <p className="diff-empty">{items.length && query.trim() ? `No ${label.toLowerCase()} items match this search.` : empty}</p>
      )}
      {filteredItems.length > 8 && (
        <button type="button" className="diff-expand" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? 'Show fewer' : `Show all ${filteredItems.length}`}
        </button>
      )}
    </div>
  )
}

export function CompareView({ base, compare, onUpload, loading = false, onOpenFlow, onOpenNode }: Props) {
  const [showAllChanged, setShowAllChanged] = useState(false)
  const [comparisonQuery, setComparisonQuery] = useState("")
  useEffect(() => { setShowAllChanged(false); setComparisonQuery("") }, [base, compare])
  const securityMode =
    base.findings.length > 0 ||
    base.bundle.projection === 'security projection' ||
    Boolean(compare?.findings.length || compare?.bundle.projection === 'security projection')

  if (!compare) {
    return (
      <section className="compare-empty">
        <span className="context-kicker">REVISION DIFF</span>
        <h2>Compare two code graph bundles.</h2>
        <p>
          Load a second bundle to see added, removed, and changed{' '}
          graph structure{securityMode ? ' and any reported security context' : ''} without replacing the active investigation.
        </p>
        <button type="button" className="context-upload" onClick={onUpload} disabled={loading} aria-busy={loading}>
          <span>Load comparison bundle</span>
          <span>＋</span>
        </button>
        <div className="compare-steps">
          <div><b>01</b><span><strong>Added</strong><small>New nodes, relationships, paths, and request flows.</small></span></div>
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
  const compareFlowsById = new Map(compare.flows.map((flow) => [flow.id, flow]))
  const changedPaths = base.flows
    .map((flow) => ({ base: flow, compare: compareFlowsById.get(flow.id) }))
    .filter(
      (item) =>
        item.compare &&
        (item.compare.kind !== item.base.kind ||
          JSON.stringify(item.compare.steps) !== JSON.stringify(item.base.steps)),
    ) as { base: Flow; compare: Flow }[]
  const visibleChangedPaths = comparisonQuery.trim()
    ? changedPaths.filter((item) =>
        matchesQuery(`${diffSearchText(item.base, base)} ${diffSearchText(item.compare, compare)}`, comparisonQuery),
      )
    : changedPaths
  const kinds = [...new Set([...base.flows, ...compare.flows].map(flowKind))]
  const pathGroup = kinds.length === 1 ? kinds[0] : 'Graph paths'
  const groups = [
    ['Nodes', nodes],
    ['Relationships', edges],
    [pathGroup, paths],
    ['Request flows', entries],
  ] as const

  return (
    <section className="compare-workspace">
      <header className="compare-heading">
        <div>
          <span className="context-kicker">REVISION DIFF</span>
          <h2>{base.commit || 'base'} <span>→</span> {compare.commit || 'comparison'}</h2>
          <p>Deterministic ID and step comparisons. A missing item means it is absent from that bundle, not necessarily deleted from source. Removed paths open in the active bundle; added paths stay comparison-only here.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onUpload} disabled={loading} aria-busy={loading}>{loading ? "Reading…" : "Load another"}</button>
      </header>
      <div className="compare-summary">
        <div><span>BASE</span><b>{base.name}</b><small>{base.nodes.length} nodes · {base.flows.length} paths</small></div>
        <div><span>COMPARISON</span><b>{compare.name}</b><small>{compare.nodes.length} nodes · {compare.flows.length} paths</small></div>
        <div><span>CHANGED PATHS</span><b>{changedPaths.length}</b><small>same path ID, changed kind or sequence</small></div>
      </div>
      <label className="compare-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={comparisonQuery}
          onChange={(event) => setComparisonQuery(event.target.value)}
          placeholder="Find changed symbols, files, paths, or code…"
          aria-label="Filter comparison changes by symbol, file, path, or source code"
        />
        {comparisonQuery && <button type="button" onClick={() => setComparisonQuery("")} aria-label="Clear comparison filter">×</button>}
      </label>
      {comparisonQuery && <p className="compare-search-status" role="status">{visibleChangedPaths.length} changed paths match · added, removed, and changed lists are filtered too</p>}
      <div className="compare-grid">
        {groups.map(([label, result]) => (
          <section key={label}>
            <h3>{label}</h3>
            <div className="diff-columns">
              <DiffColumn label="ADDED" items={result.added} app={compare} empty="No additions" className="diff-added" previewFlows={label === pathGroup} comparisonOnly={label !== pathGroup} query={comparisonQuery} />
              <DiffColumn label="REMOVED" items={result.removed} app={base} empty="No removals" className="diff-removed" actionable={label === pathGroup} onOpenFlow={onOpenFlow} openNodes={label === "Nodes"} onOpenNode={onOpenNode} query={comparisonQuery} />
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
        {visibleChangedPaths.length ? (
          (showAllChanged ? visibleChangedPaths : visibleChangedPaths.slice(0, 8)).map((item) => (
            <button type="button" className="changed-flow" key={item.base.id} onClick={() => onOpenFlow?.(item.base.id, matchingFlowNodeId(item.base, base, comparisonQuery))} disabled={!onOpenFlow || !item.base.steps[0]?.node_id}>
              <b>{item.base.name}</b>
              <small className="changed-flow-reasons">{changeReasons(item.base, item.compare).join(" · ")}</small>
              <div>
                <span><small>BASE</small>{flowPath(item.base, base)}</span>
                <i>→</i>
                <span><small>COMPARISON</small>{flowPath(item.compare, compare)}</span>
              </div>
              {onOpenFlow && <small className="changed-flow-action">Open base path in Trace ↗ · {sourceCoverage(item.base, base)} · comparison {sourceCoverage(item.compare, compare)}</small>}
            </button>
          ))
        ) : (
          <p className="diff-empty">{comparisonQuery ? "No changed paths match this search." : "No existing paths changed between these bundles."}</p>
        )}
        {visibleChangedPaths.length > 8 && (
          <button type="button" className="diff-expand changed-expand" onClick={() => setShowAllChanged((value) => !value)} aria-expanded={showAllChanged}>
            {showAllChanged ? "Show fewer" : `Show all ${visibleChangedPaths.length}`}
          </button>
        )}
      </section>
    </section>
  )
}
