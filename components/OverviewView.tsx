"use client";

import { useEffect, useMemo, useState } from "react";
import type { App, Node } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { Icon } from "./Icon";
import { NodeInspector } from "./NodeInspector";

type Mode = "map" | "architecture" | "health";
type Props = {
  app: App;
  focusNodeId?: string;
  onFocusNode?: (nodeId: string) => void;
  onRecord: (action: string, target: string, detail: string) => void;
  onFlow?: (flowId: string, nodeId: string) => void;
  onEntry?: (entryIndex: number, nodeId: string) => void;
  onShare?: (nodeId: string) => Promise<boolean>;
};
const pos = (index: number) => ({
  x: 92 + (index % 4) * 178,
  y: 66 + Math.floor(index / 4) * 92,
});
const shorten = (value: string, limit = 20) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const nodeLocation = (node: Node) =>
  `${node.file || "Source unavailable"}:${node.line || "—"}`;
const nodeScopeKey = (node: Node) =>
  node.scope
    ? [node.scope.repository, node.scope.service, node.scope.package, node.scope.kind].filter(Boolean).join(" · ")
    : "unscoped";
const nodeScopeLabel = (node: Node) =>
  node.scope?.label || node.scope?.service || node.scope?.package || node.scope?.repository || "Unscoped nodes";
const crossesScope = (source: Node, target: Node) =>
  nodeScopeKey(source) !== nodeScopeKey(target) && Boolean(source.scope || target.scope);
const nodeScopeKind = (node: Node) =>
  node.scope?.kind?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "";

