"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { App, Node } from "../lib/lachesis";
import { Icon } from "./Icon";
import { trackEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";

const descriptions: Record<string, string> = {
  sink: "Execution boundary or external effect represented in the code graph.",
  route: "Starting point represented in the code graph.",
  guard: "Control that checks identity, state, or authorization.",
  call: "A resolved call site connecting this path to another function.",
  service: "Application service participating in this request flow.",
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
function sourceUrlFor(app: App | undefined, node: Node) {
  if (!app?.bundle.sourceUrlTemplate || !node.file) return undefined;
  const template = app.bundle.sourceUrlTemplate;
  if (!template.includes("{file}")) return undefined;
  const encodedFile = node.file
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = template
    .replaceAll("{file}", encodedFile)
    .replaceAll("{line}", String(node.line || 1))
    .replaceAll("{end_line}", String(node.endLine || node.line || 1))
    .replaceAll("{revision}", encodeURIComponent(app.commit));
  if (/\{(?:file|line|end_line|revision)\}/.test(url)) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
const originLabel = (origin: string) =>
  origin === "bundle"
    ? "recorded connection"
    : origin === "value-flow"
      ? "graph path"
      : origin === "request-path"
        ? "request flow"
        : origin;
function contextRoute(app: App, nodeIds: string[]) {
  const route: string[] = [];
  nodeIds.forEach((nodeId) => {
    const node = app.nodes.find((item) => item.id === nodeId);
    const context = node ? scopeDisplay(node) : "Unscoped";
    if (context !== "Unscoped" && route.at(-1) !== context) route.push(context);
  });
  return route.join(" → ");
}
type Props = {
  node: Node;
  contextRole?: string;
  contextNote?: string;
  contextOccurrence?: string;
  onClose: () => void;
  app?: App;
  onNode?: (nodeId: string) => void;
  onFile?: (file: string) => void;
  onFlow?: (flowId: string, nodeId: string) => void;
  onEntry?: (entryIndex: number, nodeId: string) => void;
};

export function NodeInspector({ node, contextRole, contextNote, contextOccurrence, onClose, app, onNode, onFile, onFlow, onEntry }: Props) {
  const inspectorRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyError, setSnippetCopyError] = useState(false);
  const [contextCopied, setContextCopied] = useState(false);
  const [contextCopyError, setContextCopyError] = useState(false);
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(true);
  const location = node.file
    ? `${node.file}:${node.line || "—"}${node.column ? `:${node.column}` : ""}`
    : node.id;
  const hasSourceLocation = Boolean(node.file);
  const range =
    node.endLine && node.endLine !== node.line
      ? `lines ${node.line}–${node.endLine}`
      : `line ${node.line || "—"}`;
  const sourceSnippet = node.snippet || "";
  const sourceText = node.sourceWindow?.lines.join("\n") || sourceSnippet;
  const sourceUrl = sourceUrlFor(app, node);
  const sourceLines = node.sourceWindow?.lines?.length
    ? node.sourceWindow.lines
    : sourceSnippet
      ? sourceSnippet.split(/\r?\n/)
      : ["Source unavailable in this bundle."];
  const sourceStartLine = node.sourceWindow?.startLine || node.line || 1;
  const inferredHighlightStart = node.sourceWindow ? Math.max(1, node.line - sourceStartLine + 1) : (sourceSnippet ? 1 : 0);
  const inferredHighlightEnd = node.sourceWindow && node.endLine ? Math.max(inferredHighlightStart, node.endLine - sourceStartLine + 1) : inferredHighlightStart;
  const highlightedStart = node.sourceWindow?.highlightStart || inferredHighlightStart;
  const highlightedEnd = node.sourceWindow?.highlightEnd || inferredHighlightEnd;
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
  const parentNode = app?.nodes.find((item) => item.id === node.parentId);
  const childNodes = app
    ? app.nodes
        .filter((item) => item.parentId === node.id)
        .sort((a, b) => a.line - b.line || a.label.localeCompare(b.label))
        .slice(0, 6)
    : [];
  const nearbyNodes = useMemo(() => {
    if (!app || !onNode || !node.file) return [];
    const fileNodes = app.nodes
      .filter((item) => item.file === node.file)
      .sort((a, b) => a.line - b.line || a.label.localeCompare(b.label));
    const selectedIndex = fileNodes.findIndex((item) => item.id === node.id);
    if (selectedIndex < 0) return [];
    return fileNodes
      .slice(Math.max(0, selectedIndex - 2), selectedIndex + 3)
      .filter((item) => item.id !== node.id);
  }, [app, node.file, node.id, onNode]);
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
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== document.body &&
      !inspectorRef.current?.contains(activeElement)
    ) {
      inspectorRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    setCopied(false);
    setCopyError(false);
    setSnippetCopied(false);
    setSnippetCopyError(false);
    setContextCopied(false);
    setContextCopyError(false);
    setShowAllConnections(false);
    setConnectionsOpen(true);
  }, [node.id, contextRole, contextOccurrence]);
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
    if (!sourceText) return;
    try {
      await copyText(sourceText);
      setSnippetCopyError(false);
      setSnippetCopied(true);
      trackEvent("source_snippet_copied");
      window.setTimeout(() => setSnippetCopied(false), 1200);
    } catch {
      setSnippetCopied(false);
      setSnippetCopyError(true);
    }
  }
  async function copyContext() {
    const meaning = descriptions[node.kind] ||
      (contextRole
        ? "A node participating in the selected graph path."
        : "A node participating in the loaded code graph.");
    const connections = relationships.map((edge) => {
      const peerId = edge.source === node.id ? edge.target : edge.source;
      const peer = app?.nodes.find((item) => item.id === peerId);
      const direction = edge.source === node.id ? "leads to" : "receives from";
      return `- ${direction} ${peer?.label || peerId} (${edge.relation || "connected"})`;
    });
    const body = [
      `# ${node.label || node.id}`,
      "",
      `- Type: ${node.kind}`,
      `- Location: ${location}`,
      contextRole ? `- Role in selected path: ${contextRole}` : "",
      contextOccurrence ? `- Occurrence: ${contextOccurrence}` : "",
      node.qualifiedName && node.qualifiedName !== node.label ? `- Qualified name: ${node.qualifiedName}` : "",
      parentNode ? `- Enclosed by: ${parentNode.label || parentNode.id}` : "",
      node.signature ? `- Signature: ${node.signature}` : "",
      node.module ? `- Module: ${node.module}` : "",
      "",
      "## Meaning",
      "",
      meaning,
      contextNote ? `\n${contextNote}` : "",
      node.documentation ? `\n## Documentation\n\n${node.documentation}` : "",
      childNodes.length ? `\n## Contained symbols\n\n${childNodes.map((child) => `- ${child.label || child.id} (${child.kind}, line ${child.line || "—"})`).join("\n")}` : "",
      connections.length ? `\n## Connected relationships\n\n${connections.join("\n")}` : "",
      sourceText ? `\n## Source\n\n\`\`\`${app?.language || ""}\n${sourceText}\n\`\`\`` : "",
    ].filter(Boolean).join("\n");
    try {
      await copyText(body);
      setContextCopyError(false);
      setContextCopied(true);
      trackEvent("source_context_copied");
      window.setTimeout(() => setContextCopied(false), 1600);
    } catch {
      setContextCopied(false);
      setContextCopyError(true);
    }
  }
  function closeInspector() {
    onClose();
    window.requestAnimationFrame(() => {
      const sourceTrigger = document.querySelector<HTMLButtonElement>('[aria-controls="source-inspector"]');
      if (sourceTrigger) sourceTrigger.focus();
      else document.querySelector<HTMLButtonElement>(".inspector-reopen")?.focus();
    });
  }
  return (
    <aside id="source-inspector" ref={inspectorRef} className="detail-panel" aria-label={`Source inspector for ${node.label || node.id}`}>
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
            {copied ? "Copied" : copyError ? "Retry" : hasSourceLocation ? "Copy location" : "Copy ID"}
          </button>
          {sourceUrl && (
            <a
              className="source-open"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${location} in the source repository (opens in a new tab)`}
              title={`Open ${location} in the source repository`}
              onClick={() => trackEvent("source_repository_opened")}
            >
              <Icon name="arrow" size={11} />
              Open repository
            </a>
          )}
          {hasSourceLocation && !sourceUrl && (
            <span className="source-link-note" title="Add bundle metadata.source_url_template to enable repository links">
              Repository link not configured
            </span>
          )}
          <span className="sr-only" aria-live="polite">{copied ? `${hasSourceLocation ? "Source location" : "Graph ID"} copied.` : copyError ? `${hasSourceLocation ? "Source location" : "Graph ID"} could not be copied.` : ""}</span>
        </div>
        {hasSourceLocation && onFile && (
          <button type="button" className="file-context-link" onClick={() => onFile(node.file)}>
            View all symbols in this file <Icon name="arrow" size={11} />
          </button>
        )}
        {parentNode && onNode && (
          <button type="button" className="file-context-link" onClick={() => onNode(parentNode.id)}>
            Inside {parentNode.label || parentNode.id} <Icon name="arrow" size={11} />
          </button>
        )}
        <pre className="source-code source-context" aria-label={sourceSnippet || node.sourceWindow ? `Source preview around line ${node.line || "unknown"}` : "Source unavailable"}>
          <code>
            {sourceLines.map((line, index) => (
              <span className={`source-line${index + 1 >= highlightedStart && index + 1 <= highlightedEnd ? " selected" : ""}`} key={`${node.id}-${index}`}>
                <span className="source-line-number">{sourceSnippet || node.sourceWindow ? sourceStartLine + index : "—"}</span>
                <span className="source-line-code">{line || " "}</span>
              </span>
            ))}
          </code>
        </pre>
        {!sourceSnippet && !node.sourceWindow && (
          <p className="source-unavailable-note">
            This bundle includes graph evidence for the node, but not its source text. Any available location, graph ID, and connected paths remain available below.
          </p>
        )}
        <button className="source-copy" type="button" onClick={copySnippet} disabled={!sourceText} title={!sourceText ? "No source text is available in this bundle" : undefined}>
          <Icon name="code" size={12} />
          {snippetCopied ? "Source copied" : snippetCopyError ? "Retry copy" : node.sourceWindow ? "Copy source window" : "Copy snippet"}
        </button>
        <span className="sr-only" aria-live="polite">{snippetCopied ? "Source snippet copied." : snippetCopyError ? "Source snippet could not be copied." : ""}</span>
        <button className="source-copy context-copy" type="button" onClick={copyContext}>
          <Icon name="spark" size={12} />
          {contextCopied ? "Context copied" : contextCopyError ? "Retry copy" : "Copy context"}
        </button>
        <span className="sr-only" aria-live="polite">{contextCopied ? "Symbol context copied as Markdown." : contextCopyError ? "Symbol context could not be copied." : ""}</span>
        {childNodes.length > 0 && onNode && (
          <div className="inspector-neighborhood inspector-contained">
            <span className="panel-label">CONTAINS</span>
            <p>Open a nested symbol without losing this file context.</p>
            <div className="inspector-neighborhood-list">
              {childNodes.map((child) => (
                <button
                  type="button"
                  key={child.id}
                  onClick={() => onNode(child.id)}
                  aria-label={`Inspect ${child.label || child.id} at line ${child.line || "unknown"}`}
                >
                  <span>
                    <b>{child.label || child.id}</b>
                    <small>{child.kind} · line {child.line || "—"}</small>
                  </span>
                  <Icon name="arrow" size={11} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="detail-rule" />
      <span className="panel-label">WHAT THIS NODE MEANS</span>
      <p className="detail-copy">
        {descriptions[node.kind] ||
          (contextRole
            ? "A node participating in the selected graph path."
            : "A node participating in the loaded code graph.")}
      </p>
      {(contextNote || contextOccurrence) && (
        <div className="node-documentation">
          <span className="panel-label">SELECTED PATH CONTEXT</span>
          {contextNote && <p>{contextNote}</p>}
          {contextOccurrence && <p>Occurrence · {contextOccurrence}</p>}
        </div>
      )}
      {node.documentation && (
        <div className="node-documentation">
          <span className="panel-label">DOCUMENTATION</span>
          <p>{node.documentation}</p>
        </div>
      )}
      {nearbyNodes.length > 0 && (
        <div className="inspector-neighborhood">
          <span className="panel-label">NEARBY IN THIS FILE</span>
          <p>Move to an adjacent symbol without leaving the source context.</p>
          <div className="inspector-neighborhood-list">
            {nearbyNodes.map((nearby) => (
              <button
                type="button"
                key={nearby.id}
                onClick={() => onNode?.(nearby.id)}
                aria-label={`Inspect ${nearby.label || nearby.id} at line ${nearby.line || "unknown"}`}
              >
                <span>
                  <b>{nearby.label || nearby.id}</b>
                  <small>{nearby.kind} · line {nearby.line || "—"}</small>
                </span>
                <Icon name="arrow" size={11} />
              </button>
            ))}
          </div>
        </div>
      )}
      {app && (
        <details
          className="inspector-disclosure"
          open={connectionsOpen}
          onToggle={(event) => setConnectionsOpen(event.currentTarget.open)}
        >
          <summary>
            <span>Connected context</span>
            <small>{flows.length + entries.length + relationships.length} connection{flows.length + entries.length + relationships.length === 1 ? "" : "s"}</small>
          </summary>
          <div className="inspector-disclosure-body">
          <>
          <div className="detail-rule" />
          <p className="detail-copy">
            This node is present in {flows.length} graph path
            {flows.length === 1 ? "" : "s"}, {entries.length} request flow
            {entries.length === 1 ? "" : "s"}, and {relationships.length}{" "}
            normalized relationship{relationships.length === 1 ? "" : "s"} in
            this bundle.
          </p>
          <div className="inspector-context">
            <span className="panel-label">{securityContext ? "CONNECTED EVIDENCE" : "CONNECTED CONTEXT"}</span>
            {flows.length > 0 && (
              <div>
                <small>GRAPH PATHS · OPEN IN TRACE</small>
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
                      <span>{flow.name} · {flow.kind || "graph path"} · {flow.steps.length} symbols{contextRoute(app, flow.steps.map((step) => step.node_id)) ? ` · ${contextRoute(app, flow.steps.map((step) => step.node_id))}` : ""}</span>
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
                <small>REQUEST FLOWS · OPEN IN JOURNEY</small>
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
                      <span>{entry.label} · {entry.hops.length} steps{contextRoute(app, entry.hops.map((hop) => hop.node_id)) ? ` · ${contextRoute(app, entry.hops.map((hop) => hop.node_id))}` : ""}</span>
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
                <small>RELATIONSHIPS · INSPECT NEIGHBOR</small>
                {(showAllConnections ? relationships : relationships.slice(0, 4)).map((edge) => {
                  const peerId =
                    edge.source === node.id ? edge.target : edge.source;
                  const peer = app.nodes.find((item) => item.id === peerId);
                  const peerFlow = app.flows.find((flow) => flow.steps.some((step) => step.node_id === peerId));
                  const peerEntry = app.entries.find((entry) => entry.hops.some((hop) => hop.node_id === peerId));
                  const crossesBoundary = Boolean(peer && scopeIdentity(node) && scopeIdentity(peer) && scopeIdentity(node) !== scopeIdentity(peer));
                    return (
                      <div className="relationship-item" key={edge.id}>
                        <span>
                          {edge.source === node.id ? "→ leads to" : "← receives from"}{" "}
                          {(onNode || peerFlow && onFlow || peerEntry && onEntry) ? <button type="button" className="relationship-peer" aria-label={`${onNode ? "Focus" : peerFlow && onFlow ? "Open graph path for" : "Open request flow for"} ${peer?.label || peerId}`} onClick={() => onNode ? onNode(peerId) : peerFlow && onFlow ? onFlow(peerFlow.id, peerId) : onEntry?.(app.entries.findIndex((item) => item.id === peerEntry!.id), peerId)}>{peer?.label || peerId}</button> : (peer?.label || peerId)} · {edge.relation || "connected"}
                        </span>
                        {(edge.origins?.length || edge.dynamic || edge.alias || edge.confidence) && (
                          <small className="relationship-signals">
                            {edge.origins?.map((origin) => <em key={origin}>{originLabel(origin)}</em>)}
                            {edge.dynamic && <em>runtime-dependent</em>}
                            {edge.alias && <em>alternate name</em>}
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
          </div>
        </details>
      )}
      <details className="inspector-disclosure inspector-facts-disclosure">
        <summary>
          <span>Graph facts</span>
          <small>{incoming} in · {outgoing} out</small>
        </summary>
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
              <dt>Request flows</dt>
              <dd>{entries.length}</dd>
            </div>
          </>
        )}
      </dl>
      </details>
    </aside>
  );
}
