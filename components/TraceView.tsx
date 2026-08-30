"use client";
import { useEffect, useRef, useState } from "react";
import type { App, Flow } from "../lib/lachesis";
import { indirectionCount } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { Icon } from "./Icon";
import { PathCanvas, type PathItem } from "./PathCanvas";
import { NodeInspector } from "./NodeInspector";
import { EvidencePanel } from "./EvidencePanel";
type Props = {
  app: App;
  flowId: string;
  setFlowId: (v: string) => void;
  stepId: string;
  setStepId: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  direction: "backward" | "forward";
  setDirection: (v: "backward" | "forward") => void;
  position?: number;
  onPositionChange?: (position: number) => void;
  inspectorOpen: boolean;
  onInspectorOpen: () => void;
  onInspectorClose: () => void;
  onRecord: (action: string, target: string, detail: string) => void;
  onView: (view: "journey" | "map") => void;
  onShare: (position: number) => Promise<boolean>;
  onFlow: (flowId: string, nodeId: string) => void;
  onEntry: (entryIndex: number, nodeId: string) => void;
};
function matchesFlow(app: App, flow: Flow, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  return terms.every((term) => {
    const [key, ...rest] = term.split(":");
    const value = rest.join(":");
    if (rest.length) {
      if (key === "edge")
        return flow.steps.some((step) =>
          value === "alias"
            ? step.edge?.alias
            : value === "dynamic"
              ? step.edge?.dynamic
              : value === "uncertain"
                ? Boolean(step.edge?.confidence || step.edge?.limitations?.length)
              : false,
        );
      if (key === "confidence")
        return flow.steps.some((step) => step.edge?.confidence?.toLowerCase().includes(value));
      if (key === "kind")
        return nodes.some((node) => node?.kind.toLowerCase().includes(value));
      if (key === "file")
        return nodes.some((node) => node?.file.toLowerCase().includes(value));
      if (key === "has" && value === "mcp")
        return app.mcp.some((item) => item.for === flow.id);
      if (key === "role")
        return flow.steps.some((step) =>
          step.role.toLowerCase().includes(value),
        );
    }
    const haystack = [
      flow.name,
      ...flow.steps.map((step) => step.role),
      ...nodes.flatMap((node) =>
        node ? [node.label, node.file, node.kind] : [],
      ),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function flowLocation(app: App, flow: Flow) {
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  const location = (node: (typeof app.nodes)[number]) =>
    `${node.file || "source unavailable"}:${node.line || "—"}`;
  if (!nodes.length) return "Source location unavailable";
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  return first.id === last.id
    ? location(first)
    : `${location(first)} → ${location(last)}`;
}

export function TraceView({
  app,
  flowId,
  setFlowId,
  stepId,
  setStepId,
  query,
  setQuery,
  direction,
  setDirection,
  position,
  onPositionChange,
  inspectorOpen,
  onInspectorOpen,
  onInspectorClose,
  onRecord,
  onView,
  onShare,
  onFlow,
  onEntry,
}: Props) {
  const flow = app.flows.find((item) => item.id === flowId) ?? app.flows[0];
  const [selectedPosition, setSelectedPosition] = useState(position ?? 0);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const selectedFlowRef = useRef<HTMLButtonElement>(null);
  const previousDirection = useRef(direction);
  useEffect(() => {
    if (!flow) return;
    const ordered = direction === "backward" ? flow.steps : [...flow.steps].reverse();
    if (previousDirection.current !== direction) {
      const next = Math.max(0, ordered.length - 1 - selectedPosition);
      previousDirection.current = direction;
      setSelectedPosition(next);
      onPositionChange?.(next);
      return;
    }
    const fallback = ordered.findIndex((step) => step.node_id === stepId);
    const next = position != null && ordered[position]?.node_id === stepId
      ? position
      : fallback;
    setSelectedPosition(next >= 0 ? next : 0);
  }, [app, flowId, direction, position, selectedPosition, stepId]);
  useEffect(() => {
    selectedFlowRef.current?.scrollIntoView({ block: "nearest" });
  }, [flowId, query]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        moveStep(event.key === "]" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flow, direction, stepId, selectedPosition]);
  if (!flow)
    return (
      <section className="workspace-empty">
        <span className="empty-target">
          <Icon name="code" size={22} />
        </span>
        <h2>No paths in this bundle</h2>
        <p>
          This bundle contains graph structure, but no graph paths were
          included for tracing.{" "}
          {app.entries.length
            ? "Follow a request path instead."
            : "Open the system map to inspect its structure."}
        </p>
        <button
          className="context-upload"
          type="button"
          onClick={() => onView(app.entries.length ? "journey" : "map")}
        >
          <span>
            {app.entries.length ? "Open request paths" : "Open system map"}
          </span>
          <span className="button-icon">
            <Icon name="arrow" size={14} />
          </span>
        </button>
      </section>
    );
  const selected = app.nodes.find((node) => node.id === stepId) ?? app.nodes[0];
  const visible = app.flows.filter((item) => matchesFlow(app, item, query));
  const steps =
    direction === "backward" ? flow.steps : [...flow.steps].reverse();
  const evidence = app.mcp.find((item) => item.for === flow.id);
  const firstNode = app.nodes.find((node) => node.id === (flow.sourceNodeId ?? flow.steps[0]?.node_id));
  const lastNode = app.nodes.find((node) => node.id === (flow.sinkNodeId ?? flow.steps.at(-1)?.node_id));
  const indirectSteps = flow.steps.filter(
    (step) => step.edge?.alias || step.edge?.dynamic,
  ).length;
  const items: PathItem[] = steps.map((step) => ({
    id: step.node_id,
    occurrenceId: step.id,
    node: app.nodes.find((node) => node.id === step.node_id) ?? app.nodes[0],
    label: step.role,
    caption: step.note,
    edge: step.edge,
  }));
  const selectedIndex = Math.max(
    0,
    items[selectedPosition]?.id === stepId
      ? selectedPosition
      : items.findIndex((item) => item.id === stepId),
  );
  function moveStep(delta: number) {
    const next = items[selectedIndex + delta];
    if (!next) return;
    setSelectedPosition(selectedIndex + delta);
    onPositionChange?.(selectedIndex + delta);
    setStepId(next.id);
    onInspectorOpen();
    onRecord(
      "Inspected path step",
      next.node.label || next.node.id,
      `${next.node.file}:${next.node.line}`,
    );
    trackEvent("trace_step_navigated", { direction: delta > 0 ? "next" : "previous" });
  }
  async function sharePath() {
    const copied = await onShare(selectedIndex);
    setShareState(copied ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 1800);
  }
  return (
    <section className={`workspace${inspectorOpen ? "" : " inspector-closed"}`}>
      <aside className="sidebar">
        <span className="panel-label">GRAPH PATHS & SYMBOLS</span>
        <label className="search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or filter…"
            aria-label="Filter graph paths"
          />
        </label>
        <div className="filter-hints" aria-label="Suggested semantic filters">
          <button onClick={() => setQuery("edge:dynamic")}>dynamic</button>
          <button onClick={() => setQuery("edge:alias")}>alias</button>
          <button onClick={() => setQuery("edge:uncertain")}>uncertain</button>
          <button onClick={() => setQuery("kind:sink")}>sink</button>
          <button onClick={() => setQuery("has:mcp")}>MCP</button>
          {query && (
            <button
              type="button"
              className="query-clear"
              onClick={() => setQuery("")}
            >
              Clear
            </button>
          )}
        </div>
        <div className="node-list">
          {visible.length ? (
            visible.map((item) => (
              <button
                key={item.id}
                ref={item.id === flow.id ? selectedFlowRef : undefined}
                className={
                  flow.id === item.id ? "node-row selected" : "node-row"
                }
                onClick={() => {
                  const orderedSteps = direction === "forward" ? [...item.steps].reverse() : item.steps;
                  setFlowId(item.id);
                  setStepId(orderedSteps[0]?.node_id ?? "");
                  onPositionChange?.(0);
                  onInspectorOpen();
                  onRecord(
                    "Opened graph path",
                    item.name,
                    `${item.steps.length} nodes`,
                  );
                  trackEvent("flow_selected");
                }}
              >
                <span className="kind-dot" />
                <span>
                  <b>{item.name}</b>
                  <small>
                    {app.findings.some((finding) => finding.id === item.id)
                      ? "Security witness"
                      : app.mcp.some((evidence) => evidence.for === item.id)
                        ? "MCP-backed value path"
                      : "Value path"} {" · "}
                    {item.steps.length} nodes · {indirectionCount(item)} indirect
                  </small>
                  <small className="node-row-context">
                    {app.mcp.find((evidence) => evidence.for === item.id)?.result_summary ?? flowLocation(app, item)}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="list-empty">
              No graph paths match this semantic filter.
            </p>
          )}
        </div>
        <div className="sidebar-foot">
          <span className="tiny-dot" /> {visible.length} of {app.flows.length}{" "}
          graph paths visible
        </div>
      </aside>
      <main className="main-panel">
        <div className="toolbar">
          <div>
            <span className="panel-label">SELECTED GRAPH PATH</span>
            <h2>
              <code>{flow.name}</code>
            </h2>
            {flow.description && <p className="path-description">{flow.description}</p>}
            {(flow.confidence || flow.limitations?.length) && (
              <p className="path-meta">
                {flow.confidence && <span>{flow.confidence} confidence</span>}
                {flow.limitations?.length ? <span>{flow.limitations.length} known limitation{flow.limitations.length === 1 ? "" : "s"}</span> : null}
              </p>
            )}
          </div>
          <div className="toolbar-actions">
            {!inspectorOpen && (
              <button className="inspector-reopen" onClick={onInspectorOpen}>
                Show source
              </button>
            )}
            <button className="inspector-reopen" type="button" onClick={sharePath} aria-live="polite">
              {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
            </button>
            <div className="step-nav" aria-label="Path step navigation">
              <button
                className="inspector-reopen"
                type="button"
                disabled={selectedIndex === 0}
                aria-keyshortcuts="["
                onClick={() => moveStep(-1)}
              >
                Previous
              </button>
              <button
                className="inspector-reopen"
                type="button"
                disabled={selectedIndex >= items.length - 1}
                aria-keyshortcuts="]"
                onClick={() => moveStep(1)}
              >
                Next
              </button>
              <span className="step-nav-hint" aria-label="Use left bracket and right bracket to navigate steps">
                <kbd>[</kbd><kbd>]</kbd>
              </span>
            </div>
            <div className="segmented" aria-label="Trace direction">
              <button
                type="button"
                className={direction === "backward" ? "selected" : ""}
                aria-pressed={direction === "backward"}
                onClick={() => {
                  setDirection("backward");
                  onRecord("Changed direction", flow.name, "comes from");
                  trackEvent("trace_direction_changed", {
                    direction: "backward",
                  });
                }}
              >
                comes from
              </button>
              <button
                type="button"
                className={direction === "forward" ? "selected" : ""}
                aria-pressed={direction === "forward"}
                onClick={() => {
                  setDirection("forward");
                  onRecord("Changed direction", flow.name, "goes to");
                  trackEvent("trace_direction_changed", {
                    direction: "forward",
                  });
                }}
              >
                goes to
              </button>
            </div>
          </div>
        </div>
        <div className="trace-orientation" aria-label="Selected path summary">
          <div>
            <span>START</span>
            <b>{firstNode?.label || "Unknown symbol"}</b>
            <small>
              {firstNode?.file}:{firstNode?.line}
            </small>
          </div>
          <i aria-hidden="true">
            <span />
          </i>
          <div>
            <span>END</span>
            <b>{lastNode?.label || "Unknown symbol"}</b>
            <small>
              {lastNode?.file}:{lastNode?.line}
            </small>
          </div>
          <div className="trace-orientation-fact">
            <span>STEP / HOPS</span>
            <b>
              {selectedIndex + 1} / {items.length}
            </b>
          </div>
          <div className="trace-orientation-fact">
            <span>INDIRECT</span>
            <b>{indirectSteps}</b>
          </div>
        </div>
        <PathCanvas
          items={items}
          title={app.findings.some((finding) => finding.id === flow.id) ? "Witness path" : "Code path"}
          selectedId={stepId}
          selectedIndex={selectedIndex}
          onSelect={(id, index) => {
            const node = app.nodes.find((item) => item.id === id);
            setSelectedPosition(index);
            onPositionChange?.(index);
            setStepId(id);
            onInspectorOpen();
            if (node)
              onRecord(
                "Inspected node",
                node.label || node.id,
                `${node.file}:${node.line}`,
              );
            trackEvent("trace_node_selected");
          }}
          layoutSource="derived"
        />
        <EvidencePanel
          evidence={evidence}
          fallbackTool="reaches"
          fallbackArgs={flow.name}
          fallbackSummary={`${steps.length} visible nodes in this graph path.`}
          nodeCount={steps.length}
          indirections={indirectionCount(flow, evidence)}
        />
      </main>
      {inspectorOpen && (
        <NodeInspector
          node={selected}
          contextRole={items[selectedIndex]?.label}
          app={app}
          onFlow={onFlow}
          onEntry={onEntry}
          onClose={onInspectorClose}
        />
      )}
    </section>
  );
}
