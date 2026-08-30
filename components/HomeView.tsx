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
  onLoadSample: () => void;
  onView: (view: "map" | "investigate" | "trace" | "journey") => void;
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
    .find((step) => step.role === "sink");
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

function recommendationScore(flow: Flow) {
  const roles = flow.steps.map((step) => step.role.trim().toLowerCase());
  const hasSource = Boolean(flow.sourceNodeId) || roles.some((role) => ["source", "origin"].includes(role));
  const hasSink = Boolean(flow.sinkNodeId) || roles.includes("sink");
  return (flow.steps.length > 1 ? 100 : 0) + (hasSource ? 20 : 0) + (hasSink ? 20 : 0) + flow.steps.length;
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
  onLoadSample,
  onView,
  onFlow,
  onSink,
  onEntry,
}: Props) {
  const [selectedId, setSelectedId] = useState(app.findings[0]?.id ?? "");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  useEffect(() => {
    setSelectedId(app.findings[0]?.id ?? "");
    setQueueFilter("all");
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
  const graphFocus = useMemo(
    () => [...app.flows].sort((a, b) => recommendationScore(b) - recommendationScore(a))[0],
    [app.flows],
  );
  const firstEntry = app.entries[0];
  const firstSink = app.nodes.find(
    (node) =>
      node.kind === "sink" ||
      app.flows.some((flow) =>
        flow.steps.some((step) => step.node_id === node.id && step.role === "sink"),
      ),
  );
  const visibleFindings = useMemo(
    () =>
      queueFilter === "all"
        ? findings
        : findings.filter(
            (item) => evidenceStatus(item.evidence) === queueFilter,
          ),
    [findings, queueFilter],
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
        ? "Security metadata is present, but no traceable witness paths are available."
        : graphOnly
        ? "Understand the code through its connected paths."
        : "No open evidence paths in this bundle.";

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
              {app.bundle.projection ?? "graph evidence"} · contract{" "}
              {app.bundle.schemaVersion}
            </span>
          </div>
          <h1>{title}</h1>
          <p>
            {metadataOnly
              ? "This bundle includes security records without witness steps. Explore the graph structure while the exporter adds a traceable path."
              : graphOnly
              ? app.bundle.description || "Start with a value flow or request path, then move through the symbols and relationships that make the behavior understandable."
              : "Start with the strongest witness, inspect what controls it, and keep uncertainty visible. Lachesis shows the path the bundle contains—not a vulnerability verdict."}
          </p>
        </div>
        <div className="briefing-actions">
          <button className="load-bundle-action" onClick={onUpload} disabled={loadState.type === "loading"} aria-busy={loadState.type === "loading"}>
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
              <a className="download-fixture" href="/demo-bundle.json" download>
                Download security sample <Icon name="arrow" size={12} />
              </a>
              <a
                className="download-fixture"
                href="/code-exploration-bundle.json"
                download
              >
                Try code graph sample <Icon name="arrow" size={12} />
              </a>
              <button
                className="download-fixture sample-load"
                type="button"
                disabled={loadState.type === "loading"}
                onClick={onLoadSample}
              >
                Load code graph sample <Icon name="arrow" size={12} />
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
            <small>Start with a value flow or request path.</small>
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

      <section className="briefing-questions" aria-labelledby="briefing-questions-title">
        <div>
          <span className="panel-label" id="briefing-questions-title">START WITH A QUESTION</span>
          <p>Choose the kind of understanding you need first.</p>
        </div>
        <div className="question-list">
          <button type="button" onClick={() => graphFocus ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "") : onView("trace")}>
            <b>Where does a value go?</b>
            <small>Trace a value through its handoffs.</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => firstEntry ? onEntry(0, firstEntry.hops[0]?.node_id ?? "") : onView("journey")}>
            <b>What calls this code?</b>
            <small>Walk a request from entrypoint to effect.</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => firstSink ? onSink(firstSink.id) : onView("investigate")}>
            <b>What converges here?</b>
            <small>Compare paths that reach one boundary.</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => onView("map")}>
            <b>How is it connected?</b>
            <small>Survey modules, relationships, and shape.</small>
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </section>

      {loadState.message && (
        <p
          className={`briefing-notice ${loadState.type}`}
          role={loadState.type === "error" ? "alert" : "status"}
        >
          <i />
          {loadState.message}
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
                    {priority.sink?.file}:{priority.sink?.line}
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
                  <button onClick={() => onSink(priority.sink!.id)}>
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
              <p className="priority-summary">
                This bundled graph path connects {graphFocus.steps.length} symbols.
                Follow it to see how the code relates before making an
                interpretation.
              </p>
              <div className="judgment-row">
                <div>
                  <small>Path type</small>
                  <b>value path</b>
                </div>
                <div>
                  <small>Relationships</small>
                  <b>{app.edges.length} normalized</b>
                </div>
                <div>
                  <small>Evidence</small>
                  <b>{app.mcp.length ? `${app.mcp.length} MCP records` : "not supplied"}</b>
                </div>
              </div>
              <div className="priority-actions">
                <button
                  onClick={() =>
                    onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")
                  }
                >
                  Trace this path{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
                <button onClick={() => onView("map")}>Open full graph</button>
              </div>
            </>
          ) : metadataOnly ? (
            <div className="briefing-empty">
              <h2>Security metadata without a traceable path</h2>
              <p>
                {app.mcp.length} security record{app.mcp.length === 1 ? "" : "s"}{" "}
                {app.mcp.length === 1 ? "is" : "are"} attached, but the bundle
                does not include witness steps that can be inspected here.
              </p>
              <div className="priority-actions">
                <button onClick={() => onView("map")}>
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
                <button onClick={() => onView("map")}>
                  Open full graph{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="briefing-empty">
              <h2>No witness paths available</h2>
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
              <span>{graphOnly ? "Graph index" : metadataOnly ? "Security metadata" : "Evidence queue"}</span>
              <small>
                {metadataOnly
                  ? "Records without traceable witness steps"
                  : graphOnly
                  ? "Paths available to explore"
                  : "Choose a lead to keep it in context"}
              </small>
            </div>
            <b>{graphOnly ? app.flows.length : metadataOnly ? app.mcp.length : visibleFindings.length}</b>
          </div>
          {!graphOnly && !metadataOnly && (
            <div className="queue-filters" aria-label="Filter evidence queue">
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
                      ? "Open"
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
                aria-label={`Select ${item.flow.name}`}
                onClick={() =>
                  graphOnly
                    ? onFlow(item.flow.id, item.flow.sourceNodeId ?? item.flow.steps[0]?.node_id ?? "")
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
                      ? `${item.flow.steps.length} connected symbols`
                      : `${item.evidence?.confidence ?? "bundle"} confidence · ${item.flow.steps.length} steps`}
                  </small>
                </span>
                {!graphOnly && <EvidenceState evidence={item.evidence} />}
                <Icon name="arrow" size={12} />
              </button>
            ))}
          </div>
          {!queueItems.length && (
            <p className="queue-empty">
              {metadataOnly
                ? "These records need witness steps before they can be traced."
                : graphOnly
                ? graphFocus
                  ? "Security findings were not included; explore the graph paths instead."
                  : "No paths were included; open the full graph to browse its structure."
                : "No findings match this filter."}
            </p>
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
              <b>{metadataOnly ? "Security records" : graphOnly ? "Graph paths" : "Execution boundaries"}</b>
              <small>
                {metadataOnly
                  ? "Open the graph while these records await traceable witness steps."
                  : graphOnly && graphFocus
                  ? "Trace a bundled path through its connected symbols."
                  : graphOnly
                    ? "Open the graph to inspect its included structure."
                    : "Compare every value converging on a sink."}
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
          <button onClick={() => onView("map")}>
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
            onClick={() =>
              app.entries[0]
                ? onEntry(0, app.entries[0].hops[0]?.node_id ?? "")
                : onView("journey")
            }
          >
            <span className="reading-metric">{app.entries.length}</span>
            <span>
              <b>Request paths</b>
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
