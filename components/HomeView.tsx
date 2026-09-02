"use client";

import { useEffect, useMemo, useState } from "react";
import type { App, Evidence, Flow, Node } from "../lib/lachesis";
import { Icon } from "./Icon";

type LoadState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};
type Props = {
  app: App;
  isDemo: boolean;
  loadState: LoadState;
  onUpload: () => void;
  onReviewCoverage: () => void;
  onLoadSample: () => void;
  onLoadSecuritySample: () => void;
  onView: (view: "map" | "investigate" | "trace" | "journey") => void;
  onDismiss: () => void;
  direction: "backward" | "forward";
  onFlow: (flowId: string, nodeId: string) => void;
  onSink: (sinkId: string) => void;
  onEntry: (entryIndex: number, hopId: string) => void;
};

const statusCopy: Record<string, string> = {
  lead: "Review first",
  reported: "Reported evidence",
  inconclusive: "Unresolved",
  refuted: "Guard observed",
  verified: "Verified",
};
const statusRank: Record<string, number> = {
  lead: 0,
  reported: 1,
  inconclusive: 1,
  verified: 2,
  refuted: 3,
};
type QueueFilter = "all" | "lead" | "reported" | "inconclusive" | "refuted" | "verified";

function evidenceStatus(evidence?: Evidence) {
  return evidence?.status ?? (evidence ? "reported" : "lead");
}

function sinkFor(flow: Flow, app: App): Node | undefined {
  const sinkStep = [...flow.steps]
    .reverse()
    .find((step) => step.role.trim().toLowerCase() === "sink");
  return app.nodes.find((node) => node.id === (flow.sinkNodeId ?? sinkStep?.node_id ?? flow.steps.at(-1)?.node_id));
}

function sourceFor(flow: Flow, app: App): Node | undefined {
  const sourceStep = flow.steps.find((step) =>
    ["source", "origin"].includes(step.role.trim().toLowerCase()),
  );
  return app.nodes.find(
    (node) => node.id === (flow.sourceNodeId ?? sourceStep?.node_id ?? (flow.steps.length > 1 ? flow.steps[0]?.node_id : undefined)),
  );
}

function nodeLocation(node?: Node) {
  return node
    ? `${node.file || "Source unavailable"}:${node.line || "—"}`
    : "Source location unavailable";
}

function flowContext(flow: Flow, app: App) {
  const evidence = app.mcp.find((item) => item.for === flow.id);
  if (evidence?.result_summary) return evidence.result_summary;
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  if (!nodes.length) return "source location unavailable";
  const location = (node: (typeof app.nodes)[number]) => `${node.file || "source unavailable"}:${node.line || "—"}`;
  return nodes.length === 1 ? location(nodes[0]!) : `${location(nodes[0]!)} → ${location(nodes.at(-1)!)}`;
}

function pathLocation(flow: Flow, app: App) {
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  if (!nodes.length) return "source location unavailable";
  const location = (node: (typeof app.nodes)[number]) => `${node.file || "source unavailable"}:${node.line || "—"}`;
  return nodes.length === 1 ? location(nodes[0]!) : `${location(nodes[0]!)} → ${location(nodes.at(-1)!)}`;
}

function pathScopes(flow: Flow, app: App) {
  const labels: string[] = [];
  flow.steps.forEach((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const label = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository;
    if (label && labels.at(-1) !== label) labels.push(label);
  });
  return labels;
}

function recommendationScore(flow: Flow) {
  const roles = flow.steps.map((step) => step.role.trim().toLowerCase());
  const hasSource = Boolean(flow.sourceNodeId) || roles.some((role) => ["source", "origin"].includes(role));
  const hasSink = Boolean(flow.sinkNodeId) || roles.includes("sink");
  return (flow.steps.length > 1 ? 100 : 0) + (hasSource ? 20 : 0) + (hasSink ? 20 : 0) + flow.steps.length;
}

function pathKindLabel(flow: Flow) {
  const kind = flow.kind?.trim().toLowerCase();
  if (kind === "call-path" || kind === "callpath") return "call path";
  if (kind === "data-flow" || kind === "dataflow") return "data flow";
  if (kind === "value-flow" || kind === "valueflow") return "value path";
  return flow.kind?.trim() || "graph path";
}

