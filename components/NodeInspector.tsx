"use client";
import { useState } from "react";
import type { App, Node } from "../lib/lachesis";
import { Icon } from "./Icon";
import { trackEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";

const descriptions: Record<string, string> = {
  sink: "Execution boundary or sensitive effect reached by this path.",
  route: "Request entrypoint represented in the code graph.",
  guard: "Control that checks identity, state, or authorization.",
  call: "A resolved call site connecting this path to another function.",
  service: "Application service participating in this request path.",
  assignment: "A value definition or reassignment in the flow.",
  function: "A callable symbol resolved in the code graph.",
  method: "A method symbol resolved in the code graph.",
  class: "A type or class symbol that organizes related behavior.",
  query: "A query-building or query-execution symbol in the graph.",
  effect: "An external effect or operation represented in the graph.",
};
type Props = {
  node: Node;
  onClose: () => void;
  app?: App;
  onFlow?: (flowId: string, nodeId: string) => void;
  onEntry?: (entryIndex: number, nodeId: string) => void;
};

export function NodeInspector({ node, onClose, app, onFlow, onEntry }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const location = node.file
    ? `${node.file}:${node.line || "—"}${node.column ? `:${node.column}` : ""}`
    : node.id;
  const range =
    node.endLine && node.endLine !== node.line
      ? `lines ${node.line}–${node.endLine}`
      : `line ${node.line || "—"}`;
  const flows =
    app?.flows.filter((flow) =>
      flow.steps.some((step) => step.node_id === node.id),
    ) ?? [];
  const entries =
    app?.entries.filter((entry) =>
      entry.hops.some((hop) => hop.node_id === node.id),
    ) ?? [];
  const relationships =
    app?.edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    ) ?? [];
  const incoming = relationships.filter(
    (edge) => edge.target === node.id,
  ).length;
  const outgoing = relationships.filter(
    (edge) => edge.source === node.id,
  ).length;
  async function copyLocation() {
    try {
      await copyText(location);
      setCopyError(false);
      setCopied(true);
      trackEvent("source_location_copied");
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }
  return (
    <aside className="detail-panel">
      <div className="inspector-heading">
        <span className={`kind-badge kind-${node.kind}`}>
          <i />
          {node.kind}
        </span>
        <span className="node-identity">{node.id}</span>
        <button
          className="inspector-close"
          onClick={onClose}
          aria-label="Close source inspector"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="inspector-source">
        <span className="panel-label">SOURCE LOCATION</span>
        <h3>{node.file || "Unknown file"}</h3>
        <div className="inspector-symbol">
          <b>{node.label || node.id}</b>
          {node.qualifiedName && node.qualifiedName !== node.label && (
            <small>{node.qualifiedName}</small>
          )}
          {node.signature && <code>{node.signature}</code>}
          {node.module && <span>module {node.module}</span>}
        </div>
        <div className="location-row">
          <span className="line-number">
            {range}
            {node.column ? ` · column ${node.column}` : ""}
          </span>
          <button onClick={copyLocation} aria-label="Copy source location">
            <Icon name="code" size={12} />
            {copied ? "Copied" : copyError ? "Retry" : "Copy"}
          </button>
        </div>
        <pre className="source-code">
          <code>
            {node.snippet || node.label || "Source unavailable in this bundle."}
          </code>
        </pre>
      </div>
      <div className="detail-rule" />
      <span className="panel-label">WHAT THIS NODE MEANS</span>
      <p className="detail-copy">
        {descriptions[node.kind] ||
          "A node participating in the selected graph path."}
      </p>
      {node.documentation && (
        <div className="node-documentation">
          <span className="panel-label">DOCUMENTATION</span>
          <p>{node.documentation}</p>
        </div>
      )}
      {app && (
        <>
          <div className="detail-rule" />
          <span className="panel-label">WHY IT IS INCLUDED</span>
          <p className="detail-copy">
            This node is present in {flows.length} graph path
            {flows.length === 1 ? "" : "s"}, {entries.length} request path
            {entries.length === 1 ? "" : "s"}, and {relationships.length}{" "}
            normalized relationship{relationships.length === 1 ? "" : "s"} in
            this bundle.
          </p>
          <div className="inspector-context">
            <span className="panel-label">CONNECTED EVIDENCE</span>
            {flows.length > 0 && (
              <div>
                <small>VALUE FLOWS</small>
                {flows.slice(0, 4).map((flow) =>
                  onFlow ? (
                    <button
                      type="button"
                      key={flow.id}
                      onClick={() =>
                        onFlow(flow.id, flow.steps[0]?.node_id ?? node.id)
                      }
                    >
                      {flow.name}
                    </button>
                  ) : (
                    <span key={flow.id}>{flow.name}</span>
                  ),
                )}
              </div>
            )}
            {entries.length > 0 && (
              <div>
                <small>REQUEST PATHS</small>
                {entries.slice(0, 4).map((entry) =>
                  onEntry ? (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() =>
                        onEntry(
                          app.entries.findIndex((item) => item.id === entry.id),
                          entry.hops[0]?.node_id ?? node.id,
                        )
                      }
                    >
                      {entry.label}
                    </button>
                  ) : (
                    <span key={entry.id}>{entry.label}</span>
                  ),
                )}
              </div>
            )}
            {relationships.length > 0 && (
              <div>
                <small>RELATIONSHIPS</small>
                {relationships.slice(0, 4).map((edge) => {
                  const peerId =
                    edge.source === node.id ? edge.target : edge.source;
                  const peer = app.nodes.find((item) => item.id === peerId);
                    return (
                      <div className="relationship-item" key={edge.id}>
                        <span>
                          {edge.source === node.id ? "→" : "←"}{" "}
                          {edge.relation || "connected"} · {peer?.label || peerId}
                        </span>
                        {(edge.dynamic || edge.alias || edge.confidence) && (
                          <small className="relationship-signals">
                            {edge.dynamic && <em>dynamic</em>}
                            {edge.alias && <em>alias</em>}
                            {edge.confidence && <em>{edge.confidence} confidence</em>}
                          </small>
                        )}
                        {edge.limitations?.length ? (
                          <small className="relationship-caveat">
                            <i />
                            {edge.limitations.join(" · ")}
                          </small>
                        ) : null}
                      </div>
                    );
                })}
              </div>
            )}
            {!flows.length && !entries.length && !relationships.length && (
              <p>No connected evidence records in this bundle.</p>
            )}
          </div>
        </>
      )}
      <dl className="node-facts">
        <div>
          <dt>Kind</dt>
          <dd>{node.kind}</dd>
        </div>
        <div>
          <dt>Graph ID</dt>
          <dd>{node.id}</dd>
        </div>
        {app && (
          <>
            <div>
              <dt>Incoming</dt>
              <dd>{incoming}</dd>
            </div>
            <div>
              <dt>Outgoing</dt>
              <dd>{outgoing}</dd>
            </div>
          </>
        )}
        {app && (
          <>
            <div>
              <dt>Graph paths</dt>
              <dd>{flows.length}</dd>
            </div>
            <div>
              <dt>Request paths</dt>
              <dd>{entries.length}</dd>
            </div>
          </>
        )}
      </dl>
    </aside>
  );
}
