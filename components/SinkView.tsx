"use client";
import { useEffect, useMemo, useState } from "react";
import type { App } from "../lib/lachesis";
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

type Props = {
  app: App;
  sinkId: string;
  setSinkId: (id: string) => void;
  onOpenFlow: (flowId: string, nodeId: string, position?: number) => void;
  onEntry?: (entryIndex: number, nodeId: string) => void;
  onRecord: (action: string, target: string, detail: string) => void;
  onView: (view: "trace" | "map", nodeId?: string) => void;
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
  const sink = sinks.find((node) => node.id === sinkId) ?? sinks[0];
  const securityMode = app.findings.length > 0 || app.bundle.projection === "security projection";
  const [mode, setMode] = useState<"field" | "matrix">("field");
  const [selectedId, setSelectedId] = useState(
    sink?.id ?? app.nodes[0]?.id ?? "",
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [pathsCopyState, setPathsCopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (sink?.id) setSelectedId(sink.id);
  }, [sink?.id]);
  if (!sink)
    return (
      <section className="workspace-empty">
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
      </section>
    );
  const flows = app.flows.filter((flow) =>
    flow.steps.some((step) => step.node_id === sink.id),
  );
  const flowNodes = new Set(
    flows.flatMap((flow) => flow.steps.map((step) => step.node_id)),
  );
  const overlaps = app.entries.filter((entry) =>
    entry.hops.some((hop) => flowNodes.has(hop.node_id)),
  );
  const selected = app.nodes.find((node) => node.id === selectedId) ?? sink;
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
  function chooseSink(id: string) {
    const next = sinks.find((node) => node.id === id);
    setSinkId(id);
    setSelectedId(id);
    setInspectorOpen(true);
    if (next) {
      onRecord(
        "Focused sink",
        next.label || next.id,
        `${app.flows.filter((flow) => flow.steps.some((step) => step.node_id === id)).length} ${pathNounPlural}`,
      );
      trackEvent("sink_selected");
    }
  }
  function chooseNode(id: string) {
    const node = app.nodes.find((item) => item.id === id);
    setSelectedId(id);
    setInspectorOpen(true);
    if (node)
      onRecord(
        "Inspected node",
        node.label || node.id,
        nodeLocation(node),
      );
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
            const node = app.nodes.find((item) => item.id === step.node_id);
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
        <div className="sink-list">
          {sinks.map((item) => {
            const count = app.flows.filter((flow) =>
              flow.steps.some((step) => step.node_id === item.id),
            ).length;
            return (
              <button
                key={item.id}
                className={item.id === sink.id ? "selected" : ""}
                aria-pressed={item.id === sink.id}
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
            {onShare && (
              <button type="button" className="share-control" onClick={shareSink} aria-live="polite">
                {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
              </button>
            )}
            <button type="button" onClick={copyPaths} disabled={!flows.length} aria-live="polite">
              {pathsCopyState === "copied" ? "Paths copied" : pathsCopyState === "failed" ? "Copy failed" : "Copy paths"}
            </button>
            <button type="button" onClick={() => onView("map", selected.id)}>
              See in graph
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
              <button type="button" onClick={() => setInspectorOpen(true)}>
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
        {mode === "field" ? (
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
              {overlaps.map((entry) => (
                <span key={entry.id}>
                  <i />
                  {entry.label}
                  <small>
                    {
                      entry.hops.filter((hop) => flowNodes.has(hop.node_id))
                        .length
                    }{" "}
                    shared
                  </small>
                </span>
              ))}
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
          onFlow={onOpenFlow}
          onEntry={onEntry}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </section>
  );
}
