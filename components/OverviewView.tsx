"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { App, Node } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { copyText, downloadText } from "../lib/clipboard";
import { explainNode } from "../lib/explanations";
import { Icon } from "./Icon";
import { NodeInspector } from "./NodeInspector";

export type OverviewMode = "map" | "architecture" | "health";
export type OverviewNodeOrder = "path" | "centrality";
type Props = {
  app: App;
  mode?: OverviewMode;
  setMode?: (mode: OverviewMode) => void;
  nodeOrder?: OverviewNodeOrder;
  setNodeOrder?: (order: OverviewNodeOrder) => void;
  neighborhoodOnly?: boolean;
  setNeighborhoodOnly?: (focused: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
  focusNodeId?: string;
  onFocusNode?: (nodeId: string) => void;
  onFile?: (file: string) => void;
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
    ? [node.scope.repository, node.scope.service, node.scope.package, node.scope.module, node.scope.kind].filter(Boolean).join(" · ")
    : "unscoped";
const nodeScopeLabel = (node: Node) =>
  node.scope?.label || node.scope?.service || node.scope?.package || node.scope?.module || node.scope?.repository || "Unscoped nodes";
const crossesScope = (source: Node, target: Node) =>
  nodeScopeKey(source) !== nodeScopeKey(target) && Boolean(source.scope || target.scope);
const nodeScopeKind = (node: Node) =>
  node.scope?.kind?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "";
const hasSource = (node: Node) => Boolean(node.snippet.trim() || node.sourceWindow?.lines.length);

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
          return [node.module, node.scope?.module].some((item) => item?.toLowerCase().includes(value));
        if (key === "scope" || key === "service" || key === "repo" || key === "repository") {
          const scopeValues = [node.scope?.label, node.scope?.repository, node.scope?.service, node.scope?.package, node.scope?.module, node.scope?.kind];
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
        if (key === "has" && (value === "source" || value === "source-preview")) return hasSource(node);
        if (key === "has" && (value === "source-gap" || value === "missing-source")) return !hasSource(node);
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
                    : value === "explicit"
                      ? edge.origins.includes("bundle")
                      : value === "derived"
                        ? edge.origins.some((origin) => origin !== "bundle")
                  : false),
          );
        if (key === "origin")
          return app.edges.some(
            (edge) =>
              (edge.source === node.id || edge.target === node.id) &&
              edge.origins.some((origin) => origin.includes(value)),
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
        if (key === "calls" || key === "reaches") {
          const targetIds = new Set(
            app.nodes
              .filter((candidate) =>
                [candidate.id, candidate.label, candidate.qualifiedName]
                  .filter(Boolean)
                  .some((item) => item!.toLowerCase().includes(value)),
              )
              .map((candidate) => candidate.id),
          );
          return app.edges.some((edge) =>
            key === "calls"
              ? edge.source === node.id && targetIds.has(edge.target)
              : edge.target === node.id && targetIds.has(edge.source),
          );
        }
      }
      return [
        node.id,
        node.label,
        node.file,
        node.kind,
        node.qualifiedName,
        node.module,
        node.scope?.module,
        node.scope?.label,
        node.scope?.service,
        node.scope?.repository,
        node.scope?.package,
        node.signature,
        node.documentation,
        node.snippet,
        node.sourceWindow?.lines.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
}

function nodeMatchLabel(node: Node, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return "";
  const fields = [
    { label: "source", values: [node.snippet, node.sourceWindow?.lines.join(" ")] },
    { label: "documentation", values: [node.documentation] },
    { label: "signature", values: [node.signature] },
    { label: "symbol", values: [node.label, node.qualifiedName, node.id] },
    { label: "file", values: [node.file, node.module, node.scope?.module] },
  ];
  const match = fields.find(({ values }) =>
    terms.some((term) => values.some((value) => value?.toLowerCase().includes(term))),
  );
  return match ? `Found in ${match.label}` : "";
}

export function OverviewView({
  app,
  mode: controlledMode,
  setMode: setControlledMode,
  nodeOrder: controlledNodeOrder,
  setNodeOrder: setControlledNodeOrder,
  neighborhoodOnly: controlledNeighborhoodOnly,
  setNeighborhoodOnly: setControlledNeighborhoodOnly,
  query,
  setQuery,
  focusNodeId,
  onFocusNode,
  onFile,
  onRecord,
  onFlow,
  onEntry,
  onShare,
}: Props) {
  const [localMode, setLocalMode] = useState<OverviewMode>("map");
  const mode = controlledMode ?? localMode;
  const setMode = setControlledMode ?? setLocalMode;
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [linkState, setLinkState] = useState<"idle" | "copied" | "failed">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloaded" | "failed">("idle");
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState(app.nodes[0]?.id ?? "");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [localNeighborhoodOnly, setLocalNeighborhoodOnly] = useState(false);
  const [topologyZoom, setTopologyZoom] = useState(1);
  const [showAllTopology, setShowAllTopology] = useState(false);
  const [selectionHistory, setSelectionHistory] = useState<string[]>([]);
  const [localNodeOrder, setLocalNodeOrder] = useState<OverviewNodeOrder>("path");
  const hasMountedOverview = useRef(false);
  const nodeOrder = controlledNodeOrder ?? localNodeOrder;
  const setNodeOrder = setControlledNodeOrder ?? setLocalNodeOrder;
  const neighborhoodOnly = controlledNeighborhoodOnly ?? localNeighborhoodOnly;
  const setNeighborhoodOnly = setControlledNeighborhoodOnly ?? setLocalNeighborhoodOnly;
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId(app.nodes[0]?.id ?? "");
    if (hasMountedOverview.current) setQuery("");
    hasMountedOverview.current = true;
    setExpandedModule(null);
    setShareState("idle");
    setLinkState("idle");
    setDownloadState("idle");
    setSearchText("");
    if (!setControlledNeighborhoodOnly) setLocalNeighborhoodOnly(false);
    setTopologyZoom(1);
    setShowAllTopology(false);
    setSelectionHistory([]);
    if (!setControlledNodeOrder) setLocalNodeOrder("path");
  }, [app]);
  useEffect(() => {
    setSearchText(query);
  }, [query]);
  const contexts = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; repository?: string; service?: string; module?: string; nodes: Node[]; inbound: number; outbound: number }>();
    const nodeContexts = new Map<string, string>();
    app.nodes.forEach((node) => {
      const key = nodeScopeKey(node);
      nodeContexts.set(node.id, key);
      const current = grouped.get(key);
      if (current) current.nodes.push(node);
      else grouped.set(key, { key, label: nodeScopeLabel(node), repository: node.scope?.repository, service: node.scope?.service, module: node.scope?.module, nodes: [node], inbound: 0, outbound: 0 });
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
    const grouped = new Map<string, { source: string; target: string; relation: string; count: number; query: string }>();
    app.edges.forEach((edge) => {
      const sourceNode = nodes.get(edge.source);
      const targetNode = nodes.get(edge.target);
      if (!sourceNode || !targetNode || !crossesScope(sourceNode, targetNode)) return;
      const source = nodeScopeLabel(sourceNode);
      const target = nodeScopeLabel(targetNode);
      const key = `${source}→${target}`;
      const query = sourceNode.scope?.service
        ? `service:${sourceNode.scope.service}`
        : sourceNode.scope?.repository
          ? `repo:${sourceNode.scope.repository}`
          : sourceNode.scope?.module
            ? `module:${sourceNode.scope.module}`
            : "";
      const current = grouped.get(key);
      if (current) current.count += 1;
      else grouped.set(key, { source, target, relation: edge.relation || "connected", count: 1, query });
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
      .map((kind) => ({ label: kind!.replace(/[-_]+/g, " "), query: `path:${kind}` })),
    securityMode
      ? { label: "Destinations", query: "kind:sink" }
      : { label: primaryCodeKind, query: `kind:${primaryCodeKind}` },
    app.edges.some((edge) => edge.dynamic)
      ? { label: "Runtime-dependent", query: "edge:dynamic" }
      : null,
    app.edges.some((edge) => edge.alias)
      ? { label: "Alternate names", query: "edge:alias" }
      : null,
    app.edges.some((edge) => edge.confidence || edge.limitations?.length)
      ? { label: "Needs review", query: "edge:uncertain" }
      : null,
    app.edges.some((edge) => edge.origins.includes("bundle"))
      ? { label: "Recorded links", query: "edge:explicit" }
      : null,
    app.edges.some((edge) => edge.origins.some((origin) => origin !== "bundle"))
      ? { label: "Inferred links", query: "edge:derived" }
      : null,
    app.edges.some((edge) => edge.origins.includes("value-flow"))
      ? { label: "Value paths", query: "origin:value-flow" }
      : null,
    app.edges.some((edge) => edge.origins.includes("request-path"))
      ? { label: "Request flows", query: "origin:request-path" }
      : null,
    app.mcp.length ? { label: "Bundle-linked", query: "has:mcp" } : null,
    app.nodes.some(hasSource) ? { label: "Has source", query: "has:source" } : null,
    app.nodes.some((node) => !hasSource(node)) ? { label: "Source gaps", query: "has:source-gap" } : null,
    ...[...new Set(app.nodes.map((node) => node.module || node.scope?.module).filter(Boolean))]
      .slice(0, 2)
      .map((module) => ({ label: `Module · ${module}`, query: `module:${module}` })),
    ...[...new Set(app.nodes.map((node) => node.scope?.service).filter(Boolean))]
      .slice(0, 2)
      .map((service) => ({ label: `Service · ${service}`, query: `service:${service}` })),
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
  const visibleById = useMemo(() => new Map(visible.map((node) => [node.id, node])), [visible]);
  const edges = app.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  const selected = inspectorOpen && visible.length
    ? visible.find((node) => node.id === selectedId) ?? visible[0]
    : undefined;
  const queryTarget = selected ?? visible.find((node) =>
    app.edges.some((edge) => edge.source === node.id || edge.target === node.id),
  );
  const querySuggestions = queryTarget
    ? [
        app.edges.some((edge) => edge.target === queryTarget.id)
          ? { label: `What reaches ${queryTarget.label || queryTarget.id}?`, query: `calls:${queryTarget.id}` }
          : null,
        app.edges.some((edge) => edge.source === queryTarget.id)
          ? { label: `What does ${queryTarget.label || queryTarget.id} reach?`, query: `reaches:${queryTarget.id}` }
          : null,
      ].filter(Boolean) as { label: string; query: string }[]
    : [];
  const topologySelectedRef = useRef<SVGGElement>(null);
  const focusAfterSelection = useRef(false);
  useEffect(() => {
    topologySelectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focusAfterSelection.current) {
      topologySelectedRef.current?.focus();
      focusAfterSelection.current = false;
    }
  }, [selectedId]);
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
  const participation = useMemo(() => {
    const flows = new Map<string, number>();
    const entries = new Map<string, number>();
    const roles = new Map<string, Set<string>>();
    app.flows.forEach((flow) => {
      new Set(flow.steps.map((step) => step.node_id)).forEach((nodeId) => flows.set(nodeId, (flows.get(nodeId) ?? 0) + 1));
      flow.steps.forEach((step) => {
        const roleSet = roles.get(step.node_id) ?? new Set<string>();
        roleSet.add(step.role.trim().toLowerCase());
        roles.set(step.node_id, roleSet);
      });
    });
    app.entries.forEach((entry) => new Set(entry.hops.map((hop) => hop.node_id)).forEach((nodeId) => entries.set(nodeId, (entries.get(nodeId) ?? 0) + 1)));
    return { flows, entries, roles };
  }, [app]);
  const flowCount = (nodeId: string) =>
    participation.flows.get(nodeId) ?? 0;
  const entryCount = (nodeId: string) =>
    participation.entries.get(nodeId) ?? 0;
  const rolesForNode = (nodeId: string) =>
    [...(participation.roles.get(nodeId) ?? [])];
  const orderedVisible = useMemo(() => {
    if (nodeOrder === "path") return visible;
    const degree = new Map<string, number>();
    app.edges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    });
    return [...visible].sort((a, b) => {
      const score = (nodeId: string) => (participation.flows.get(nodeId) ?? 0) + (participation.entries.get(nodeId) ?? 0) + (degree.get(nodeId) ?? 0);
      return score(b.id) - score(a.id) || visible.indexOf(a) - visible.indexOf(b);
    });
  }, [app.edges, nodeOrder, participation, visible]);
  const topologyLimited = !neighborhoodOnly && !showAllTopology && orderedVisible.length > 48;
  const topologyNodes = neighborhoodOnly && selected
    ? orderedVisible.filter((node) => connectedIds.has(node.id))
    : topologyLimited
      ? [
          ...(selected ? [selected] : []),
          ...orderedVisible.filter((node) => node.id !== selected?.id),
        ].slice(0, 48)
      : orderedVisible;
  const topologyIds = new Set(topologyNodes.map((node) => node.id));
  const topologyEdges = edges.filter((edge) => topologyIds.has(edge.source) && topologyIds.has(edge.target));
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
  const architectureContexts = query
    ? contexts.filter((context) => context.nodes.some((node) => visibleIds.has(node.id)))
    : contexts;
  const architectureModules = query
    ? modules
        .map((module) => ({ ...module, nodes: module.nodes.filter((node) => visibleIds.has(node.id)) }))
        .filter((module) => module.nodes.length > 0)
    : modules;
  const includedNodeCount = app.coverage.includedNodes ?? app.nodes.length;
  const indexedNodeCount = Math.max(1, app.coverage.indexedNodes ?? app.nodes.length);
  const nodeCoveragePercent = (includedNodeCount / indexedNodeCount) * 100;
  const health = [
    { label: "Graph nodes", value: app.nodes.length },
    { label: "Indexed nodes", value: app.coverage.indexedNodes ?? app.nodes.length },
    {
      label: "Node coverage",
      value: nodeCoveragePercent > 0 && nodeCoveragePercent < 1
        ? "<1%"
        : `${Math.min(100, Math.round(nodeCoveragePercent))}%`,
    },
    { label: "Relationships", value: app.edges.length },
    { label: "Explicit relationships", value: app.edges.filter((edge) => edge.origins.includes("bundle")).length },
    { label: "Derived relationships", value: app.edges.filter((edge) => edge.origins.some((origin) => origin !== "bundle")).length },
    { label: "Uncertain relationships", value: app.edges.filter((edge) => Boolean(edge.confidence || edge.limitations?.length)).length },
    { label: "Graph paths", value: app.flows.length },
    { label: "Request flows", value: app.entries.length },
    { label: "Linked records", value: app.mcp.length },
    { label: "Source previews included", value: `${app.nodes.filter(hasSource).length} / ${app.nodes.length}` },
    { label: "Documented symbols", value: `${app.nodes.filter((node) => node.documentation?.trim()).length} / ${app.nodes.length}` },
    { label: "Unmapped nodes", value: app.nodes.filter((node) => !node.file).length },
    {
      label: "Missing layouts",
      value: app.entries.filter((entry) => !entry.hasLayout).length,
    },
  ];
  function selectNode(id: string) {
    const node = app.nodes.find((item) => item.id === id);
    if (node && id !== selectedId && selectedId) {
      setSelectionHistory((current) => [...current.filter((item) => item !== selectedId), selectedId].slice(-20));
    }
    setSelectedId(id);
    setInspectorOpen(true);
    onFocusNode?.(id);
    if (node)
      onRecord(
        "Inspected graph node",
        node.label || node.id,
        `${node.file || "Source unavailable"}:${node.line || "—"}`,
      );
    trackEvent("topology_node_selected");
  }
  const previousNode = app.nodes.find((node) => node.id === selectionHistory.at(-1));
  function returnToPreviousNode() {
    if (!previousNode) return;
    setSelectionHistory((current) => current.slice(0, -1));
    if (!visible.some((node) => node.id === previousNode.id)) {
      setSearchText("");
      setQuery("");
      setNeighborhoodOnly(false);
    }
    setSelectedId(previousNode.id);
    setInspectorOpen(true);
    onFocusNode?.(previousNode.id);
    onRecord("Returned to graph node", previousNode.label || previousNode.id, nodeLocation(previousNode));
    trackEvent("topology_selection_reversed");
  }
  const summary = selected
      ? `${selected.label || selected.id} appears in ${flowCount(selected.id)} graph path${flowCount(selected.id) === 1 ? "" : "s"} and ${entryCount(selected.id)} request flow${entryCount(selected.id) === 1 ? "" : "s"}. It has ${app.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).length} recorded relationship${app.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).length === 1 ? "" : "s"}.`
    : visible.length
      ? "Select a node to reveal its source, connected paths, and nearby relationships."
      : "";
  const canvasOrder = topologyNodes;
  const canvasIndexes = new Map(canvasOrder.map((node, index) => [node.id, index]));
  const graphPos = (node: Node) => pos(Math.max(0, canvasIndexes.get(node.id) ?? 0));
  const graphHeight = Math.max(300, Math.ceil(canvasOrder.length / 4) * 92 + 110);
  const graphViewModified = Boolean(query || neighborhoodOnly || topologyZoom !== 1 || nodeOrder !== "path" || showAllTopology);
  const labelIndex = (node: Node) =>
    String(Math.max(0, canvasIndexes.get(node.id) ?? 0) + 1).padStart(2, "0");
  async function shareNode() {
    if (!selected) return;
    try {
      if (securityMode && onShare) {
        const copied = await onShare(selected.id);
        setShareState(copied ? "copied" : "failed");
      } else {
        await copyText(explainNode(app, selected, window.location.href));
        setShareState("copied");
        trackEvent("node_explanation_copied");
      }
    } catch {
      setShareState("failed");
      if (!securityMode) trackEvent("node_explanation_copy_failed");
    }
    window.setTimeout(() => setShareState("idle"), 1800);
  }
  async function shareNodeLink() {
    if (!selected || !onShare) return;
    const copied = await onShare(selected.id);
    setLinkState(copied ? "copied" : "failed");
    window.setTimeout(() => setLinkState("idle"), 1800);
  }
  function downloadNodeExplanation() {
    if (!selected) return;
    try {
      const filename = `${(selected.label || "lachesis-symbol").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "lachesis-symbol"}.md`;
      downloadText(explainNode(app, selected, window.location.href), filename);
      setDownloadState("downloaded");
      trackEvent("node_explanation_downloaded");
      window.setTimeout(() => setDownloadState("idle"), 1800);
    } catch {
      setDownloadState("failed");
      trackEvent("node_explanation_download_failed");
    }
  }

  return (
    <section
      className={`overview-workspace${inspectorOpen ? "" : " inspector-closed"}`}
    >
      <main className="overview-main">
        <header className="overview-heading">
          <div>
            <h2>{mode === "architecture" ? "See the codebase by module." : mode === "health" ? "Check the evidence boundary." : "Explore one neighborhood at a time."}</h2>
            <p>
              {mode === "architecture"
                ? "Start with the modules and boundaries in this bundle, then open a symbol when you need its relationships."
                : mode === "health"
                  ? "Review what is included, what is inferred, and where this bundle cannot answer with certainty."
                  : "Search for a symbol, inspect its nearby relationships, or browse the modules that make up this bundle."}
            </p>
          </div>
          <div className="overview-heading-actions">
            {previousNode && (
              <button
                type="button"
                className="inspector-reopen selection-back"
                onClick={returnToPreviousNode}
                title={`Return to ${previousNode.label || previousNode.id}`}
              >
                ← Back to {previousNode.label || previousNode.id}
              </button>
            )}
            {selected && (!securityMode || onShare) && (
              <button
                type="button"
                className="share-control"
                onClick={shareNode}
                aria-label={securityMode ? "Copy link to selected graph node" : "Copy Markdown explanation for selected symbol"}
                title={securityMode ? "Copy a shareable link to this graph node" : "Copy a portable Markdown explanation of this symbol"}
                aria-live="polite"
              >
                {shareState === "copied" ? (securityMode ? "Link copied" : "Markdown copied") : shareState === "failed" ? "Copy failed" : securityMode ? "Copy link" : "Copy Markdown"}
              </button>
            )}
            {selected && !securityMode && onShare && (
              <button
                type="button"
                className="share-control"
                onClick={shareNodeLink}
                aria-label="Copy link to selected graph node"
                title="Copy a local link to this exact graph node"
                aria-live="polite"
              >
                {linkState === "copied" ? "Link copied" : linkState === "failed" ? "Copy failed" : "Copy link"}
              </button>
            )}
            {selected && !securityMode && (
              <button
                type="button"
                className="share-control"
                onClick={downloadNodeExplanation}
                aria-label="Download Markdown explanation for selected symbol"
                title="Save a portable Markdown explanation of this symbol"
                aria-live="polite"
              >
                {downloadState === "downloaded" ? "Markdown saved" : downloadState === "failed" ? "Download failed" : "Download .md"}
              </button>
            )}
            {!inspectorOpen && visible.length > 0 && (
              <button
                type="button"
                className="inspector-reopen"
                onClick={() => setInspectorOpen(true)}
                aria-expanded={inspectorOpen}
                aria-controls="source-inspector"
              >
                <Icon name="code" size={13} />
                Show source
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
                Map
              </button>
              <button
                type="button"
                className={mode === "architecture" ? "active" : ""}
                aria-pressed={mode === "architecture"}
                onClick={() => setMode("architecture")}
              >
                <Icon name="matrix" size={13} />
                Modules
              </button>
              <button
                type="button"
                className={mode === "health" ? "active" : ""}
                aria-pressed={mode === "health"}
                onClick={() => {
                  setMode("health");
                  if (query) {
                    setSearchText("");
                    setQuery("");
                  }
                }}
              >
                <Icon name="history" size={13} />
                Data quality
              </button>
            </div>
          </div>
        </header>
        <div className="query-composer">
          <Icon name="search" size={15} />
          <input
            id="graph-filter"
            value={searchText || query}
            onChange={(event) => {
              setSearchText(event.target.value);
              setQuery(event.target.value);
            }}
            placeholder="Search symbols, files, modules, or code…"
            aria-label="Search graph nodes by symbol, file, module, service, documentation, or source code"
            aria-describedby="graph-filter-help"
          />
          <span className="sr-only" aria-live="polite">
            {query ? `${visible.length} graph nodes match the current filter.` : "Showing all graph nodes."}
          </span>
          <div className="query-chips">
            {filterSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.query}
                onClick={() => {
                  setSearchText(suggestion.label);
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
                  setSearchText("");
                  setQuery("");
                  trackEvent("semantic_filter_cleared", { surface: "topology" });
                }}
              >
                Clear
              </button>
            )}
            {mode === "map" && (
              <button
                type="button"
                className={`node-order${nodeOrder === "centrality" ? " active" : ""}`}
                aria-pressed={nodeOrder === "centrality"}
                aria-label="Sort symbols by path relevance or how connected they are"
                title="Sort by path relevance or connection count"
                onClick={() => {
                  const next = nodeOrder === "path" ? "centrality" : "path";
                  setNodeOrder(next);
                  trackEvent("graph_node_order_changed", { order: next });
                }}
              >
                {nodeOrder === "path" ? "Sort: path relevance" : "Sort: most connected"}
              </button>
            )}
          </div>
        </div>
        {querySuggestions.length > 0 && (
          <div className="query-intents" role="group" aria-label={`Questions about ${queryTarget?.label || queryTarget?.id}`}>
            <span>Ask about {queryTarget?.label || queryTarget?.id}</span>
            {querySuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.query}
                onClick={() => {
                  setSearchText(suggestion.label);
                  setQuery(suggestion.query);
                  trackEvent("semantic_question_applied", {
                    surface: "topology",
                    question: suggestion.query.split(":", 1)[0],
                  });
                }}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
        <p id="graph-filter-help" className="query-syntax-help">
          Filters: <code>kind:</code> <code>file:</code> <code>module:</code> <code>has:source</code> <code>edge:dynamic</code> · Questions: <code>calls:</code> into a symbol · <code>reaches:</code> out from a symbol
        </p>
        {mode === "map" && (
          <>
            <div className="map-summary">
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {selected ? `Selected ${selected.label || selected.id}, ${nodeLocation(selected)}.` : "No graph node selected."}
              </span>
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
                  ? `${summary}${neighborhoodOnly ? ` Canvas is focused to ${topologyNodes.length} connected context nodes.` : topologyLimited ? ` Showing the ${topologyNodes.length} most relevant nodes of ${visible.length}; open all to inspect the complete topology.` : ""}`
                  : `No nodes match “${query}”. Clear the filter to restore the full topology.`}
                {selected && visible.length > 1 && (
                  <button
                    type="button"
                    className="neighborhood-toggle"
                    aria-pressed={neighborhoodOnly}
                    onClick={() => setNeighborhoodOnly(!neighborhoodOnly)}
                  >
                    {neighborhoodOnly ? "Show full filtered graph" : "Focus selected neighborhood"}
                  </button>
                )}
                {visible.length > 32 && !neighborhoodOnly && (
                  <button
                    type="button"
                    className="neighborhood-toggle"
                    onClick={() => setMode("architecture")}
                  >
                    Too many nodes? Group by module
                  </button>
                )}
                {topologyLimited && (
                  <button
                    type="button"
                    className="neighborhood-toggle"
                    onClick={() => setShowAllTopology(true)}
                  >
                    Show all {visible.length} nodes
                  </button>
                )}
                {showAllTopology && visible.length > 48 && !neighborhoodOnly && (
                  <button
                    type="button"
                    className="neighborhood-toggle"
                    onClick={() => setShowAllTopology(false)}
                  >
                    Show focused {Math.min(48, visible.length)} nodes
                  </button>
                )}
                {graphViewModified && (
                  <button
                    type="button"
                    className="query-clear"
                    onClick={() => {
                      setSearchText("");
                      setQuery("");
                      setNeighborhoodOnly(false);
                      setTopologyZoom(1);
                      setNodeOrder("path");
                      setShowAllTopology(false);
                      trackEvent("graph_view_reset");
                    }}
                  >
                    Reset graph view
                  </button>
                )}
              </p>
            </div>
            {visible.length ? (
              <>
              <div className="topology-minimap">
                <div>
                  <span className="panel-label">MAP OVERVIEW</span>
                  <small>Choose a symbol to focus its source context.</small>
                </div>
                <div className="topology-zoom" role="group" aria-label="Topology zoom controls">
                  <button type="button" onClick={() => setTopologyZoom((value) => Math.max(.7, Number((value - .1).toFixed(1))))} aria-label="Zoom topology out"><Icon name="minus" size={13} /></button>
                  <output aria-live="polite">{Math.round(topologyZoom * 100)}%</output>
                  <button type="button" onClick={() => setTopologyZoom((value) => Math.min(1.5, Number((value + .1).toFixed(1))))} aria-label="Zoom topology in"><Icon name="plus" size={13} /></button>
                  <button type="button" onClick={() => setTopologyZoom(1)}>Reset</button>
                </div>
                <svg viewBox="0 0 180 80" aria-label="Topology minimap">
                  {topologyEdges.map((edge) => {
                    const source = visibleById.get(edge.source);
                    const target = visibleById.get(edge.target);
                    if (!source || !target) return null;
                    const a = graphPos(source);
                    const b = graphPos(target);
                    return <line className={crossesScope(source, target) ? "boundary" : ""} key={`mini-${edge.id}`} x1={8 + (a.x / 760) * 164} y1={8 + (a.y / graphHeight) * 64} x2={8 + (b.x / 760) * 164} y2={8 + (b.y / graphHeight) * 64} />;
                  })}
                  {topologyNodes.map((node) => {
                    const point = graphPos(node);
                    const select = () => selectNode(node.id);
                    return <circle key={`mini-${node.id}`} className={selected?.id === node.id ? "selected" : ""} cx={8 + (point.x / 760) * 164} cy={8 + (point.y / graphHeight) * 64} r={selected?.id === node.id ? 3 : 2} onClick={(event) => { event.currentTarget.focus(); select(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }} role="button" tabIndex={0} aria-pressed={selected?.id === node.id} aria-label={`Focus ${node.label || node.id}${nodeScopeLabel(node) !== "Unscoped nodes" ? ` in ${nodeScopeLabel(node)}` : ""} in topology`} />;
                  })}
                </svg>
              </div>
              <div className="topology-canvas" role="region" aria-label="Interactive graph topology canvas">
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
                    const source = visibleById.get(edge.source),
                      target = visibleById.get(edge.target);
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
                        ><title>{source.label || source.id} → {target.label || target.id}: {boundary ? "context boundary · " : ""}{edge.relation || "connected"}</title></path>
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
                        ref={selected?.id === node.id ? topologySelectedRef : undefined}
                        key={node.id}
                        className={`topology-node kind-${node.kind} scope-${nodeScopeKind(node)} ${roleClasses}${selected?.id === node.id ? " selected" : ""}${focusActive && !connectedIds.has(node.id) ? " dimmed" : ""}`}
                        onClick={(event) => { event.currentTarget.focus(); select(); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            select();
                            return;
                          }
                          const index = canvasOrder.findIndex((item) => item.id === node.id);
                          const isNavigationKey = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key);
                          if (isNavigationKey) event.preventDefault();
                          const nextIndex = event.key === "ArrowRight"
                            ? index + 1
                            : event.key === "ArrowLeft"
                              ? index - 1
                              : event.key === "ArrowDown"
                                ? index + 4
                                : event.key === "ArrowUp"
                                  ? index - 4
                                  : event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? canvasOrder.length - 1
                                      : -1;
                          if (nextIndex >= 0 && nextIndex < canvasOrder.length) {
                            focusAfterSelection.current = true;
                            selectNode(canvasOrder[nextIndex].id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected?.id === node.id}
                        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
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
                  <span title="The bundle recorded this connection directly"><i className="legend-exact" />recorded connection</span>
                  <span title="The connection uses an alternate or aliased name"><i className="legend-alias" />alternate connection</span>
                  <span title="The connection depends on runtime behavior"><i className="legend-dynamic" />runtime-dependent connection</span>
                  <span title="The connection crosses a module, service, or repository boundary"><i className="legend-boundary" />module / service boundary</span>
                  {visible.some((node) => node.scope?.kind === "external" || node.scope?.kind === "generated") && <span title="This symbol belongs to generated or external code"><i className="legend-scope" />external / generated code</span>}
                  <span className="topology-hint">Select a node to inspect its source · arrows show direction</span>
                </div>
                <div className="topology-node-list" aria-label={neighborhoodOnly ? "Graph nodes in selected neighborhood" : "Graph nodes"}>
                  {topologyNodes.map((node) => {
                    const roles = rolesForNode(node.id);
                    return (
                    <button
                      type="button"
                      key={node.id}
                      className={selected?.id === node.id ? "selected" : ""}
                      onClick={() => selectNode(node.id)}
                      aria-pressed={selected?.id === node.id}
                      aria-current={selected?.id === node.id ? "step" : undefined}
                      aria-label={`${node.label || node.id}, ${node.kind}, ${flowCount(node.id)} graph paths, ${entryCount(node.id)} request flows, ${nodeLocation(node)}`}
                    >
                      <span>{labelIndex(node)}</span>
                      <b>{node.label || node.id}</b>
                      <small>
                        {node.kind}{roles.length ? ` · ${roles.join("/")}` : ""}{node.scope?.kind ? ` · ${node.scope.kind}` : ""} · {node.scope?.label || node.scope?.service || node.scope?.module || node.scope?.repository || "Unscoped"} · {nodeLocation(node)}
                      </small>
                      {query && nodeMatchLabel(node, query) && <small className="topology-match">{nodeMatchLabel(node, query)}</small>}
                      <small className="topology-participation">{flowCount(node.id)} graph paths · {entryCount(node.id)} request flows · {hasSource(node) ? "Source preview included" : "Source text unavailable"}</small>
                    </button>
                    );
                  })}
                </div>
              </div>
              </>
            ) : (
              <div className="topology-empty">
                <Icon name="search" size={18} />
                <h3>{query ? "No nodes match this filter" : "No graph nodes in this bundle"}</h3>
                <p>{query ? "Try another query or return to the complete graph." : "Load a bundle that includes graph nodes to inspect its structure here."}</p>
                {query && <button type="button" onClick={() => { setSearchText(""); setQuery(""); }}>Clear filter</button>}
              </div>
            )}
          </>
        )}
        {mode === "architecture" && (
          <div className="architecture-grid">
            <section>
              <span className="panel-label">CODEBASE AREAS</span>
              {query && <p className="architecture-filter-note">Showing areas and modules containing {visible.length} matching symbol{visible.length === 1 ? "" : "s"}.</p>}
              {architectureContexts.length || architectureModules.length ? <div className="context-inventory">
                {architectureContexts.map((context) => (
                  <button
                    type="button"
                    className="context-row"
                    key={context.key}
                    aria-label={`${context.label}, ${context.nodes.length} symbols, ${context.outbound} outbound and ${context.inbound} inbound boundary transitions`}
                    onClick={() => {
                      const filterValue = context.service || context.repository || context.module;
                      const filterKey = context.service ? "service" : context.repository ? "repo" : context.module ? "module" : "scope";
                      setMode("map");
                      setSearchText(filterValue || "");
                      setQuery(filterValue ? `${filterKey}:${filterValue}` : "");
                      setNeighborhoodOnly(false);
                      setTopologyZoom(1);
                      trackEvent(filterValue ? "semantic_filter_applied" : "semantic_filter_cleared", { surface: "architecture", filter: filterKey });
                    }}
                  >
                    <span className="context-row-mark" />
                    <span>
                      <b>{context.label}</b>
                      <small>{context.repository || "No repository"}{context.service ? ` · ${context.service}` : context.module ? ` · ${context.module}` : ""} · {context.nodes.length} symbols · {context.outbound} out / {context.inbound} in</small>
                    </span>
                    <em title={`${context.outbound} outbound · ${context.inbound} inbound boundary transitions`}>{context.nodes.length}</em>
                  </button>
                ))}
              </div> : <div className="architecture-filter-empty" role="status">No areas or modules contain this search.</div>}
              <div className="detail-rule" />
              <span className="panel-label">MODULES</span>
              {architectureModules.map((module) => (
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
                <button
                  type="button"
                  className="boundary-transition"
                  key={`${transition.source}-${transition.target}`}
                  disabled={!transition.query}
                  onClick={() => {
                    if (!transition.query) return;
                    setMode("map");
                    setSearchText(`${transition.source} → ${transition.target}`);
                    setQuery(transition.query);
                    setNeighborhoodOnly(false);
                    setTopologyZoom(1);
                    trackEvent("semantic_filter_applied", { surface: "architecture", filter: transition.query.split(":", 1)[0] || "scope" });
                  }}
                  aria-label={`${transition.source} to ${transition.target}, ${transition.count} relationships`}
                >
                  <b>{transition.source} <i>→</i> {transition.target}</b>
                  <small>{transition.count} relationship{transition.count === 1 ? "" : "s"} · {transition.relation}</small>
                </button>
              )) : <p className="diff-empty">No explicit context transitions are available.</p>}
              <div className="detail-rule" />
              <span className="panel-label">HIGHLY CONNECTED SYMBOLS</span>
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
                    {nodeLocation(item.node)} · {item.flows} flows · {item.entries} requests
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
                  Some request flows use derived layout coordinates.
                </p>
              )}
              {app.nodes.some((node) => !node.file) && (
                <p>
                  <i />
                  Some nodes do not include a source file location.
                </p>
              )}
              {app.nodes.some((node) => !node.snippet.trim()) && (
                <p>
                  <i />
                  Some nodes include graph structure without source text; their relationships remain inspectable.
                </p>
              )}
              {app.nodes.some((node) => !node.documentation?.trim()) && (
                <p>
                  <i />
                  Documentation is only available for symbols that the exporter reported.
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
          contextRole={rolesForNode(selected.id).join(" / ") || undefined}
          app={app}
          onNode={selectNode}
          onFile={onFile}
          onFlow={onFlow}
          onEntry={onEntry}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </section>
  );
}
