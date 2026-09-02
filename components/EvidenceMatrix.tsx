import { flowDisplayName, type App, type Flow } from '../lib/lachesis'

type Props = {
  app: App
  flows: Flow[]
  sinkId: string
  onOpenFlow: (flowId: string, nodeId: string, position?: number) => void
  securityMode?: boolean
}

const location = (node: App['nodes'][number] | undefined) =>
  node ? `${node.file || 'Source unavailable'}:${node.line || '—'}` : 'Source location unavailable'

function flowScopes(app: App, flow: Flow) {
  const scopes: string[] = []
  flow.steps.forEach((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id)
    const scope = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository
    if (scope && scopes.at(-1) !== scope) scopes.push(scope)
  })
  return scopes
}

export function EvidenceMatrix({ app, flows, sinkId, onOpenFlow, securityMode = true }: Props) {
  return (
    <div className="matrix-wrap">
      <table className="evidence-matrix">
        <caption>{securityMode ? 'Value flows reaching the selected sink' : 'Value paths converging at the selected boundary'}</caption>
        <thead>
          <tr>
            <th>Value</th>
            <th>Origin</th>
            <th>Context</th>
            <th>Path / source</th>
            <th>Alias</th>
            <th>Dynamic</th>
            <th>{securityMode ? 'Evidence' : 'Linked record'}</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((flow, index) => {
            const sinkIndex = flow.steps.reduce(
              (last, step, stepIndex) => step.node_id === sinkId ? stepIndex : last,
              -1,
            )
            const steps = sinkIndex < 0 ? flow.steps : flow.steps.slice(0, sinkIndex + 1)
            const origin = app.nodes.find(
              (node) => node.id === (flow.sourceNodeId ?? steps[0]?.node_id),
            )
            const evidence = app.mcp.find((item) => item.for === flow.id)
            const scopes = flowScopes(app, flow)
            const aliases = steps.filter((step) => step.edge?.alias).length
            const dynamic = steps.filter((step) => step.edge?.dynamic).length
            const sourcePreviews = steps.filter((step) => {
              const node = app.nodes.find((item) => item.id === step.node_id)
              return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length)
            }).length
            return (
              <tr key={flow.id}>
                <th>
                  <button
                    type="button"
                    onClick={() => onOpenFlow(flow.id, sinkId, sinkIndex < 0 ? undefined : sinkIndex)}
                  >
                    <span>{String(index + 1).padStart(2, '0')} · </span>
                    {flowDisplayName(flow, app.nodes, app.flows)}
                  </button>
                </th>
                <td>
                  <span>{origin?.label || steps[0]?.node_id || 'Origin unavailable'}</span>
                  <small>{location(origin)}</small>
                </td>
                <td>
                  <span>{scopes.length ? scopes.join(' → ') : 'No boundary metadata'}</span>
                </td>
                <td>
                  <span>{steps.length} {securityMode ? 'nodes' : 'symbols'}</span>
                  <small>{sourcePreviews}/{steps.length} source previews</small>
                </td>
                <td><span className={aliases ? 'matrix-signal alias' : 'matrix-signal quiet'}>{aliases || '—'}</span></td>
                <td><span className={dynamic ? 'matrix-signal dynamic' : 'matrix-signal quiet'}>{dynamic || '—'}</span></td>
                <td><span className={`matrix-signal ${evidence ? 'exact' : 'derived'}`}>{evidence ? (securityMode ? 'exact' : 'linked') : 'derived'}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
