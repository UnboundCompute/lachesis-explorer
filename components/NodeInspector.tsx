"use client";
import { useEffect, useRef, useState } from "react";
import type { App, Node } from "../lib/lachesis";
import { Icon } from "./Icon";
import { trackEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";

const descriptions: Record<string, string> = {
  sink: "Execution boundary or external effect represented in the code graph.",
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
  expression: "An expression or operation participating in the analyzed code path.",
  parameter: "An input parameter carrying a value into a symbol or expression.",
  variable: "A local or scoped variable represented in the graph.",
  literal: "A literal value represented as a graph node.",
};
const scopeIdentity = (node: Node) =>
  node.scope ? [node.scope.repository, node.scope.service, node.scope.package, node.scope.module, node.scope.kind].filter(Boolean).join(" · ") : "";
const scopeDisplay = (node: Node) =>
  node.scope?.label || node.scope?.service || node.scope?.package || node.scope?.module || node.scope?.repository || "Unscoped";
type Props = {
  node: Node;
  contextRole?: string;
  onClose: () => void;
  app?: App;
  onNode?: (nodeId: string) => void;
  onFlow?: (flowId: string, nodeId: string) => void;
  onEntry?: (entryIndex: number, nodeId: string) => void;
};

export function NodeInspector({ node, contextRole, onClose, app, onNode, onFlow, onEntry }: Props) {
  const inspectorRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyError, setSnippetCopyError] = useState(false);
  const [showAllConnections, setShowAllConnections] = useState(false);
  const location = node.file
    ? `${node.file}:${node.line || "—"}${node.column ? `:${node.column}` : ""}`
    : node.id;
  const hasSourceLocation = Boolean(node.file);
  const range =
    node.endLine && node.endLine !== node.line
      ? `lines ${node.line}–${node.endLine}`
      : `line ${node.line || "—"}`;
  const snippet = node.snippet || node.label || "";
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
  const securityContext = Boolean(
    app?.findings.some((flow) =>
      flow.steps.some((step) => step.node_id === node.id),
    ),
  );
  const incoming = relationships.filter(
    (edge) => edge.target === node.id,
  ).length;
  const outgoing = relationships.filter(
    (edge) => edge.source === node.id,
  ).length;
  useEffect(() => {
    inspectorRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [node.id]);
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
  async function copySnippet() {
    if (!snippet) return;
    try {
      await copyText(snippet);
      setSnippetCopyError(false);
      setSnippetCopied(true);
      trackEvent("source_snippet_copied");
      window.setTimeout(() => setSnippetCopied(false), 1200);
    } catch {
      setSnippetCopied(false);
      setSnippetCopyError(true);
    }
  }
  function closeInspector() {
    onClose();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".inspector-reopen")?.focus();
    });
  }
  return (
    <aside ref={inspectorRef} className="detail-panel" aria-label={`Source inspector for ${node.label || node.id}`}>
      <p className="sr-only" aria-live="polite">
        Selected {node.kind} {node.label || node.id}, source {location}.
      </p>
      <div className="inspector-heading">
        <span className={`kind-badge kind-${node.kind}`}>
          <i />
          {node.kind}
        </span>
        {contextRole && <span className={`path-role role-${contextRole.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{contextRole}</span>}
        <span className="node-identity" title={`Graph ID: ${node.id}`}>
          ID · {node.id.length > 10 ? `…${node.id.slice(-8)}` : node.id}
        </span>
        <button
          type="button"
          className="inspector-close"
          onClick={closeInspector}
          aria-label="Close source inspector"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="inspector-source">
        <span className="panel-label">
          {hasSourceLocation ? "SOURCE LOCATION" : "SOURCE LOCATION UNAVAILABLE"}
        </span>
        <h3>{node.file || "This bundle has no file mapping"}</h3>
        <div className="inspector-symbol">
          <b>{node.label || node.id}</b>
          {node.qualifiedName && node.qualifiedName !== node.label && (
            <small>{node.qualifiedName}</small>
          )}
          {node.signature && <code>{node.signature}</code>}
          {node.module && <span>module {node.module}</span>}
          {node.scope && (node.scope.label || node.scope.service || node.scope.package || node.scope.module || node.scope.repository) && (
            <span className="node-scope-context">
              scope {node.scope.label || node.scope.service || node.scope.package || node.scope.module || node.scope.repository}
            </span>
          )}
          {node.scope?.kind && (
            <span className={`node-scope-kind scope-kind-${node.scope.kind.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              {node.scope.kind} boundary
            </span>
          )}
        </div>
        <div className="location-row">
          <span className="line-number">{hasSourceLocation ? <>{range}{node.column ? ` · column ${node.column}` : ""}</> : <>Graph ID · {node.id}</>}</span>
          <button type="button" onClick={copyLocation} aria-label={hasSourceLocation ? "Copy source location" : "Copy graph ID"}>
            <Icon name="code" size={12} />
            {copied ? "Copied" : copyError ? "Retry" : hasSourceLocation ? "Copy" : "Copy ID"}
          </button>
        </div>
        <pre className="source-code">
          <code>{snippet || "Source unavailable in this bundle."}</code>
        </pre>
        <button className="source-copy" type="button" onClick={copySnippet} disabled={!snippet}>
          <Icon name="code" size={12} />
          {snippetCopied ? "Snippet copied" : snippetCopyError ? "Retry copy" : "Copy snippet"}
        </button>
      </div>
      <div className="detail-rule" />
      <span className="panel-label">WHAT THIS NODE MEANS</span>
      <p className="detail-copy">
        {descriptions[node.kind] ||
          (contextRole
            ? "A node participating in the selected graph path."
            : "A node participating in the loaded code graph.")}
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
            <span className="panel-label">{securityContext ? "CONNECTED EVIDENCE" : "CONNECTED CONTEXT"}</span>
            {flows.length > 0 && (
              <div>
                <small>GRAPH PATHS</small>
                {(showAllConnections ? flows : flows.slice(0, 4)).map((flow) =>
                  onFlow ? (
                    <button
                      type="button"
                      className="connected-link"
                      key={flow.id}
                      onClick={() =>
                        onFlow(flow.id, node.id)
                      }
                    >
                      <span>{flow.name}</span>
                      <Icon name="arrow" size={11} />
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
                {(showAllConnections ? entries : entries.slice(0, 4)).map((entry) =>
                  onEntry ? (
                    <button
                      type="button"
                      className="connected-link"
                      key={entry.id}
                      onClick={() =>
                        onEntry(
                          app.entries.findIndex((item) => item.id === entry.id),
                          node.id,
                        )
                      }
                    >
                      <span>{entry.label}</span>
                      <Icon name="arrow" size={11} />
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
                {(showAllConnections ? relationships : relationships.slice(0, 4)).map((edge) => {
                  const peerId =
                    edge.source === node.id ? edge.target : edge.source;
                  const peer = app.nodes.find((item) => item.id === peerId);
                  const peerFlow = app.flows.find((flow) => flow.steps.some((step) => step.node_id === peerId));
                  const crossesBoundary = Boolean(peer && scopeIdentity(node) && scopeIdentity(peer) && scopeIdentity(node) !== scopeIdentity(peer));
                    return (
                      <div className="relationship-item" key={edge.id}>
                        <span>
                          {edge.source === node.id ? "→ leads to" : "← receives from"}{" "}
                          {(onNode || peerFlow && onFlow) ? <button type="button" className="relationship-peer" onClick={() => onNode ? onNode(peerId) : onFlow?.(peerFlow!.id, peerId)}>{peer?.label || peerId}</button> : (peer?.label || peerId)} · {edge.relation || "connected"}
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
                        {crossesBoundary && peer && (
                          <small className="relationship-boundary">
                            <i />
                            {scopeDisplay(node)} → {scopeDisplay(peer)}
                          </small>
                        )}
                      </div>
                    );
                })}
              </div>
            )}
            {(flows.length > 4 || entries.length > 4 || relationships.length > 4) && (
              <button
                type="button"
                className="connections-toggle"
                onClick={() => setShowAllConnections((open) => !open)}
              >
                {showAllConnections
                  ? "Show fewer connections"
                  : `Show all connections · ${flows.length + entries.length + relationships.length}`}
              </button>
            )}
            {!flows.length && !entries.length && !relationships.length && (
              <p>{securityContext ? "No connected evidence records in this bundle." : "No connected paths or relationships in this bundle."}</p>
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
