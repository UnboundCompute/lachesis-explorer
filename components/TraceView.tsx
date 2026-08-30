"use client";
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
  inspectorOpen: boolean;
  onInspectorOpen: () => void;
  onInspectorClose: () => void;
  onRecord: (action: string, target: string, detail: string) => void;
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
              : false,
        );
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
  inspectorOpen,
  onInspectorOpen,
  onInspectorClose,
  onRecord,
}: Props) {
  const flow = app.flows.find((item) => item.id === flowId) ?? app.flows[0];
  if (!flow)
    return (
      <section className="workspace-empty">
        <span className="empty-target">
          <Icon name="code" size={22} />
        </span>
        <h2>No paths in this bundle</h2>
        <p>
          This bundle contains graph structure, but no value-flow paths were
          included for tracing.
        </p>
      </section>
    );
  const selected = app.nodes.find((node) => node.id === stepId) ?? app.nodes[0];
  const visible = app.flows.filter((item) => matchesFlow(app, item, query));
  const steps =
    direction === "backward" ? flow.steps : [...flow.steps].reverse();
  const evidence = app.mcp.find((item) => item.for === flow.id);
  const firstNode = app.nodes.find(
    (node) => node.id === flow.steps[0]?.node_id,
  );
  const lastNode = app.nodes.find(
    (node) => node.id === flow.steps.at(-1)?.node_id,
  );
  const indirectSteps = flow.steps.filter(
    (step) => step.edge?.alias || step.edge?.dynamic,
  ).length;
  const items: PathItem[] = steps.map((step) => ({
    id: step.node_id,
    node: app.nodes.find((node) => node.id === step.node_id) ?? app.nodes[0],
    label: step.role,
    caption: step.note,
    edge: step.edge,
  }));
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
          <button onClick={() => setQuery("kind:sink")}>sink</button>
          <button onClick={() => setQuery("has:mcp")}>MCP</button>
        </div>
        <div className="node-list">
          {visible.length ? (
            visible.map((item) => (
              <button
                key={item.id}
                className={
                  flow.id === item.id ? "node-row selected" : "node-row"
                }
                onClick={() => {
                  setFlowId(item.id);
                  setStepId(item.steps[0]?.node_id ?? "");
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
                      : "Value path"} {" · "}
                    {item.steps.length} nodes · {indirectionCount(item)} indirect
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
          </div>
          <div className="toolbar-actions">
            {!inspectorOpen && (
              <button className="inspector-reopen" onClick={onInspectorOpen}>
                Show source
              </button>
            )}
            <div className="segmented" aria-label="Trace direction">
              <button
                className={direction === "backward" ? "selected" : ""}
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
                className={direction === "forward" ? "selected" : ""}
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
            <span>HOPS</span>
            <b>{flow.steps.length}</b>
          </div>
          <div className="trace-orientation-fact">
            <span>INDIRECT</span>
            <b>{indirectSteps}</b>
          </div>
        </div>
        <PathCanvas
          items={items}
          selectedId={stepId}
          onSelect={(id) => {
            const node = app.nodes.find((item) => item.id === id);
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
        <NodeInspector node={selected} app={app} onClose={onInspectorClose} />
      )}
    </section>
  );
}