function matches(node: Node, query: string, app: App) {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => {
      const [key, ...rest] = term.split(":");
      const value = rest.join(":");
      if (rest.length) {
        if (key === "kind") return node.kind.toLowerCase().includes(value);
        if (key === "file") return node.file.toLowerCase().includes(value);
        if (key === "module")
          return node.module?.toLowerCase().includes(value) ?? false;
        if (key === "scope" || key === "service" || key === "repo" || key === "repository") {
          const scopeValues = [node.scope?.label, node.scope?.repository, node.scope?.service, node.scope?.package, node.scope?.kind];
          return scopeValues.some((item) => item?.toLowerCase().includes(value));
        }
        if (key === "symbol" || key === "name")
          return [node.label, node.qualifiedName, node.id].some((item) =>
            item?.toLowerCase().includes(value),
          );
        if (key === "has" && value === "mcp")
          return app.mcp.some(
            (item) => item.for === node.id || item.node_ids?.includes(node.id),
          );
        if (key === "edge")
          return app.edges.some(
            (edge) =>
              (edge.source === node.id || edge.target === node.id) &&
              (value === "alias"
                ? edge.alias
                : value === "dynamic"
                  ? edge.dynamic
                  : value === "uncertain"
                    ? Boolean(edge.confidence || edge.limitations?.length)
                  : false),
          );
        if (key === "confidence")
          return app.edges.some(
            (edge) =>
              (edge.source === node.id || edge.target === node.id) &&
              edge.confidence?.toLowerCase().includes(value),
          );
        if (key === "path")
          return app.flows.some(
            (flow) =>
              flow.kind?.toLowerCase().includes(value) &&
              flow.steps.some((step) => step.node_id === node.id),
          );
      }
      return [
        node.id,
        node.label,
        node.file,
        node.kind,
        node.qualifiedName,
        node.module,
        node.scope?.label,
        node.scope?.service,
        node.scope?.repository,
        node.scope?.package,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
}

export function OverviewView({
  app,
  focusNodeId,
  onFocusNode,
  onRecord,
  onFlow,
  onEntry,
  onShare,
}: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("map");
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [selectedId, setSelectedId] = useState(app.nodes[0]?.id ?? "");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [neighborhoodOnly, setNeighborhoodOnly] = useState(false);
  const [topologyZoom, setTopologyZoom] = useState(1);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId(app.nodes[0]?.id ?? "");
    setQuery("");
    setExpandedModule(null);
    setShareState("idle");
    setNeighborhoodOnly(false);
    setTopologyZoom(1);
  }, [app]);
  const contexts = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; repository?: string; service?: string; nodes: Node[]; inbound: number; outbound: number }>();
    const nodeContexts = new Map<string, string>();
    app.nodes.forEach((node) => {
      const key = nodeScopeKey(node);
      nodeContexts.set(node.id, key);
      const current = grouped.get(key);
      if (current) current.nodes.push(node);
      else grouped.set(key, { key, label: nodeScopeLabel(node), repository: node.scope?.repository, service: node.scope?.service, nodes: [node], inbound: 0, outbound: 0 });
    });
    app.edges.forEach((edge) => {
      const source = nodeContexts.get(edge.source);
      const target = nodeContexts.get(edge.target);
      if (!source || source === target) return;
      const sourceContext = grouped.get(source);
      const targetContext = target ? grouped.get(target) : undefined;
      if (sourceContext) sourceContext.outbound += 1;
      if (targetContext) targetContext.inbound += 1;
    });
    return [...grouped.values()].sort((a, b) => b.nodes.length - a.nodes.length);
  }, [app]);
  const boundaryTransitions = useMemo(() => {
    const nodes = new Map(app.nodes.map((node) => [node.id, node]));
    const grouped = new Map<string, { source: string; target: string; relation: string; count: number }>();
    app.edges.forEach((edge) => {
      const sourceNode = nodes.get(edge.source);
      const targetNode = nodes.get(edge.target);
      if (!sourceNode || !targetNode || !crossesScope(sourceNode, targetNode)) return;
      const source = nodeScopeLabel(sourceNode);
      const target = nodeScopeLabel(targetNode);
      const key = `${source}→${target}`;
      const current = grouped.get(key);
      if (current) current.count += 1;
      else grouped.set(key, { source, target, relation: edge.relation || "connected", count: 1 });
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)).slice(0, 8);
  }, [app]);
  useEffect(() => {
    if (focusNodeId && app.nodes.some((node) => node.id === focusNodeId)) {
      setSelectedId(focusNodeId);
      setInspectorOpen(true);
    }
  }, [app, focusNodeId]);
  const visible = useMemo(
    () => {
      const pathOrder = new Map<string, number>();
      let order = 0;
      const remember = (nodeId: string) => {
        if (!pathOrder.has(nodeId)) pathOrder.set(nodeId, order++);
      };
      app.entries.forEach((entry) => entry.hops.forEach((hop) => remember(hop.node_id)));
      app.flows.forEach((flow) => flow.steps.forEach((step) => remember(step.node_id)));
      return app.nodes
        .filter((node) => matches(node, query, app))
        .sort(
          (a, b) =>
            (pathOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (pathOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
            app.nodes.indexOf(a) - app.nodes.indexOf(b),
        );
    },
    [app, query],
  );
  const securityMode = app.findings.length > 0 || app.bundle.projection === "security projection";
  const primaryCodeKind = app.nodes.some((node) => node.kind === "function")
    ? "function"
    : app.nodes[0]?.kind || "node";
  const filterSuggestions = [
    ...[...new Set(app.flows.map((flow) => flow.kind).filter(Boolean))]
      .slice(0, 2)
      .map((kind) => ({ label: kind!, query: `path:${kind}` })),
    securityMode
      ? { label: "sinks", query: "kind:sink" }
      : { label: primaryCodeKind, query: `kind:${primaryCodeKind}` },
    app.edges.some((edge) => edge.dynamic)
      ? { label: "dynamic", query: "edge:dynamic" }
      : null,
    app.edges.some((edge) => edge.alias)
      ? { label: "aliases", query: "edge:alias" }
      : null,
    app.edges.some((edge) => edge.confidence || edge.limitations?.length)
      ? { label: "uncertain", query: "edge:uncertain" }
      : null,
    app.mcp.length ? { label: "linked", query: "has:mcp" } : null,
  ].filter(Boolean) as { label: string; query: string }[];
  useEffect(() => {
    if (
      inspectorOpen &&
      visible.length > 0 &&
      !visible.some((node) => node.id === selectedId)
    ) {
      const nextId = visible[0].id;
      setSelectedId(nextId);
      onFocusNode?.(nextId);
    }
  }, [inspectorOpen, onFocusNode, selectedId, visible]);
  const visibleIds = new Set(visible.map((node) => node.id));
  const edges = app.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  const selected = inspectorOpen && visible.length
    ? visible.find((node) => node.id === selectedId) ?? visible[0]
    : undefined;
  const focusActive = Boolean(inspectorOpen && selected);
  const connectedIds = new Set(
    selected
      ? [
          selected.id,
          ...app.edges
            .filter(
              (edge) =>
                edge.source === selected.id || edge.target === selected.id,
            )
            .flatMap((edge) => [edge.source, edge.target]),
        ]
      : [],
  );
  const topologyNodes = neighborhoodOnly && selected
    ? visible.filter((node) => connectedIds.has(node.id))
    : visible;
  const topologyIds = new Set(topologyNodes.map((node) => node.id));
  const topologyEdges = edges.filter((edge) => topologyIds.has(edge.source) && topologyIds.has(edge.target));
  const flowCount = (nodeId: string) =>
    app.flows.filter((flow) =>
      flow.steps.some((step) => step.node_id === nodeId),
    ).length;
  const entryCount = (nodeId: string) =>
    app.entries.filter((entry) =>
      entry.hops.some((hop) => hop.node_id === nodeId),
    ).length;
  const rolesForNode = (nodeId: string) =>
    [...new Set(app.flows.flatMap((flow) => flow.steps.filter((step) => step.node_id === nodeId).map((step) => step.role.trim().toLowerCase())))];
  const chokePoints = app.nodes
    .map((node) => ({
      node,
      flows: flowCount(node.id),
      entries: entryCount(node.id),
    }))
    .filter((item) => item.flows + item.entries > 0)
    .sort((a, b) => b.flows + b.entries - a.flows - a.entries)
    .slice(0, 6);
  const modules = useMemo(() => {
    if (app.modules.length) {
      return app.modules
        .map((module) => {
          const nodes = app.nodes.filter(
            (node) =>
              module.nodeIds?.includes(node.id) ||
              node.module === module.id ||
              node.module === module.name,
          );
          return { id: module.id, name: module.name, path: module.path, nodes };
        })
        .filter((module) => module.nodes.length > 0);
    }
    return [...new Set(app.nodes.map((node) => node.file || "Unknown file"))]
      .map((file) => ({
        id: file,
        name: file,
        path: file,
        nodes: app.nodes.filter(
          (node) => (node.file || "Unknown file") === file,
        ),
      }))
      .sort((a, b) => b.nodes.length - a.nodes.length);
  }, [app]);
  const health = [
    { label: "Graph nodes", value: app.nodes.length },
    { label: "Relationships", value: app.edges.length },
    { label: "Graph paths", value: app.flows.length },
    { label: "Request paths", value: app.entries.length },
    { label: "Linked records", value: app.mcp.length },
    {
      label: "Missing layouts",
      value: app.entries.filter((entry) => !entry.hasLayout).length,
    },
  ];
  function selectNode(id: string) {
    const node = app.nodes.find((item) => item.id === id);
    setSelectedId(id);
    setInspectorOpen(true);
    onFocusNode?.(id);
    if (node)
      onRecord(
        "Inspected graph node",
        node.label || node.id,
        `${node.file || "Source unavailable"}:${node.line || "—"}`,
      );
  }
  const summary = selected
    ? `${selected.label || selected.id} participates in ${flowCount(selected.id)} graph path${flowCount(selected.id) === 1 ? "" : "s"} and ${entryCount(selected.id)} request path${entryCount(selected.id) === 1 ? "" : "s"}. It has ${app.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).length} normalized relationship${app.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).length === 1 ? "" : "s"}.`
    : visible.length
      ? "Select a node to reveal its source, connected paths, and nearby relationships."
      : "";
  const visibleIndex = (node: Node) => visible.indexOf(node);
  const graphPos = (node: Node) => pos(Math.max(0, visibleIndex(node)));
  const graphHeight = Math.max(300, Math.ceil(visible.length / 4) * 92 + 110);
  const labelIndex = (node: Node) =>
    String(Math.max(0, visibleIndex(node)) + 1).padStart(2, "0");
  async function shareNode() {
    if (!selected || !onShare) return;
    const copied = await onShare(selected.id);
    setShareState(copied ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 1800);
  }

  return (
    <section
      className={`overview-workspace${inspectorOpen ? "" : " inspector-closed"}`}
    >
      <main className="overview-main">
        <header className="overview-heading">
          <div>
            <span className="context-kicker">SYSTEM MAP</span>
            <h2>See the graph’s shape before following a path.</h2>
            <p>
              Explore normalized relationships, shared choke points, module
              concentration, and bundle health from the graph data already
              present.
            </p>
          </div>
          <div className="overview-heading-actions">
            {selected && onShare && (
              <button
                type="button"
                className="share-control"
                onClick={shareNode}
                aria-label="Copy link to selected graph node"
                aria-live="polite"
              >
                {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
              </button>
            )}
            <div className="overview-switch">
              <button
                type="button"
                className={mode === "map" ? "active" : ""}
                aria-pressed={mode === "map"}
                onClick={() => setMode("map")}
              >
                <Icon name="target" size={13} />
                Topology
              </button>
              <button
                type="button"
                className={mode === "architecture" ? "active" : ""}
                aria-pressed={mode === "architecture"}
                onClick={() => setMode("architecture")}
              >
                <Icon name="matrix" size={13} />
                Architecture
              </button>
              <button
                type="button"
                className={mode === "health" ? "active" : ""}
                aria-pressed={mode === "health"}
                onClick={() => setMode("health")}
              >
                <Icon name="history" size={13} />
                Health
              </button>
            </div>
          </div>
        </header>
        <div className="query-composer">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter nodes: symbol:query service:api file:src/ edge:dynamic"
            aria-label="Filter graph nodes"
          />
          <div className="query-chips">
            {filterSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.query}
                onClick={() => {
                  setQuery(suggestion.query);
                  trackEvent("semantic_filter_applied", {
                    surface: "topology",
                    filter: suggestion.query.split(":", 1)[0] || "text",
                  });
                }}
              >
                {suggestion.label}
              </button>
            ))}
            {query && (
              <button
                type="button"
                className="query-clear"
                onClick={() => {
                  setQuery("");
                  trackEvent("semantic_filter_cleared", { surface: "topology" });
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {mode === "map" && (
          <>
            <div className="map-summary">
              <div>
                <span>{neighborhoodOnly ? "CANVAS NODES" : "VISIBLE NODES"}</span>
                <b>
                  {neighborhoodOnly ? topologyNodes.length : visible.length}
                  <small> / {visible.length}</small>
                </b>
              </div>
              <div>
                <span>{neighborhoodOnly ? "CANVAS EDGES" : "VISIBLE EDGES"}</span>
                <b>
                  {neighborhoodOnly ? topologyEdges.length : edges.length}
                  <small> / {edges.length}</small>
                </b>
              </div>
              <div>
                <span>SELECTED ROLE / KIND</span>
                <b>{visible.length ? rolesForNode(selected?.id ?? "").join(" / ") || selected?.kind || "—" : "—"}</b>
              </div>
              <p>
                {visible.length
                  ? `${summary}${neighborhoodOnly ? ` Canvas is focused to ${topologyNodes.length} directly connected nodes.` : ""}`
                  : `No nodes match “${query}”. Clear the filter to restore the full topology.`}
                {selected && visible.length > 1 && (
                  <button
                    type="button"
                    className="neighborhood-toggle"
                    aria-pressed={neighborhoodOnly}
                    onClick={() => setNeighborhoodOnly((value) => !value)}
                  >
                    {neighborhoodOnly ? "Show full filtered graph" : "Focus selected neighborhood"}
                  </button>
                )}
              </p>
            </div>
            {visible.length ? (
              <>
              <div className="topology-minimap">
                <div>
                  <span className="panel-label">TOPOLOGY OVERVIEW</span>
                  <small>Choose a point to focus its source context.</small>
                </div>
                <div className="topology-zoom" aria-label="Topology zoom controls">
                  <button type="button" onClick={() => setTopologyZoom((value) => Math.max(.7, Number((value - .1).toFixed(1))))} aria-label="Zoom topology out">−</button>
                  <output>{Math.round(topologyZoom * 100)}%</output>
                  <button type="button" onClick={() => setTopologyZoom((value) => Math.min(1.5, Number((value + .1).toFixed(1))))} aria-label="Zoom topology in">+</button>
                  <button type="button" onClick={() => setTopologyZoom(1)}>Reset</button>
                </div>
                <svg viewBox="0 0 180 80" aria-label="Topology minimap">
                  {topologyEdges.map((edge) => {
                    const source = visible.find((node) => node.id === edge.source);
                    const target = visible.find((node) => node.id === edge.target);
                    if (!source || !target) return null;
                    const a = graphPos(source);
                    const b = graphPos(target);
                    return <line className={crossesScope(source, target) ? "boundary" : ""} key={`mini-${edge.id}`} x1={8 + (a.x / 760) * 164} y1={8 + (a.y / graphHeight) * 64} x2={8 + (b.x / 760) * 164} y2={8 + (b.y / graphHeight) * 64} />;
                  })}
                  {topologyNodes.map((node) => {
                    const point = graphPos(node);
                    const select = () => selectNode(node.id);
                    return <circle key={`mini-${node.id}`} className={selected?.id === node.id ? "selected" : ""} cx={8 + (point.x / 760) * 164} cy={8 + (point.y / graphHeight) * 64} r={selected?.id === node.id ? 3 : 2} onClick={select} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }} role="button" tabIndex={0} aria-label={`Focus ${node.label || node.id} in topology`} />;
                  })}
                </svg>
              </div>
              <div className="topology-canvas">
                <svg
                  viewBox={`0 0 760 ${graphHeight}`}
                  style={{ height: `${graphHeight * topologyZoom}px`, width: `${Math.max(100, topologyZoom * 100)}%` }}
                  aria-label="Interactive graph topology"
                  focusable="false"
                >
                  <defs>
                    {(["exact", "alias", "dynamic"] as const).map((kind) => (
                      <marker
                        key={kind}
                        id={`topology-arrow-${kind}`}
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                        markerUnits="strokeWidth"
                      >
                        <path
                          d="M 0 0 L 10 5 L 0 10 z"
                          className={`topology-arrow topology-arrow-${kind}`}
                        />
                      </marker>
                    ))}
                  </defs>
                  {topologyEdges.map((edge) => {
                    const source = visible.find(
                        (node) => node.id === edge.source,
                      ),
                      target = visible.find((node) => node.id === edge.target);
                    if (!source || !target) return null;
                    const a = graphPos(source),
                      b = graphPos(target);
                    const kind = edge.dynamic
                      ? "dynamic"
                      : edge.alias
                        ? "alias"
                        : "exact";
                    const boundary = crossesScope(source, target);
                    const nearby = connectedIds.has(edge.source) || connectedIds.has(edge.target);
                    const touchesSelected = selected?.id === edge.source || selected?.id === edge.target;
                    return (
                      <g key={edge.id}>
                        <path
                          className={`topology-edge ${kind}${boundary ? " boundary" : ""}${focusActive && !nearby ? " dimmed" : ""}`}
                          markerEnd={`url(#topology-arrow-${kind})`}
                          d={`M${a.x} ${a.y} C${(a.x + b.x) / 2} ${a.y},${(a.x + b.x) / 2} ${b.y},${b.x} ${b.y}`}
                        />
                        {focusActive && touchesSelected && (
                          <text
                            className={`topology-edge-label ${kind}`}
                            x={(a.x + b.x) / 2}
                            y={(a.y + b.y) / 2 - 8}
                            textAnchor="middle"
                          >
                            {shorten(boundary ? "boundary · " + (edge.relation || "connected") : edge.relation || "connected", 18)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {topologyNodes.map((node) => {
                    const p = graphPos(node);
                    const select = () => selectNode(node.id);
                    const roles = rolesForNode(node.id);
                    const roleClasses = roles.map((role) => `role-${role.replace(/[^a-z0-9]+/g, "-")}`).join(" ");
                    return (
                      <g
                        key={node.id}
                        className={`topology-node kind-${node.kind} scope-${nodeScopeKind(node)} ${roleClasses}${selected?.id === node.id ? " selected" : ""}${focusActive && !connectedIds.has(node.id) ? " dimmed" : ""}`}
                        onClick={select}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            select();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected?.id === node.id}
                        aria-label={`${node.label || node.id}, ${node.kind}${roles.length ? `, ${roles.join(" / ")}` : ""}${node.scope?.kind ? `, ${node.scope.kind} boundary` : ""}, ${nodeLocation(node)}`}
                      >
                        <title>{node.label || node.id}</title>
                        <circle cx={p.x} cy={p.y} r="24" />
                        <text x={p.x} y={p.y + 4} textAnchor="middle">
                          {labelIndex(node)}
                        </text>
                        <text
                          className="topology-label"
                          x={p.x}
                          y={p.y + 39}
                          textAnchor="middle"
                        >
                          {shorten(roles.join("/") || node.kind, 14)}
                        </text>
                        <text
                          className="topology-name"
                          x={p.x}
                          y={p.y + 52}
                          textAnchor="middle"
                        >
                          {shorten(node.label || node.id, 18)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="topology-legend" aria-label="Topology relationship legend">
                  <span><i className="legend-exact" />exact relationship</span>
                  <span><i className="legend-alias" />alias relationship</span>
                  <span><i className="legend-dynamic" />dynamic relationship</span>
                  <span><i className="legend-boundary" />context boundary</span>
                  {visible.some((node) => node.scope?.kind === "external" || node.scope?.kind === "generated") && <span><i className="legend-scope" />external / generated node</span>}
                  <span className="topology-hint">Select a node to inspect its source · arrows show direction</span>
                </div>
                <div className="topology-node-list" aria-label="Graph nodes">
                  {visible.map((node) => {
                    const roles = rolesForNode(node.id);
                    return (
                    <button
                      type="button"
                      key={node.id}
                      className={selected?.id === node.id ? "selected" : ""}
                      onClick={() => selectNode(node.id)}
                      aria-pressed={selected?.id === node.id}
                    >
                      <span>{labelIndex(node)}</span>
                      <b>{node.label || node.id}</b>
                      <small>
                        {node.kind}{roles.length ? ` · ${roles.join("/")}` : ""}{node.scope?.kind ? ` · ${node.scope.kind}` : ""} · {node.scope?.label || node.scope?.service || node.scope?.repository || "Unscoped"} · {nodeLocation(node)}
                      </small>
                    </button>
                    );
                  })}
                </div>
              </div>
              </>
            ) : (
              <div className="topology-empty">
                <Icon name="search" size={18} />
                <h3>No nodes match this filter</h3>
                <p>Try another query or return to the complete graph.</p>
                <button type="button" onClick={() => setQuery("")}>
                  Clear filter
                </button>
              </div>
            )}
          </>
        )}
        {mode === "architecture" && (
          <div className="architecture-grid">
            <section>
              <span className="panel-label">BOUNDARY CONTEXT</span>
              <div className="context-inventory">
                {contexts.map((context) => (
                  <button
                    type="button"
                    className="context-row"
                    key={context.key}
                    aria-label={`${context.label}, ${context.nodes.length} symbols, ${context.outbound} outbound and ${context.inbound} inbound boundary transitions`}
                    onClick={() => {
                      const filterValue = context.service || context.repository;
                      setQuery(filterValue ? `${context.service ? "service" : "repo"}:${filterValue}` : "");
                      trackEvent(filterValue ? "semantic_filter_applied" : "semantic_filter_cleared", { surface: "architecture", filter: filterValue ? (context.service ? "service" : "repo") : "scope" });
                    }}
                  >
                    <span className="context-row-mark" />
                    <span>
                      <b>{context.label}</b>
                      <small>{context.repository || "No repository"}{context.service ? ` · ${context.service}` : ""} · {context.nodes.length} symbols · {context.outbound} out / {context.inbound} in</small>
                    </span>
                    <em title={`${context.outbound} outbound · ${context.inbound} inbound boundary transitions`}>{context.nodes.length}</em>
                  </button>
                ))}
              </div>
              <div className="detail-rule" />
              <span className="panel-label">MODULE CONCENTRATION</span>
              {modules.map((module) => (
                <div className="module-group" key={module.id}>
                  <button
                    type="button"
                    className="module-row"
                    aria-expanded={expandedModule === module.id}
                    onClick={() =>
                      setExpandedModule(
                        expandedModule === module.id ? null : module.id,
                      )
                    }
                  >
                    <div>
                      <b>{module.name}</b>
                      <small>
                        {module.path || "Module"} · {module.nodes.length}{" "}
                        symbols
                      </small>
                    </div>
                    <span>
                      <i
                        style={{
                          width: `${Math.max(8, (module.nodes.length / app.nodes.length) * 100)}%`,
                        }}
                      />
                    </span>
                    <em>{expandedModule === module.id ? "−" : "+"}</em>
                  </button>
                  {expandedModule === module.id && (
                    <div className="module-symbols">
                      {[
                        ...new Set(
                          module.nodes.map(
                            (node) => node.file || "Unknown file",
                          ),
                        ),
                      ].map((file) => (
                        <div className="module-file" key={file}>
                          <span>{file}</span>
                          {module.nodes
                            .filter(
                              (node) => (node.file || "Unknown file") === file,
                            )
                            .map((node) => (
                              <button
                                type="button"
                                key={node.id}
                                onClick={() => selectNode(node.id)}
                              >
                                <i className={`kind-dot kind-${node.kind}`} />
                                <b>{node.label || node.id}</b>
                                <small>
                                  {node.kind} · line {node.line || "—"}
                                </small>
                              </button>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
            <section className="choke-panel">
              <span className="panel-label">BOUNDARY TRANSITIONS</span>
              <p>Context-to-context relationships in the loaded graph.</p>
              {boundaryTransitions.length ? boundaryTransitions.map((transition) => (
                <div className="boundary-transition" key={`${transition.source}-${transition.target}`}>
                  <b>{transition.source} <i>→</i> {transition.target}</b>
                  <small>{transition.count} relationship{transition.count === 1 ? "" : "s"} · {transition.relation}</small>
                </div>
              )) : <p className="diff-empty">No explicit context transitions are available.</p>}
              <div className="detail-rule" />
              <span className="panel-label">SHARED CHOKE POINTS</span>
              <p>
                Nodes repeated across flows and requests. This is concentration
                context, not a ranking.
              </p>
              {chokePoints.map((item) => (
                <button
                  type="button"
                  key={item.node.id}
                  onClick={() => selectNode(item.node.id)}
                >
                  <span className={`kind-dot kind-${item.node.kind}`} />
                  <b>{item.node.label || item.node.id}</b>
                  <small>
                    {item.flows} flows · {item.entries} requests
                  </small>
                </button>
              ))}
            </section>
          </div>
        )}
        {mode === "health" && (
          <div className="health-grid">
            <section className="health-metrics">
              {health.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                </div>
              ))}
            </section>
            <section className="health-notes">
              <span className="panel-label">BUNDLE DIAGNOSTICS</span>
              {app.edges.length
                ? "Relationships are available for topology and convergence analysis."
                : "No explicit or path-derived relationships were found."}
              {app.coverage.capabilities.length > 0 && (
                <div className="health-detail">
                  <span>CAPABILITIES</span>
                  <p>{app.coverage.capabilities.join(" · ")}</p>
                </div>
              )}
              {app.coverage.limitations.length > 0 && (
                <div className="health-detail health-limitations">
                  <span>KNOWN LIMITATIONS</span>
                  {app.coverage.limitations.map((limitation) => (
                    <p key={limitation}><i />{limitation}</p>
                  ))}
                </div>
              )}
              {app.entries.some((entry) => !entry.hasLayout) && (
                <p>
                  <i />
                  Some request paths use derived layout coordinates.
                </p>
              )}
              {app.nodes.some((node) => !node.file) && (
                <p>
                  <i />
                  Some nodes do not include a source file location.
                </p>
              )}
              {!app.mcp.length && (
                <p>
                  <i />
                  No linked evidence records are bundled; summaries remain derived.
                </p>
              )}
            </section>
          </div>
        )}
      </main>
      {inspectorOpen && selected && (
        <NodeInspector
          node={selected}
          app={app}
          onFlow={onFlow}
          onEntry={onEntry}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </section>
  );
}