function pathQuestion(flow?: Flow) {
  const kind = flow?.kind?.trim().toLowerCase();
  if (kind === "call-path" || kind === "callpath")
    return { title: "How does this call chain unfold?", detail: "Follow calls from symbol to symbol." };
  if (kind === "data-flow" || kind === "dataflow")
    return { title: "How does data move?", detail: "Follow data through each relationship." };
  if (kind === "value-flow" || kind === "valueflow")
    return { title: "Where does a value go?", detail: "Trace a value through its handoffs." };
  return { title: "How does this path work?", detail: "Follow its symbols and relationships." };
}

function EvidenceState({ evidence }: { evidence?: Evidence }) {
  const status = evidence?.status ?? (evidence ? "reported" : "lead");
  return (
    <span className={`finding-state state-${status}`}>
      <i />
      {statusCopy[status] ?? status}
    </span>
  );
}

export function HomeView({
  app,
  isDemo,
  loadState,
  onUpload,
  onReviewCoverage,
  onLoadSample,
  onLoadSecuritySample,
  onView,
  onDismiss,
  direction,
  onFlow,
  onSink,
  onEntry,
}: Props) {
  const [selectedId, setSelectedId] = useState(app.findings[0]?.id ?? "");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [queueSearch, setQueueSearch] = useState("");
  useEffect(() => {
    setSelectedId(app.findings[0]?.id ?? "");
    setQueueFilter("all");
    setQueueSearch("");
  }, [app]);
  const findings = useMemo(
    () =>
      app.findings
        .map((flow) => ({
          flow,
          evidence: app.mcp.find((item) => item.for === flow.id),
          sink: sinkFor(flow, app),
        }))
        .sort(
          (a, b) =>
            (statusRank[evidenceStatus(a.evidence)] ?? 4) -
            (statusRank[evidenceStatus(b.evidence)] ?? 4),
        ),
    [app],
  );
  const metadataOnly = findings.length === 0 && app.flows.length === 0 && app.mcp.length > 0;
  const graphOnly = findings.length === 0 && app.nodes.length > 0 && !metadataOnly;
  const securityMode = app.findings.length > 0 || app.bundle.projection === "security projection";
  const bundleMode = securityMode
    ? "Security evidence projection"
    : "Code exploration graph";
  const graphFocus = useMemo(
    () => [...app.flows].sort((a, b) => recommendationScore(b) - recommendationScore(a))[0],
    [app.flows],
  );
  const graphFocusNode = graphFocus?.steps[0]
    ? app.nodes.find((node) => node.id === graphFocus.steps[0]?.node_id)
    : undefined;
  const firstEntry = app.entries[0];
  const firstSink = [...app.nodes]
    .filter(
      (node) =>
        node.kind === "sink" ||
        app.flows.some((flow) =>
          flow.steps.some((step) => step.node_id === node.id && step.role.trim().toLowerCase() === "sink"),
        ),
    )
    .sort((a, b) => {
      const flowCount = (node: Node) => app.flows.filter((flow) => flow.steps.some((step) => step.node_id === node.id)).length;
      const stepCount = (node: Node) => app.flows.reduce((total, flow) => total + flow.steps.filter((step) => step.node_id === node.id).length, 0);
      return flowCount(b) - flowCount(a) || stepCount(b) - stepCount(a);
    })[0];
  const visibleFindings = useMemo(
    () => {
      const term = queueSearch.trim().toLowerCase();
      return findings.filter((item) => {
        const matchesStatus = queueFilter === "all" || evidenceStatus(item.evidence) === queueFilter;
        if (!matchesStatus) return false;
        if (!term) return true;
        const nodes = item.flow.steps
          .map((step) => app.nodes.find((node) => node.id === step.node_id))
          .filter(Boolean);
        return [
          item.flow.name,
          item.flow.kind,
          item.flow.description,
          item.evidence?.result_summary,
          ...item.flow.steps.flatMap((step) => [step.role, step.note, step.edge?.relation]),
          ...nodes.flatMap((node) => node ? [node.label, node.qualifiedName, node.signature, node.documentation, node.snippet, node.file, node.module] : []),
        ].filter(Boolean).join(" ").toLowerCase().includes(term);
      });
    },
    [app, findings, queueFilter, queueSearch],
  );
  const priority =
    visibleFindings.find((item) => item.flow.id === selectedId) ??
    visibleFindings[0];
  const queueItems = graphOnly
    ? app.flows.map((flow) => ({
        flow,
        evidence: undefined,
        sink: sinkFor(flow, app),
      }))
    : visibleFindings;
  const leadCount = findings.filter(
    (item) => evidenceStatus(item.evidence) === "lead",
  ).length;
  const reportedCount = findings.filter(
    (item) => evidenceStatus(item.evidence) === "reported",
  ).length;
  const unresolvedCount = findings.filter(
    (item) => item.evidence?.status === "inconclusive",
  ).length;
  const refutedCount = findings.filter(
    (item) => item.evidence?.status === "refuted",
  ).length;
  const filterCount = (filter: QueueFilter) =>
    filter === "all"
      ? findings.length
      : findings.filter((item) => evidenceStatus(item.evidence) === filter)
          .length;
  const dynamicCount = app.edges.filter((edge) => edge.dynamic).length;
  const incompletePaths = app.entries.filter(
    (entry) => !entry.hasLayout,
  ).length;
  const guardVerdict = priority?.evidence?.guards?.verdict;
  const title =
    leadCount || unresolvedCount
      ? `${leadCount} lead${leadCount === 1 ? "" : "s"} and ${unresolvedCount} unresolved path${unresolvedCount === 1 ? "" : "s"} deserve review.`
      : reportedCount
        ? `${reportedCount} reported path${reportedCount === 1 ? " is" : "s are"} ready to inspect.`
        : metadataOnly
        ? "Linked records are present, but no traceable path steps are available."
        : graphOnly
        ? graphFocus
          ? "Understand this code by following one path."
          : "Explore how this code is connected."
        : "No open evidence paths in this bundle.";

  if (graphOnly) {
    const startNode = graphFocus
      ? sourceFor(graphFocus, app) ?? app.nodes.find((node) => node.id === graphFocus.steps[0]?.node_id)
      : undefined;
    const endNode = graphFocus
      ? sinkFor(graphFocus, app) ?? app.nodes.find((node) => node.id === graphFocus.steps.at(-1)?.node_id)
      : undefined;
    const otherPaths = app.flows.filter((flow) => flow.id !== graphFocus?.id).slice(0, 4);

    return (
      <main className="understand-home">
        <header className="understand-hero">
          <div className="understand-copy">
            <span className="understand-eyebrow">CODE UNDERSTANDING WORKSPACE</span>
            <h1>Understand {app.name || "this codebase"}, one path at a time.</h1>
            <p>
              {app.bundle.description ||
                "Start with a real behavior, follow its calls and data handoffs, and inspect the source without losing your place—build a mental model without opening files one by one."}
            </p>
            <p className="understand-value">
              Paths keep the relevant symbols, relationships, and source context together, so unfamiliar code becomes a guided reading instead of file-by-file tab hopping.
            </p>
            <div className="understand-actions">
              {graphFocus && (
                <button
                  type="button"
                  className="understand-primary"
                  onClick={() => onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")}
                >
                  Follow “{graphFocus.name}” <Icon name="arrow" size={14} />
                </button>
              )}
              <button type="button" className="understand-secondary" onClick={onUpload} disabled={loadState.type === "loading"}>
                <Icon name="upload" size={14} />
                {loadState.type === "loading" ? "Reading bundle…" : "Load another bundle"}
              </button>
            </div>
          </div>
          <dl className="understand-facts" aria-label="Active codebase">
            <div><dt>Code paths</dt><dd>{app.flows.length.toLocaleString()} ready to follow</dd></div>
            <div><dt>Request flows</dt><dd>{app.entries.length.toLocaleString()} starting points</dd></div>
            <div><dt>Files</dt><dd>{(app.files.length || new Set(app.nodes.map((node) => node.file).filter(Boolean)).size).toLocaleString()} in this bundle</dd></div>
            <div><dt>Source previews</dt><dd>{app.nodes.filter((node) => node.snippet.trim() || node.sourceWindow?.lines.length).length.toLocaleString()} of {app.nodes.length.toLocaleString()} symbols</dd></div>
          </dl>
        </header>

        {loadState.message && (
          <p className={`briefing-notice ${loadState.type}`} role={loadState.type === "error" ? "alert" : "status"}>
            <i />
            <span>{loadState.message}</span>
            <button type="button" onClick={onDismiss} aria-label="Dismiss status message">×</button>
          </p>
        )}

        {app.coverage.limitations.length > 0 && (
          <aside className="understand-coverage" aria-label="Bundle coverage note">
            <div>
              <span className="panel-label">WHAT THIS BUNDLE INCLUDES</span>
              <p>
                {app.coverage.includedNodes ?? app.nodes.length} of {app.coverage.indexedNodes ?? app.nodes.length} indexed nodes are available here. Paths and source context reflect this bundle’s included projection.
              </p>
            </div>
            <div className="understand-coverage-detail">
              <small>{app.coverage.limitations[0]}{app.coverage.limitations.length > 1 ? ` · +${app.coverage.limitations.length - 1} more` : ""}</small>
              <button type="button" onClick={onReviewCoverage}>Review data quality <Icon name="arrow" size={12} /></button>
            </div>
          </aside>
        )}

        <section className="understand-questions" aria-labelledby="understand-questions-title">
          <div className="understand-section-heading">
            <h2 id="understand-questions-title">What do you want to understand?</h2>
            <p>Choose the question closest to the job in front of you.</p>
          </div>
          <div className="understand-question-list">
            <button type="button" onClick={() => graphFocus ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "") : onView("trace")}>
              <span><b>How does this behavior work?</b><small>{graphFocus ? "Follow one complete call or data path." : "No traceable code path is included in this bundle."}</small></span>
              <Icon name="arrow" size={14} />
            </button>
            <button type="button" onClick={() => firstEntry ? onEntry(0, firstEntry.hops[0]?.node_id ?? "") : onView("journey")}>
              <span><b>What happens after a starting point?</b><small>{firstEntry ? "Walk the request from handler to effect." : "No request flow is included in this bundle."}</small></span>
              <Icon name="arrow" size={14} />
            </button>
            <button type="button" onClick={() => onView("map")}>
              <span><b>How is the codebase organized?</b><small>Explore modules and their relationships.</small></span>
              <Icon name="arrow" size={14} />
            </button>
            <button type="button" onClick={() => firstSink ? onSink(firstSink.id) : onView("investigate")}>
              <span><b>What reaches this code?</b><small>{firstSink ? "Compare paths that arrive at one destination." : "No destination is available in this bundle."}</small></span>
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>

        {graphFocus ? (
          <section className="understand-start" aria-labelledby="understand-start-title">
            <div className="understand-section-heading">
              <h2 id="understand-start-title">A useful place to start</h2>
              <p>The most complete path included in this bundle.</p>
            </div>
            <div className="understand-path">
              <div className="understand-path-copy">
                <span>{pathKindLabel(graphFocus)} · {graphFocus.steps.length} symbols</span>
                <h3>{graphFocus.name}</h3>
                <p>{graphFocus.description || `Follow the path from ${startNode?.label || "its first symbol"} to ${endNode?.label || "its final symbol"}.`}</p>
              </div>
              <div className="understand-route" aria-label="Recommended path endpoints">
                <span><small>Starts at</small><b>{startNode?.label || "Not reported"}</b><em>{nodeLocation(startNode)}</em></span>
                <i><span /></i>
                <span><small>Ends at</small><b>{endNode?.label || "Not reported"}</b><em>{nodeLocation(endNode)}</em></span>
              </div>
              <button type="button" onClick={() => onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")}>
                Open this path <Icon name="arrow" size={14} />
              </button>
            </div>
          </section>
        ) : (
          <section className="understand-empty">
            <h2>No ready-made paths were included</h2>
            <p>The graph is still available. Explore its symbols and relationships directly.</p>
            <button type="button" onClick={() => onView("map")}>Explore the graph <Icon name="arrow" size={14} /></button>
          </section>
        )}

        {otherPaths.length > 0 && (
          <section className="understand-more" aria-labelledby="understand-more-title">
            <div className="understand-section-heading">
              <h2 id="understand-more-title">Other paths in this bundle</h2>
              <p>Open only what helps answer your next question.</p>
            </div>
            <div className="understand-path-list">
              {otherPaths.map((flow) => (
                <button type="button" key={flow.id} onClick={() => onFlow(flow.id, flow.sourceNodeId ?? flow.steps[0]?.node_id ?? "")}>
                  <span><b>{flow.name}</b><small>{pathKindLabel(flow)} · {flow.steps.length} symbols · {pathLocation(flow, app)}</small></span>
                  <Icon name="arrow" size={13} />
                </button>
              ))}
            </div>
          </section>
        )}

        <footer className="understand-footer">
          <span>Source stays beside every step. Path explanations can be copied as portable Markdown.</span>
          <span>{isDemo ? "Synthetic sample" : "Processed locally"} · {app.language || "language not reported"}</span>
          {isDemo && <button type="button" onClick={onLoadSecuritySample}>View security projection</button>}
        </footer>
      </main>
    );
  }

  return (
    <main className="investigation-briefing">
      <header className="briefing-intro">
        <div className="briefing-copy">
          <div className="briefing-status-line">
            <span className={isDemo ? "fixture-flag" : "fixture-flag live"}>
              <i />
              {isDemo ? "Synthetic working bundle" : "Loaded local bundle"}
            </span>
            <span>
              {bundleMode} · contract{" "}
              {app.bundle.schemaVersion}
            </span>
          </div>
          <h1>{title}</h1>
          <p>
            {metadataOnly
              ? "This bundle includes linked records without path steps. Explore the graph structure while the exporter adds a traceable path."
              : graphOnly
              ? app.bundle.description ||
                (graphFocus
                  ? "Start with a bundled path, then move through the symbols and relationships that make the behavior understandable."
                  : "This bundle contains graph structure but no bundled paths. Open the graph to inspect its relationships directly.")
              : "Start with the strongest witness, inspect what controls it, and keep uncertainty visible. Lachesis shows the path the bundle contains—not a vulnerability verdict."}
          </p>
        </div>
        <div className="briefing-actions">
          <button type="button" className="load-bundle-action" onClick={onUpload} disabled={loadState.type === "loading"} aria-busy={loadState.type === "loading"}>
            <span>
              <Icon name="upload" size={16} />
              <b>
                {loadState.type === "loading"
                  ? "Reading bundle…"
                  : "Load bundle.json"}
              </b>
              <small>Processed only in this browser</small>
            </span>
            <span className="action-orb">
              <Icon name="arrow" size={14} />
            </span>
          </button>
          {isDemo && (
            <div className="fixture-links">
              <a
                className="download-fixture"
                href={securityMode ? "/demo-bundle.json" : "/code-exploration-bundle.json"}
                download
              >
                Download current sample <Icon name="arrow" size={12} />
              </a>
              <button
                className="download-fixture sample-load"
                type="button"
                disabled={loadState.type === "loading"}
                onClick={securityMode ? onLoadSample : onLoadSecuritySample}
              >
                {securityMode ? "Switch to code sample" : "View security sample"} <Icon name="arrow" size={12} />
              </button>
            </div>
          )}
        </div>
      </header>

      <ol className="briefing-guide" aria-label="How to read this bundle">
        <li>
          <span>01</span>
          <div>
            <b>Choose a path</b>
            <small>{graphFocus ? `Start with a ${pathKindLabel(graphFocus)} or request flow.` : "Open the graph to inspect its relationships."}</small>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <b>Follow the handoffs</b>
            <small>Read each symbol and relationship in sequence.</small>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <b>Open the source</b>
            <small>Verify the exact file and line behind the step.</small>
          </div>
        </li>
      </ol>

      {loadState.message && (
        <p
          className={`briefing-notice ${loadState.type}`}
          role={loadState.type === "error" ? "alert" : "status"}
        >
          <i />
          <span>{loadState.message}</span>
          {loadState.type === "error" && <button type="button" className="notice-action" onClick={onUpload}>Try another bundle</button>}
          <button type="button" onClick={onDismiss} aria-label="Dismiss status message">×</button>
        </p>
      )}

      <div className="triage-board">
        <section className="priority-investigation">
          <div className="priority-header">
            <span>
              {graphOnly ? "Suggested starting path" : "Priority investigation"}
            </span>
            {priority && <EvidenceState evidence={priority.evidence} />}
          </div>
          {priority ? (
            <>
              <div className="priority-title">
                <span className="target-mark">
                  <Icon name="target" size={18} />
                </span>
                <div>
                  <h2>{priority.flow.name}</h2>
                  <p>
                    {nodeLocation(priority.sink)}
                  </p>
                </div>
              </div>
              <div className="witness-route" aria-label="Witness summary">
                <span>
                  <small>Source</small>
                  <b>
                    {sourceFor(priority.flow, app)?.label ?? "Unknown source"}
                  </b>
                </span>
                <i>
                  <span />
                </i>
                <span>
                  <small>Boundary</small>
                  <b>{priority.sink?.label ?? "Unknown sink"}</b>
                </span>
              </div>
              <p className="priority-summary">
                {priority.evidence?.result_summary ?? priority.flow.description ??
                  `${priority.flow.steps.length} bundled steps connect the selected source and boundary.`}
              </p>
              <div className="judgment-row">
                <div>
                  <small>Confidence</small>
                  <b>{priority.evidence?.confidence ?? "bundle"}</b>
                </div>
                <div>
                  <small>Guard verdict</small>
                  <b>{guardVerdict?.replace("-", " ") ?? "not reported"}</b>
                </div>
                <div>
                  <small>Witness</small>
                  <b>{priority.flow.steps.length} steps</b>
                </div>
              </div>
              {priority.evidence?.limitations?.[0] && (
                <p className="priority-limitation">
                  <Icon name="spark" size={13} />
                  <span>
                    <b>Known limit</b>
                    {priority.evidence.limitations[0]}
                  </span>
                </p>
              )}
              <div className="priority-actions">
                <button
                  type="button"
                  onClick={() =>
                    onFlow(priority.flow.id, priority.flow.sourceNodeId ?? priority.flow.steps[0].node_id)
                  }
                >
                  Trace this witness{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
                {priority.sink && (
                  <button type="button" onClick={() => onSink(priority.sink!.id)}>
                    Compare reaching paths
                  </button>
                )}
              </div>
            </>
          ) : graphOnly && graphFocus ? (
            <>
              <div className="priority-title">
                <span className="target-mark">
                  <Icon name="code" size={18} />
                </span>
                <div>
                  <h2>{graphFocus.name}</h2>
                  <p>Suggested starting path · code understanding</p>
                </div>
              </div>
              {graphFocus.steps.length > 1 ? (
                <div className="witness-route" aria-label="Path summary">
                  <span>
                    <small>Starts at</small>
                    <b>
                      {sourceFor(graphFocus, app)?.label ?? "Source not reported"}
                    </b>
                  </span>
                  <i>
                    <span />
                  </i>
                  <span>
                    <small>Reaches</small>
                    <b>
                      {sinkFor(graphFocus, app)?.label ?? "Boundary not reported"}
                    </b>
                  </span>
                </div>
              ) : (
                <div className="witness-route single-symbol-route" aria-label="Selected symbol">
                  <span>
                    <small>Starting symbol</small>
                    <b>{graphFocusNode?.label ?? graphFocus.steps[0]?.node_id ?? "Symbol not reported"}</b>
                  </span>
                  <span>
                    <small>Location</small>
                    <b>{graphFocusNode ? `${graphFocusNode.file || "Source unavailable"}:${graphFocusNode.line || "—"}` : "Source location unavailable"}</b>
                  </span>
                </div>
              )}
              {pathScopes(graphFocus, app).length > 1 && (
                <div className="briefing-scope-route" aria-label="Path context route">
                  <small>Context route</small>
                  <b>{pathScopes(graphFocus, app).join(" → ")}</b>
                </div>
              )}
              <p className="priority-summary">
                {graphFocus.steps.length > 1
                  ? `This bundled ${pathKindLabel(graphFocus)} connects ${graphFocus.steps.length} symbols. Open it to inspect each relationship and its exact source location.`
                  : "This bundle contains one symbol for this path. Open it to inspect its source and relationships in the surrounding graph."}
              </p>
              <div className="judgment-row">
                <div>
                  <small>Path type</small>
                  <b>{pathKindLabel(graphFocus)}</b>
                </div>
                <div>
                  <small>Relationships</small>
                  <b>{app.edges.length} normalized</b>
                </div>
                <div>
                  <small>Evidence</small>
                  <b>{app.mcp.length ? `${app.mcp.length} linked records` : "not supplied"}</b>
                </div>
              </div>
              <div className="priority-actions">
                <button
                  type="button"
                  onClick={() =>
                    onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")
                  }
                >
                  Start with this path{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
                <button type="button" onClick={() => onView("map")}>Open full graph</button>
              </div>
            </>
          ) : metadataOnly ? (
            <div className="briefing-empty">
              <h2>Linked records without a traceable path</h2>
              <p>
                {app.mcp.length} linked record{app.mcp.length === 1 ? "" : "s"}{" "}
                {app.mcp.length === 1 ? "is" : "are"} attached, but the bundle
                does not include path steps that can be inspected here.
              </p>
              <div className="priority-actions">
                <button type="button" onClick={() => onView("map")}>
                  Explore the graph{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
              </div>
            </div>
          ) : graphOnly ? (
            <div className="briefing-empty">
              <h2>Graph structure is ready to explore</h2>
              <p>
                This bundle includes {app.nodes.length} nodes and{" "}
                {app.edges.length} relationships, but no graph paths were
                included.
              </p>
              <div className="priority-actions">
                <button type="button" onClick={() => onView("map")}>
                  Open full graph{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="briefing-empty">
              <h2>No traceable paths available</h2>
              <p>
                Load a bundle containing finding witnesses or value flows to
                begin an investigation.
              </p>
            </div>
          )}
        </section>

        <aside className="evidence-queue">
          <div className="queue-heading">
            <div>
              <span>{graphOnly ? "Graph index" : metadataOnly ? "Linked records" : "Evidence queue"}</span>
              <small>
                {metadataOnly
                  ? "Records without traceable path steps"
                  : graphOnly
                  ? "Paths available to explore"
                  : "Choose a lead to keep it in context"}
              </small>
            </div>
            <b>{graphOnly ? app.flows.length : metadataOnly ? app.mcp.length : visibleFindings.length}</b>
          </div>
          {!graphOnly && !metadataOnly && (
            <div className="queue-filters" role="group" aria-label="Filter evidence queue">
              {(
                ["all", "lead", "reported", "inconclusive", "refuted", "verified"] as QueueFilter[]
              ).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  className={queueFilter === filter ? "active" : ""}
                  aria-pressed={queueFilter === filter}
                  onClick={() => setQueueFilter(filter)}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "lead"
                      ? "Lead"
                      : filter === "reported"
                        ? "Reported"
                      : filter === "inconclusive"
                        ? "Unresolved"
                    : filter === "refuted"
                      ? "Refuted"
                      : "Verified"}{" "}
                  <span>{filterCount(filter)}</span>
                </button>
              ))}
            </div>
          )}
          {!graphOnly && !metadataOnly && (
            <label className="search queue-search">
              <Icon name="search" size={14} />
              <input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Find a path, symbol, file, or code…"
                aria-label="Search evidence paths by path, symbol, file, or source code"
              />
              {queueSearch && <button type="button" onClick={() => setQueueSearch("")} aria-label="Clear evidence search">×</button>}
            </label>
          )}
          <div className="queue-list">
            {queueItems.map((item, index) => (
              <button
                type="button"
                key={item.flow.id}
                className={
                  item.flow.id === (priority?.flow.id ?? graphFocus?.id)
                    ? "active"
                    : ""
                }
                aria-pressed={
                  item.flow.id === (priority?.flow.id ?? graphFocus?.id)
                }
                aria-label={`Select ${item.flow.name}, ${flowContext(item.flow, app)}`}
                onClick={() =>
                  graphOnly
                    ? onFlow(item.flow.id, direction === "forward" ? item.flow.steps.at(-1)?.node_id ?? "" : item.flow.sourceNodeId ?? item.flow.steps[0]?.node_id ?? "")
                    : setSelectedId(item.flow.id)
                }
              >
                <span className="queue-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="queue-copy">
                  <b>{item.flow.name}</b>
                  <small>
                    {graphOnly
                      ? `${pathKindLabel(item.flow)} · ${item.flow.steps.length} symbols · ${pathLocation(item.flow, app)}`
                      : `${item.evidence?.confidence ?? "bundle"} confidence · ${item.flow.steps.length} steps`}
                  </small>
                  {graphOnly && <small className="queue-row-context">{flowContext(item.flow, app)}</small>}
                </span>
                {!graphOnly && <EvidenceState evidence={item.evidence} />}
                <Icon name="arrow" size={12} />
              </button>
            ))}
          </div>
          {!queueItems.length && (
            <div className="queue-empty">
              {metadataOnly
                ? "These records need path steps before they can be traced."
                : graphOnly
                  ? graphFocus
                    ? "This bundle has no security overlay; explore its graph paths instead."
                    : "No paths were included; open the full graph to browse its structure."
                : queueSearch
                  ? `No findings match “${queueSearch}”${queueFilter !== "all" ? " with this status filter" : ""}.`
                  : "No findings match this filter."}
              {!graphOnly && !metadataOnly && (queueFilter !== "all" || queueSearch) && (
                <button type="button" onClick={() => { setQueueFilter("all"); setQueueSearch(""); }}>
                  {queueSearch ? "Clear search and filters" : "Show all findings"}
                </button>
              )}
            </div>
          )}
          {!graphOnly && !metadataOnly && (
            <div className="queue-foot">
              <span>
                <i className="lead-dot" />
                {leadCount} lead
              </span>
              <span>
                <i className="unknown-dot" />
                {unresolvedCount} unresolved
              </span>
              <span>
                <i className="reported-dot" />
                {reportedCount} reported
              </span>
              <span>
                <i className="refuted-dot" />
                {refutedCount} refuted
              </span>
              <span>
                <i className="verified-dot" />
                {findings.filter((item) => evidenceStatus(item.evidence) === "verified").length} verified
              </span>
            </div>
          )}
        </aside>
      </div>

      <section className="briefing-questions" aria-labelledby="briefing-questions-title">
        <div>
          <span className="panel-label" id="briefing-questions-title">LOOK AT IT ANOTHER WAY</span>
          <p>Choose a different question when the suggested path is not the one you need.</p>
        </div>
        <div className="question-list">
          <button type="button" onClick={() => graphFocus ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "") : onView("trace")}>
            <b>{pathQuestion(graphFocus).title}</b>
            <small>{graphFocus ? pathQuestion(graphFocus).detail : "No graph paths in this bundle."}</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => firstEntry ? onEntry(0, firstEntry.hops[0]?.node_id ?? "") : onView("journey")}>
            <b>What calls this code?</b>
            <small>{firstEntry ? "Walk a request from starting point to effect." : "No request flows in this bundle."}</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => firstSink ? onSink(firstSink.id) : onView("investigate")}>
            <b>What converges here?</b>
            <small>{firstSink ? "Compare paths that reach one boundary." : "No boundary nodes in this bundle."}</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => onView("map")}>
            <b>How is it connected?</b>
            <small>Survey modules, relationships, and shape.</small>
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </section>

      <section className="bundle-reading">
        <div className="reading-heading">
          <div>
            <h2>Read the bundle from another angle.</h2>
            <p>The same evidence stays connected as you change lenses.</p>
          </div>
          <span>
            {app.name} · {app.commit}
          </span>
        </div>
        <div className="reading-grid">
          <button
            type="button"
            onClick={() =>
              metadataOnly
                ? onView("map")
                : graphOnly
                ? graphFocus
                  ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")
                  : onView("map")
                : onView("investigate")
            }
          >
            <span className="reading-metric">
              {metadataOnly
                ? app.mcp.length
                : graphOnly
                ? app.flows.length
                : new Set(findings.map((item) => item.sink?.id).filter(Boolean))
                    .size}
            </span>
            <span>
              <b>{metadataOnly ? "Linked records" : graphOnly ? "Graph paths" : "Execution boundaries"}</b>
              <small>
                {metadataOnly
                  ? "Open the graph while these records await traceable path steps."
                  : graphOnly && graphFocus
                  ? "Trace a bundled path through its connected symbols."
                  : graphOnly
                    ? "Open the graph to inspect its included structure."
                    : "Compare every value converging on a sink."}
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
          <button type="button" onClick={() => onView("map")}>
            <span className="reading-metric">{app.nodes.length}</span>
            <span>
              <b>Graph topology</b>
              <small>
                {app.edges.length} relationships · {dynamicCount} dynamic.
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
          <button
            type="button"
            onClick={() =>
              app.entries[0]
                ? onEntry(0, app.entries[0].hops[0]?.node_id ?? "")
                : onView("journey")
            }
          >
            <span className="reading-metric">{app.entries.length}</span>
            <span>
              <b>Request flows</b>
              <small>
                {incompletePaths
                  ? `${incompletePaths} use derived layout`
                  : "All carry bundled layout"}
                .
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
        </div>
      </section>

      <footer className="bundle-provenance">
        <div>
          <span className="local-badge">
            <i />
            Local-only inspection
          </span>
          <span>
            {app.language} · {app.lines > 0 ? `${app.lines.toLocaleString()} indexed lines` : "line count not reported"}
          </span>
          <span className="coverage-note">
            <i />
            {(app.coverage.includedNodes ?? app.nodes.length).toLocaleString()} graph nodes shown ·{" "}
            {(app.coverage.indexedNodes ?? app.nodes.length).toLocaleString()} indexed
          </span>
        </div>
        <div>
          <span>Engine</span>
          <b>{app.bundle.engine ?? "not reported"}</b>
          <span>Catalog</span>
          <b>{app.bundle.catalog ?? "not reported"}</b>
        </div>
      </footer>
    </main>
  );
}
