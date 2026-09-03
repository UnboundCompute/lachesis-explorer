"use client";
import { useEffect, useMemo, useState } from "react";
import { countLabel, entryDisplayName, type App } from "../lib/lachesis";
import { Icon } from "./Icon";
import { NodeInspector } from "./NodeInspector";
import { ConvergenceCanvas } from "./ConvergenceCanvas";
import { EvidenceMatrix } from "./EvidenceMatrix";
import { trackEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";

function nodeLocation(node: App["nodes"][number]) {
  return `${node.file || "Source unavailable"}:${node.line || "—"}`;
}

function nodeContext(node: App["nodes"][number]) {
  return node.scope?.label || node.scope?.service || node.scope?.package || node.scope?.module || node.scope?.repository || "Unscoped";
}
const hasSource = (node: App["nodes"][number] | undefined) => Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);

type Props = {
  app: App;
  sinkId: string;
  setSinkId: (id: string) => void;
  onOpenFlow: (flowId: string, nodeId: string, position?: number) => void;
  onEntry?: (entryIndex: number, nodeId: string) => void;
  onRecord: (action: string, target: string, detail: string) => void;
  onView: (view: "trace" | "map", nodeId?: string) => void;
  onFile?: (file: string) => void;
  onShare?: (sinkId: string) => Promise<boolean>;
};

export function SinkView({
  app,
  sinkId,
  setSinkId,
  onOpenFlow,
  onEntry,
  onRecord,
  onView,
  onFile,
  onShare,
}: Props) {
  const sinks = useMemo(
    () =>
      app.nodes.filter(
        (node) =>
          node.kind === "sink" ||
          app.flows.some((flow) =>
            flow.steps.some(
              (step) => step.node_id === node.id && step.role.trim().toLowerCase() === "sink",
            ),
          ),
      ),
    [app],
  );
  const nodeById = useMemo(() => new Map(app.nodes.map((node) => [node.id, node])), [app.nodes]);
  const flowCountByNode = useMemo(() => {
    const counts = new Map<string, number>();
    app.flows.forEach((flow) => {
      new Set(flow.steps.map((step) => step.node_id)).forEach((nodeId) => {
        counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
      });
    });
    return counts;
  }, [app.flows]);
  const sink = sinks.find((node) => node.id === sinkId) ?? sinks[0];
  const securityMode = app.findings.length > 0 || app.bundle.projection === "security projection";
  const [mode, setMode] = useState<"field" | "matrix">("field");
  const [selectedId, setSelectedId] = useState(
    sink?.id ?? app.nodes[0]?.id ?? "",
  );
  const [previousSinkId, setPreviousSinkId] = useState("");
  const [sinkSearch, setSinkSearch] = useState("");
  const [pathSearch, setPathSearch] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [pathsCopyState, setPathsCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (sink?.id) setSelectedId(sink.id);
    setSinkSearch("");
    setPathSearch("");
    setPreviousSinkId("");
    setShareState("idle");
    setPathsCopyState("idle");
  }, [app, sink?.id]);
  useEffect(() => {
    setMode("field");
  }, [app]);
  const visibleSinks = useMemo(() => {
    const term = sinkSearch.trim().toLowerCase();
    if (!term) return sinks;
    return sinks.filter((item) => {
      const pathCount = flowCountByNode.get(item.id) ?? 0;
      const haystack = [
        item.label,
        item.file,
        item.module,
        item.scope?.label,
        item.scope?.service,
        item.scope?.package,
        item.scope?.module,
        String(pathCount),
      ].join(" ").toLowerCase();
      return term.split(/\s+/).every((part) => {
        const [key, ...rest] = part.split(":");
        const value = rest.join(":");
        if (rest.length) {
          if (key === "has" && (value === "paths" || value === "path")) return pathCount > 0;
          if (key === "has" && (value === "no-paths" || value === "no-path")) return pathCount === 0;
          if (key === "file") return item.file.toLowerCase().includes(value);
          if (key === "module") return [item.module, item.scope?.module].some((context) => context?.toLowerCase().includes(value));
          if (key === "scope" || key === "service" || key === "repo" || key === "repository") {
            return [item.scope?.label, item.scope?.repository, item.scope?.service, item.scope?.package, item.scope?.module]
              .some((context) => context?.toLowerCase().includes(value));
          }
          if (key === "kind") return item.kind.toLowerCase().includes(value);
          return false;
        }
        return haystack.includes(part);
      });
    });
  }, [app, flowCountByNode, sinkSearch, sinks]);
  const sinkOptions = sink && visibleSinks.includes(sink)
    ? visibleSinks
    : sink
      ? [sink, ...visibleSinks]
      : visibleSinks;
  const boundaryFilterSuggestions = [
    sinks.some((item) => (flowCountByNode.get(item.id) ?? 0) > 0)
      ? { label: "With paths", query: "has:paths" }
      : null,
    sinks.some((item) => (flowCountByNode.get(item.id) ?? 0) === 0)
      ? { label: "No paths", query: "has:no-paths" }
      : null,
    ...[...new Set(sinks.map((item) => item.scope?.service).filter(Boolean))]
      .slice(0, 2)
      .map((service) => ({ label: service!, query: `service:${service}` })),
  ].filter((suggestion): suggestion is { label: string; query: string } => Boolean(suggestion));
  if (!sink)
    return (
      <main className="workspace-empty" aria-label="Boundary workspace">
        <span className="empty-target">
          <Icon name="target" size={22} />
        </span>
        <h2>No sinks identified in this bundle</h2>
        <p>
          A sink appears here only when a node is labeled <code>sink</code> or
          participates in a flow with the sink role.
        </p>
        <button
          className="context-upload"
          type="button"
          onClick={() => onView(app.flows.length ? "trace" : "map")}
        >
          <span>{app.flows.length ? "Open graph paths" : "Open graph"}</span>
          <span className="button-icon">
            <Icon name="arrow" size={14} />
          </span>
        </button>
      </main>
    );
  const allFlows = app.flows.filter((flow) =>
    flow.steps.some((step) => step.node_id === sink.id),
  );
  const flows = pathSearch.trim()
    ? allFlows.filter((flow) => {
        const nodes = flow.steps
          .map((step) => nodeById.get(step.node_id))
          .filter(Boolean);
        const searchable = [
          flow.name,
          flow.kind,
          flow.description,
          ...flow.steps.flatMap((step) => [step.role, step.note, step.edge?.relation]),
          ...nodes.flatMap((node) => node ? [node.label, node.qualifiedName, node.signature, node.documentation, node.snippet, node.sourceWindow?.lines.join(" "), node.file, node.module] : []),
        ].filter(Boolean).join(" ").toLowerCase();
        return pathSearch.trim().toLowerCase().split(/\s+/).every((term) => {
          const [key, ...rest] = term.split(":");
          const value = rest.join(":");
          if (key === "has" && (value === "source" || value === "source-preview")) return nodes.some(hasSource);
          if (key === "has" && (value === "source-gap" || value === "missing-source")) return nodes.some((node) => !hasSource(node));
          return searchable.includes(term);
        });
      })
    : allFlows;
  const flowNodes = new Set(
    flows.flatMap((flow) => flow.steps.map((step) => step.node_id)),
  );
  const overlaps = app.entries.filter((entry) =>
    entry.hops.some((hop) => flowNodes.has(hop.node_id)),
  );
  const selected = nodeById.get(selectedId) ?? sink;
  const selectedRole = flows
    .flatMap((flow) => flow.steps)
    .find((step) => step.node_id === selected.id)?.role;
  const aliases = flows
    .flatMap((flow) => flow.steps)
    .filter((step) => step.edge?.alias).length;
  const dynamic = flows
    .flatMap((flow) => flow.steps)
    .filter((step) => step.edge?.dynamic).length;
  const pathNoun = securityMode ? "value flow" : "graph path";
  const pathNounPlural = securityMode ? "value flows" : "graph paths";
  const previousSink = sinks.find((node) => node.id === previousSinkId);
  function rememberSink(nextId: string) {
    if (sink.id !== nextId) setPreviousSinkId(sink.id);
  }
  function returnToPreviousSink() {
    if (!previousSink) return;
    const currentSinkId = sink.id;
    setPreviousSinkId(currentSinkId);
    setSinkId(previousSink.id);
    setSelectedId(previousSink.id);
    setInspectorOpen(true);
    onRecord("Returned to execution boundary", previousSink.label || previousSink.id, nodeLocation(previousSink));
    trackEvent("sink_selection_reversed");
  }
  function chooseSink(id: string) {
    const next = sinks.find((node) => node.id === id);
    rememberSink(id);
    setSinkId(id);
    setSelectedId(id);
    setInspectorOpen(true);
    if (next) {
      onRecord(
        "Focused sink",
        next.label || next.id,
        `${flowCountByNode.get(id) ?? 0} ${pathNounPlural}`,
      );
      trackEvent("sink_selected");
    }
  }
  function chooseNode(id: string) {
    const node = nodeById.get(id);
    setSelectedId(id);
    setInspectorOpen(true);
    if (node)
      onRecord(
        "Inspected node",
        node.label || node.id,
        nodeLocation(node),
      );
    trackEvent("convergence_node_selected");
  }
  async function shareSink() {
    if (!onShare) return;
    const copied = await onShare(sink.id);
    setShareState(copied ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 1800);
  }
  async function copyPaths() {
    const text = flows
      .map((flow) => {
        const sequence = flow.steps
          .map((step, index) => {
            const node = nodeById.get(step.node_id);
            return `${String(index + 1).padStart(2, "0")}. ${step.role} — ${node?.label || step.node_id} · ${nodeLocation(node || app.nodes[0])}${nodeContext(node || app.nodes[0]) !== "Unscoped" ? ` · ${nodeContext(node || app.nodes[0])}` : ""}${step.edge?.relation ? ` · via ${step.edge.relation}` : ""}`;
          })
          .join("\n");
        return `${flow.name}\n${sequence}`;
      })
      .join("\n\n");
    try {
      await copyText(`${sink.label || sink.id} · ${pathNounPlural}\n\n${text}`);
      setPathsCopyState("copied");
      trackEvent("convergence_paths_copied");
      window.setTimeout(() => setPathsCopyState("idle"), 1800);
    } catch {
      setPathsCopyState("failed");
      trackEvent("convergence_paths_copy_failed");
    }
  }
  return (
    <section
      className={`sink-workspace${inspectorOpen ? "" : " inspector-closed"}`}
    >
      <aside className="sink-rail">
        <div className="rail-heading">
          <span className="panel-label">EXECUTION BOUNDARIES</span>
          <span>{sinks.length}</span>
        </div>
        <label className="search sink-search">
          <Icon name="search" size={14} />
          <input
            value={sinkSearch}
            onChange={(event) => setSinkSearch(event.target.value)}
            placeholder="Find a boundary…"
            aria-label="Filter execution boundaries by name, file, module, service, or path count"
          />
          {sinkSearch && <button type="button" onClick={() => setSinkSearch("")} aria-label="Clear boundary filter"><Icon name="close" size={14} /></button>}
        </label>
        <div className="entry-search-status" aria-live="polite">
          {sinkSearch ? `${countLabel(visibleSinks.length, "boundary")} of ${countLabel(sinks.length, "boundary")} ${visibleSinks.length === 1 ? "matches" : "match"}` : `${countLabel(sinks.length, "execution boundary")}`}
        </div>
        {boundaryFilterSuggestions.length > 0 && (
          <div className="filter-hints" role="group" aria-label="Quick boundary filters">
            {boundaryFilterSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.query}
                onClick={() => {
                  setSinkSearch(suggestion.query);
                  trackEvent("semantic_filter_applied", {
                    surface: "boundary",
                    filter: suggestion.query.split(":", 1)[0] || "text",
                  });
                }}
              >
                {suggestion.label}
              </button>
            ))}
            {sinkSearch && <button type="button" className="query-clear" onClick={() => setSinkSearch("")}>Clear</button>}
          </div>
        )}
        {sinkSearch && !visibleSinks.some((item) => item.id === sink.id) && (
          <div className="filter-context" role="status">
            <span>Selected boundary is outside this filter.</span>
            <button type="button" onClick={() => setSinkSearch("")}>Show selected boundary</button>
          </div>
        )}
        {sinkSearch && !visibleSinks.length && (
          <div className="selector-empty" role="status">
            <span>No boundaries match “{sinkSearch}”.</span>
            <button type="button" onClick={() => setSinkSearch("")}>Clear filter</button>
          </div>
        )}
        <div className="sink-list">
          {sinkOptions.map((item) => {
            const count = flowCountByNode.get(item.id) ?? 0;
            return (
              <button
                type="button"
                key={item.id}
                className={item.id === sink.id ? "selected" : ""}
                aria-pressed={item.id === sink.id}
                aria-current={item.id === sink.id ? "step" : undefined}
                onClick={() => chooseSink(item.id)}
              >
                <span className="sink-pulse">
                  <i />
                </span>
                <span>
                  <b>{item.label || item.id}</b>
                  <small>
                    {nodeContext(item)} · {nodeLocation(item)}
                  </small>
                </span>
                <em>{count}</em>
              </button>
            );
          })}
        </div>
        <div className="sink-rail-note">
          <Icon name="target" size={14} />
          <p>
            Boundary-first mode begins at an execution boundary and reveals every
            bundled {pathNounPlural} that reaches it.
          </p>
        </div>
      </aside>
      <main className="sink-main">
        <header className="sink-heading">
          <div>
            <span className="context-kicker">{securityMode ? "SINK-FIRST INVESTIGATION" : "BOUNDARY CONVERGENCE"}</span>
            <h2>{sink.label || sink.id}</h2>
            <p>
              {nodeContext(sink) !== "Unscoped" ? `${nodeContext(sink)} · ` : ""}{nodeLocation(sink)}
            </p>
          </div>
          <div
            className="lens-switch"
            aria-label="Investigation representation"
          >
            {previousSink && (
              <button type="button" className="selection-back" onClick={returnToPreviousSink} title={`Return to ${previousSink.label || previousSink.id}`}>
                ← Back to previous boundary
              </button>
            )}
            {onShare && (
              <button type="button" className="share-control" onClick={shareSink} aria-live="polite">
                {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
              </button>
            )}
            <button type="button" onClick={copyPaths} disabled={!flows.length} aria-live="polite">
              {pathsCopyState === "copied" ? "Paths copied" : pathsCopyState === "failed" ? "Copy failed" : "Copy paths"}
            </button>
            <button type="button" onClick={() => onView("map", selected.id)}>
              Open in Explore
            </button>
            <button
              type="button"
              className={mode === "field" ? "active" : ""}
              aria-pressed={mode === "field"}
              onClick={() => setMode("field")}
            >
              <Icon name="target" size={13} />
              Convergence
            </button>
            <button
              type="button"
              className={mode === "matrix" ? "active" : ""}
              aria-pressed={mode === "matrix"}
              onClick={() => setMode("matrix")}
            >
              <Icon name="matrix" size={13} />
              {securityMode ? "Evidence matrix" : "Path matrix"}
            </button>
            {!inspectorOpen && (
              <button className="inspector-reopen" type="button" onClick={() => setInspectorOpen(true)} aria-expanded={inspectorOpen}>
                <Icon name="code" size={13} />
                Source
              </button>
            )}
          </div>
        </header>
        <div className="sink-facts">
          <div>
            <span>{securityMode ? "REACHING VALUES" : "REACHING PATHS"}</span>
            <b>{flows.length}</b>
          </div>
          <div>
            <span>UNIQUE NODES</span>
            <b>{flowNodes.size}</b>
          </div>
          <div>
            <span>ALIAS EDGES</span>
            <b className={aliases ? "violet" : ""}>{aliases}</b>
          </div>
          <div>
            <span>DYNAMIC EDGES</span>
            <b className={dynamic ? "amber" : ""}>{dynamic}</b>
          </div>
          <div>
            <span>OVERLAPPING REQUESTS</span>
            <b>{overlaps.length}</b>
          </div>
        </div>
        <label className="search convergence-search">
          <Icon name="search" size={14} />
          <input
            value={pathSearch}
            onChange={(event) => setPathSearch(event.target.value)}
            placeholder="Find a reaching path, symbol, file, or code…"
            aria-label="Filter paths reaching this boundary by path, symbol, file, or source code"
          />
          {pathSearch && <button type="button" onClick={() => setPathSearch("")} aria-label="Clear reaching path filter"><Icon name="close" size={14} /></button>}
        </label>
        {pathSearch && <p className="convergence-search-status" role="status">{countLabel(flows.length, pathNoun)} of {countLabel(allFlows.length, pathNoun)} match</p>}
        {(allFlows.some((flow) => flow.steps.some((step) => hasSource(nodeById.get(step.node_id)))) || allFlows.some((flow) => flow.steps.some((step) => !hasSource(nodeById.get(step.node_id))))) && (
          <div className="filter-hints convergence-filter-hints" role="group" aria-label="Quick reaching path filters">
            {allFlows.some((flow) => flow.steps.some((step) => hasSource(nodeById.get(step.node_id)))) && <button type="button" onClick={() => setPathSearch("has:source")}>Has source</button>}
            {allFlows.some((flow) => flow.steps.some((step) => !hasSource(nodeById.get(step.node_id)))) && <button type="button" onClick={() => setPathSearch("has:source-gap")}>Source gaps</button>}
            {pathSearch && <button type="button" className="query-clear" onClick={() => setPathSearch("")}>Clear</button>}
          </div>
        )}
        {!flows.length ? (
          <div className="convergence-empty" role="status">
            <span className="empty-target"><Icon name="target" size={18} /></span>
            <h3>{pathSearch ? "No reaching paths match this search" : "No bundled paths reach this boundary"}</h3>
            <p>{pathSearch ? "Try a different symbol, file, or path term." : `The node is present in the graph, but this bundle does not include a traceable ${pathNoun}. Inspect its surrounding relationships to understand where it sits.`}</p>
            {pathSearch ? <button type="button" onClick={() => setPathSearch("")}>Clear path filter</button> : <button type="button" onClick={() => onView("map", sink.id)}>Inspect in graph <Icon name="arrow" size={12} /></button>}
          </div>
        ) : mode === "field" ? (
          <ConvergenceCanvas
            flows={flows}
            nodes={app.nodes}
            sinkId={sink.id}
            selectedId={selectedId}
            securityMode={securityMode}
            onSelect={chooseNode}
          />
        ) : (
          <EvidenceMatrix
            app={app}
            flows={flows}
            sinkId={sink.id}
            securityMode={securityMode}
            onOpenFlow={(flowId, nodeId, position) => {
              onRecord(
                `Opened ${pathNoun}`,
                flowId,
                `from sink ${sink.label || sink.id}`,
              );
              onOpenFlow(flowId, nodeId, position);
            }}
          />
        )}
        <section className="overlap-strip">
          <div>
            <span className="panel-label">REQUEST OVERLAP</span>
            <p>
              Entrypoints sharing at least one node with these {pathNounPlural}. This
              is overlap evidence, not a reachability claim.
            </p>
          </div>
          {overlaps.length ? (
            <div className="overlap-list">
              {overlaps.map((entry) => {
                const sharedHop = entry.hops.find((hop) => flowNodes.has(hop.node_id));
                const entryIndex = app.entries.findIndex((item) => item.id === entry.id);
                const sharedCount = entry.hops.filter((hop) => flowNodes.has(hop.node_id)).length;
                const content = <><i />{entryDisplayName(entry, app.nodes, app.entries)}<small>{sharedCount} shared</small></>;
                return onEntry && entryIndex >= 0 ? (
                  <button type="button" className="overlap-item" key={entry.id} onClick={() => {
                    onRecord("Opened overlapping request flow", entry.id, `from ${sink.label || sink.id}`);
                    onEntry(entryIndex, sharedHop?.node_id ?? entry.hops[0]?.node_id ?? "");
                  }} aria-label={`Open ${entryDisplayName(entry, app.nodes, app.entries)}, ${sharedCount} shared steps`}>
                    {content}<Icon name="arrow" size={11} />
                  </button>
                ) : <span key={entry.id}>{content}</span>;
              })}
            </div>
          ) : (
            <span className="no-overlap">
              No overlapping request paths in this bundle.
            </span>
          )}
        </section>
      </main>
      {inspectorOpen && (
        <NodeInspector
          node={selected}
          contextRole={selectedRole}
          app={app}
          onNode={chooseNode}
          onFile={onFile}
          onFlow={onOpenFlow}
          onEntry={onEntry}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </section>
  );
}
