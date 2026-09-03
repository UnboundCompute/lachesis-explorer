"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { countLabel, flowDisplayName, indirectionCount, type App, type Flow } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { copyText, downloadText } from "../lib/clipboard";
import { explainFlow } from "../lib/explanations";
import { Icon } from "./Icon";
import { readLocal, writeLocal } from "../lib/storage";
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
  onView: (view: "journey" | "map", nodeId?: string) => void;
  onFlow: (flowId: string, nodeId: string) => void;
  onEntry: (entryIndex: number, nodeId: string) => void;
  onFile?: (file: string) => void;
  onShare?: (params: Record<string, string>) => Promise<boolean>;
};
type NodeIndex = ReadonlyMap<string, App["nodes"][number]>;

function matchesFlow(app: App, flow: Flow, query: string, nodeById: NodeIndex) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const nodes = flow.steps
    .map((step) => nodeById.get(step.node_id))
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
      if (key === "module")
        return nodes.some((node) => [node?.module, node?.scope?.module].some((item) => item?.toLowerCase().includes(value)));
      if (key === "scope" || key === "service" || key === "repo" || key === "repository") {
        return nodes.some((node) =>
            [node?.scope?.label, node?.scope?.repository, node?.scope?.service, node?.scope?.package, node?.scope?.module]
            .some((item) => item?.toLowerCase().includes(value)),
        );
      }
      if (key === "has" && value === "mcp")
        return app.mcp.some((item) => item.for === flow.id);
      if (key === "has" && (value === "source" || value === "source-preview"))
        return nodes.some((node) => Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length));
      if (key === "has" && (value === "source-gap" || value === "missing-source"))
        return nodes.some((node) => !node?.snippet.trim() && !node?.sourceWindow?.lines.length);
      if (key === "path")
        return flow.kind?.toLowerCase().includes(value) ?? false;
      if (key === "role")
        return flow.steps.some((step) =>
          step.role.toLowerCase().includes(value),
        );
    }
    const haystack = [
      flow.name,
      flow.kind,
      flow.description,
      ...flow.steps.map((step) => step.role),
      ...flow.steps.flatMap((step) => [step.note, step.edge?.relation]),
      ...nodes.flatMap((node) =>
        node ? [node.label, node.file, node.kind, node.qualifiedName, node.signature, node.documentation, node.snippet, node.sourceWindow?.lines.join(" "), node.module, node.scope?.label, node.scope?.service, node.scope?.package, node.scope?.module, node.scope?.repository] : [],
      ),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function matchingStepIndex(flow: Flow, query: string, nodeById: NodeIndex) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return -1;

  return flow.steps.findIndex((step) => {
    const node = nodeById.get(step.node_id);
    const haystack = [
      step.role,
      step.note,
      step.edge?.relation,
      node?.label,
      node?.file,
      node?.kind,
      node?.qualifiedName,
      node?.signature,
      node?.documentation,
      node?.snippet,
      node?.sourceWindow?.lines.join(" "),
      node?.module,
      node?.scope?.label,
      node?.scope?.service,
      node?.scope?.package,
      node?.scope?.module,
      node?.scope?.repository,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((term) => {
      const [key, ...rest] = term.split(":");
      const value = rest.join(":");
      if (rest.length) {
        if (key === "file") return node?.file.toLowerCase().includes(value);
        if (key === "kind") return node?.kind.toLowerCase().includes(value);
        if (key === "module") return [node?.module, node?.scope?.module].some((item) => item?.toLowerCase().includes(value));
        if (key === "scope" || key === "service" || key === "repo" || key === "repository") {
          return [node?.scope?.label, node?.scope?.repository, node?.scope?.service, node?.scope?.package, node?.scope?.module]
            .some((item) => item?.toLowerCase().includes(value));
        }
        if (key === "role") return step.role.toLowerCase().includes(value);
        if (key === "confidence") return step.edge?.confidence?.toLowerCase().includes(value) ?? false;
        if (key === "edge") {
          if (value === "alias") return Boolean(step.edge?.alias);
          if (value === "dynamic") return Boolean(step.edge?.dynamic);
          if (value === "uncertain") return Boolean(step.edge?.confidence || step.edge?.limitations?.length);
        }
        if (key === "has" && (value === "source" || value === "source-preview")) return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
        if (key === "has" && (value === "source-gap" || value === "missing-source")) return !node?.snippet.trim() && !node?.sourceWindow?.lines.length;
        if (key === "has" && value === "mcp") return true;
        if (key === "path") return true;
        return false;
      }
      return haystack.includes(term);
    });
  });
}

function flowMatchLabel(app: App, flow: Flow, query: string, nodeById: NodeIndex) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return "";
  const nodes = flow.steps
    .map((step) => nodeById.get(step.node_id))
    .filter(Boolean);
  const fields = [
    { label: "source", values: nodes.flatMap((node) => node ? [node.snippet, node.sourceWindow?.lines.join(" ")] : []) },
    { label: "documentation", values: nodes.flatMap((node) => node ? [node.documentation] : []) },
    { label: "signature", values: nodes.flatMap((node) => node ? [node.signature] : []) },
    { label: "symbol", values: nodes.flatMap((node) => node ? [node.label, node.qualifiedName, node.id] : []) },
    { label: "file", values: nodes.flatMap((node) => node ? [node.file, node.module, node.scope?.module] : []) },
  ];
  const match = fields.find(({ values }) =>
    terms.some((term) => values.some((value) => value?.toLowerCase().includes(term))),
  );
  return match ? `Found in ${match.label}` : "";
}

function pathKindLabel(flow: Flow, securityPath: boolean) {
  if (securityPath) return "Security witness";
  const kind = flow.kind?.trim().toLowerCase();
  if (kind === "call-path" || kind === "callpath") return "Call path";
  if (kind === "data-flow" || kind === "dataflow") return "Data flow";
  if (kind === "value-flow" || kind === "valueflow") return "Value path";
  return flow.kind?.trim() || "Graph path";
}

function flowLocation(app: App, flow: Flow, nodeById: NodeIndex) {
  const nodes = flow.steps
    .map((step) => nodeById.get(step.node_id))
    .filter(Boolean);
  const location = (node: (typeof app.nodes)[number]) =>
    `${node.file || "source unavailable"}:${node.line || "—"}`;
  if (!nodes.length) return "Source location unavailable";
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const firstLocation = location(first);
  const lastLocation = location(last);
  return first.id === last.id || firstLocation === lastLocation
    ? firstLocation
    : `${firstLocation} → ${lastLocation}`;
}

function flowListLabel(app: App, flow: Flow, nodeById: NodeIndex) {
  const exact = flowDisplayName(flow, app.nodes, app.flows);
  const analyzerArtifact = /__builtin_|___chk\b/.test(exact);
  if (exact.length <= 58 && !analyzerArtifact) return exact;
  return `${pathKindLabel(flow, app.findings.some((finding) => finding.id === flow.id))} · ${flowLocation(app, flow, nodeById)}`;
}

function sourceCoverage(flow: Flow, nodeById: NodeIndex) {
  const available = flow.steps.filter((step) => {
    const node = nodeById.get(step.node_id);
    return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
  }).length;
  return { available, total: flow.steps.length };
}

function flowScopes(app: App, flow: Flow, nodeById: NodeIndex) {
  const scopes: string[] = [];
  flow.steps.forEach((step) => {
    const node = nodeById.get(step.node_id);
    const scope = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository;
    if (scope && scopes.at(-1) !== scope) scopes.push(scope);
  });
  return scopes;
}

function nodeLocation(node: App["nodes"][number] | undefined) {
  return node ? `${node.file || "Source location unavailable"}:${node.line || "—"}` : "Source location unavailable";
}
function nodeContext(node: App["nodes"][number] | undefined) {
  return node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository || "";
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
  onFlow,
  onEntry,
  onFile,
  onShare,
}: Props) {
  const flow = app.flows.find((item) => item.id === flowId) ?? app.flows[0];
  const nodeById = useMemo(() => new Map(app.nodes.map((node) => [node.id, node])), [app.nodes]);
  const [selectedPosition, setSelectedPosition] = useState(position ?? 0);
  const [searchText, setSearchText] = useState("");
  const [previousFlowId, setPreviousFlowId] = useState("");
  const [explanationState, setExplanationState] = useState<"idle" | "copied" | "failed">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloaded" | "failed">("idle");
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [pinnedFlowIds, setPinnedFlowIds] = useState<string[]>([]);
  const selectedFlowRef = useRef<HTMLButtonElement>(null);
  const previousDirection = useRef(direction);
  useEffect(() => {
    if (!flow) return;
    setExplanationState("idle");
    setShareState("idle");
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
    setSearchText("");
    setPreviousFlowId("");
  }, [app]);
  const pinnedKey = `lachesis-pinned-paths:${app.name || "untitled"}:${app.commit || "unknown"}`;
  useEffect(() => {
    try {
      const stored = JSON.parse(readLocal(pinnedKey) ?? "[]");
      setPinnedFlowIds(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string" && app.flows.some(item => item.id === id)).slice(0, 6) : []);
    } catch {
      setPinnedFlowIds([]);
    }
  }, [pinnedKey, app.flows]);
  useEffect(() => {
    setSearchText(query);
  }, [query]);
  useEffect(() => {
    selectedFlowRef.current?.scrollIntoView({ block: "nearest" });
  }, [flowId, query]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']") || target.closest('[role="dialog"]'))
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
      <main className="workspace-empty" aria-label="Graph path workspace">
        <span className="empty-target">
          <Icon name="code" size={22} />
        </span>
        <h2>No paths in this bundle</h2>
        <p>
          This bundle contains graph structure, but no graph paths were
          included for tracing.{" "}
          {app.entries.length
            ? "Follow a request flow instead."
            : "Open the graph to inspect its structure."}
        </p>
        <button
          className="context-upload"
          type="button"
          onClick={() => onView(app.entries.length ? "journey" : "map")}
        >
          <span>
            {app.entries.length ? "Open request flows" : "Open graph"}
          </span>
          <span className="button-icon">
            <Icon name="arrow" size={14} />
          </span>
        </button>
      </main>
    );
  const selected = nodeById.get(stepId) ?? app.nodes[0];
  const visible = useMemo(
    () => app.flows.filter((item) => matchesFlow(app, item, query, nodeById)),
    [app, nodeById, query],
  );
  const pinnedFlows = pinnedFlowIds.map((id) => app.flows.find((item) => item.id === id)).filter(Boolean) as Flow[];
  const steps =
    direction === "backward" ? flow.steps : [...flow.steps].reverse();
  const evidence = app.mcp.find((item) => item.for === flow.id);
  const securityPath = app.findings.some((finding) => finding.id === flow.id);
  const primaryCodeKind = app.nodes.some((node) => node.kind === "function")
    ? "function"
    : app.nodes[0]?.kind || "node";
  const filterSuggestions = [
    flow.kind
      ? { label: pathKindLabel(flow, securityPath), query: `path:${flow.kind}` }
      : null,
    app.findings.length > 0 || app.bundle.projection === "security projection"
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
    app.mcp.length ? { label: "Bundle-linked", query: "has:mcp" } : null,
    app.flows.some((item) => sourceCoverage(item, nodeById).available > 0)
      ? { label: "Has source", query: "has:source" }
      : null,
    app.flows.some((item) => sourceCoverage(item, nodeById).available < item.steps.length)
      ? { label: "Source gaps", query: "has:source-gap" }
      : null,
    ...[...new Set(app.nodes.map((node) => node.scope?.service).filter(Boolean))]
      .slice(0, 2)
      .map((service) => ({ label: service!, query: `service:${service}` })),
  ].filter(Boolean) as { label: string; query: string }[];
  const firstNode = nodeById.get(flow.sourceNodeId ?? flow.steps[0]?.node_id ?? "");
  const lastNode = nodeById.get(flow.sinkNodeId ?? flow.steps.at(-1)?.node_id ?? "");
  const displayedStart = direction === "forward" ? lastNode : firstNode;
  const displayedEnd = direction === "forward" ? firstNode : lastNode;
  const contextRoute = flowScopes(app, flow, nodeById);
  const indirectSteps = flow.steps.filter(
    (step) => step.edge?.alias || step.edge?.dynamic,
  ).length;
  const sourcePreviewCount = sourceCoverage(flow, nodeById).available;
  const items: PathItem[] = steps.map((step) => ({
    id: step.node_id,
    occurrenceId: step.id,
    node: nodeById.get(step.node_id) ?? app.nodes[0],
    label: step.role,
    caption: step.note,
    relation: step.edge?.relation ?? (step.role === "transforms" ? "transforms" : step.role === "used by" ? "used by" : step.role === "sink" ? "value flows to" : undefined),
    edge: step.edge,
  }));
  const selectedIndex = Math.max(
    0,
    items[selectedPosition]?.id === stepId
      ? selectedPosition
      : items.findIndex((item) => item.id === stepId),
  );
  const previousFlow = app.flows.find((item) => item.id === previousFlowId);
  function rememberFlow(nextFlowId: string) {
    if (flow?.id && nextFlowId !== flow.id) setPreviousFlowId(flow.id);
  }
  function togglePinned() {
    if (!flow) return;
    const next = pinnedFlowIds.includes(flow.id)
      ? pinnedFlowIds.filter((id) => id !== flow.id)
      : [flow.id, ...pinnedFlowIds].slice(0, 6);
    setPinnedFlowIds(next);
    writeLocal(pinnedKey, JSON.stringify(next));
    trackEvent("path_pin_toggled", { pinned: next.includes(flow.id) });
  }
  function returnToPreviousFlow() {
    if (!previousFlow) return;
    const currentFlowId = flow?.id ?? "";
    const orderedSteps = direction === "forward" ? [...previousFlow.steps].reverse() : previousFlow.steps;
    const nextNode = orderedSteps[0]?.node_id ?? "";
    setPreviousFlowId(currentFlowId);
    onFlow(previousFlow.id, nextNode);
    onPositionChange?.(0);
    onInspectorOpen();
    onRecord("Returned to graph path", previousFlow.id, countLabel(previousFlow.steps.length, "symbol"));
    trackEvent("trace_path_reversed");
  }
  function openConnectedFlow(nextFlowId: string, nextNodeId: string) {
    rememberFlow(nextFlowId);
    onFlow(nextFlowId, nextNodeId);
  }
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
      nodeLocation(next.node),
    );
    trackEvent("trace_step_navigated", { direction: delta > 0 ? "next" : "previous" });
  }
  async function copyExplanation() {
    try {
      await copyText(explainFlow(app, flow, direction, selectedIndex, window.location.href));
      setExplanationState("copied");
      trackEvent("path_explanation_copied", { surface: "trace" });
      window.setTimeout(() => setExplanationState("idle"), 1800);
    } catch {
      setExplanationState("failed");
      trackEvent("path_explanation_copy_failed", { surface: "trace" });
    }
  }
  async function sharePath() {
    if (!onShare) return;
    const params: Record<string, string> = {
      view: "trace",
      flow: flow.id,
      node: stepId,
      direction,
      step_index: String(selectedIndex),
    };
    const occurrence = items[selectedIndex]?.occurrenceId;
    if (occurrence) params.step_occurrence = occurrence;
    if (query) params.filter = query;
    const copied = await onShare(params);
    setShareState(copied ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 1800);
  }
  function downloadExplanation() {
    try {
      const filename = `${(flow.name || "lachesis-path").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "lachesis-path"}.md`;
      downloadText(explainFlow(app, flow, direction, selectedIndex, window.location.href), filename);
      setDownloadState("downloaded");
      trackEvent("path_explanation_downloaded", { surface: "trace" });
      window.setTimeout(() => setDownloadState("idle"), 1800);
    } catch {
      setDownloadState("failed");
      trackEvent("path_explanation_download_failed", { surface: "trace" });
    }
  }
  return (
    <section className={`workspace trace-workspace${inspectorOpen ? "" : " inspector-closed"}`}>
      <aside className="sidebar">
        <span className="panel-label">PATHS TO EXPLORE</span>
        <label className="search">
          <Icon name="search" size={15} />
          <input
            value={searchText || query}
            onChange={(event) => {
              setSearchText(event.target.value);
              setQuery(event.target.value);
            }}
            placeholder="Search paths, symbols, files, or code…"
            aria-label="Search paths by name, symbol, file, module, documentation, or source code"
          />
        </label>
        {pinnedFlows.length > 0 && (
          <section className="path-pins" aria-label="Pinned graph paths">
            <div className="path-pins-heading"><span className="panel-label">PINNED PATHS</span><button type="button" onClick={() => { setPinnedFlowIds([]); writeLocal(pinnedKey, "[]"); }}>Clear pins</button></div>
            {pinnedFlows.map((item) => (
              <button type="button" key={item.id} className={item.id === flow.id ? "path-pin selected" : "path-pin"} onClick={() => { onFlow(item.id, item.sourceNodeId ?? item.steps[0]?.node_id ?? ""); onInspectorOpen(); onRecord("Opened pinned graph path", item.id, countLabel(item.steps.length, "symbol")); }}>
                <span><b title={flowDisplayName(item, app.nodes, app.flows)}>{flowListLabel(app, item, nodeById)}</b><small>{pathKindLabel(item, app.findings.some((finding) => finding.id === item.id))} · {countLabel(item.steps.length, "symbol")}</small></span><Icon name="arrow" size={11} />
              </button>
            ))}
          </section>
        )}
        <div className="filter-hints" role="group" aria-label="Quick path filters">
          {filterSuggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion.query}
              onClick={() => {
                setSearchText(suggestion.label);
                setQuery(suggestion.query);
                trackEvent("semantic_filter_applied", {
                  surface: "trace",
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
                trackEvent("semantic_filter_cleared", { surface: "trace" });
              }}
            >
              Clear
            </button>
          )}
        </div>
        {query && !visible.some((item) => item.id === flow.id) && (
          <div className="filter-context" role="status">
            <span>Selected path is outside this filter.</span>
            <button type="button" onClick={() => { setSearchText(""); setQuery(""); }}>Show selected path</button>
          </div>
        )}
        <div className="node-list">
          {visible.length ? (
            visible.map((item) => (
              <button
                type="button"
                key={item.id}
                ref={item.id === flow.id ? selectedFlowRef : undefined}
                className={
                  flow.id === item.id ? "node-row selected" : "node-row"
                }
                onClick={() => {
                  const orderedSteps = direction === "forward" ? [...item.steps].reverse() : item.steps;
                  const rawMatchIndex = matchingStepIndex(item, query, nodeById);
                  const nextIndex = rawMatchIndex < 0
                    ? 0
                    : direction === "forward"
                      ? item.steps.length - 1 - rawMatchIndex
                      : rawMatchIndex;
                  rememberFlow(item.id);
                  setFlowId(item.id);
                  setStepId(orderedSteps[nextIndex]?.node_id ?? "");
                  onPositionChange?.(nextIndex);
                  onInspectorOpen();
                  onRecord(
                    "Opened graph path",
                    item.id,
                    countLabel(item.steps.length, "node"),
                  );
                  trackEvent("flow_selected");
                }}
              >
                <span className="kind-dot" />
                <span>
                  <b title={flowDisplayName(item, app.nodes, app.flows)}>{flowListLabel(app, item, nodeById)}</b>
                  <small>
                    {app.findings.some((finding) => finding.id === item.id)
                      ? "Security witness"
                      : app.mcp.some((evidence) => evidence.for === item.id)
                        ? `Bundle-backed ${pathKindLabel(item, false).toLowerCase()}`
                      : pathKindLabel(item, false)} {" · "}
                    {countLabel(item.steps.length, app.findings.some((finding) => finding.id === item.id) ? "node" : "symbol")} · {sourceCoverage(item, nodeById).available}/{item.steps.length} source previews{flowDisplayName(item, app.nodes, app.flows) === item.name ? ` · ${flowLocation(app, item, nodeById)}` : ""}
                  </small>
                  {query && flowMatchLabel(app, item, query, nodeById) && <small className="node-row-context">{flowMatchLabel(app, item, query, nodeById)}</small>}
                  {app.mcp.find((evidence) => evidence.for === item.id)?.result_summary && (
                    <small className="node-row-context">
                      {app.mcp.find((evidence) => evidence.for === item.id)?.result_summary}
                    </small>
                  )}
                  {flowScopes(app, item, nodeById).length > 1 && (
                    <small className="node-row-context">Context: {flowScopes(app, item, nodeById).join(" → ")}</small>
                  )}
                </span>
              </button>
            ))
          ) : (
            <div className="list-empty">
              <p>
                No graph paths match “{query}”. Try a path name, symbol, file,
                module, relationship, or source term.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchText("");
                  setQuery("");
                  trackEvent("semantic_filter_cleared", { surface: "trace" });
                }}
              >
                Show all graph paths
              </button>
            </div>
          )}
        </div>
        <div className="sidebar-foot" aria-live="polite">
          <span className="tiny-dot" /> {countLabel(visible.length, "graph path")} of {countLabel(app.flows.length, "graph path")} visible
        </div>
      </aside>
      <main className="main-panel">
        <div className="toolbar">
          <div>
            <span className="panel-label">FOLLOWING THIS PATH</span>
            <h2>
              <code
                title={`Exact bundle path label: ${flow.name}`}
                aria-label={`Exact bundle path label: ${flow.name}`}
              >
                {flowListLabel(app, flow, nodeById)}
              </code>
            </h2>
            {flow.description && <p className="path-description">{flow.description}</p>}
            <div className="path-route-summary" aria-label="Graph path endpoints">
              <span><small>Starts at</small><b>{displayedStart?.label || displayedStart?.id || "Not reported"}</b></span>
              <i aria-hidden="true">→</i>
              <span><small>Ends at</small><b>{displayedEnd?.label || displayedEnd?.id || "Not reported"}</b></span>
            </div>
            <p className="path-meta">
              <span>{pathKindLabel(flow, securityPath)}</span>
              {flow.confidence && <span>{flow.confidence} confidence</span>}
              <span>{countLabel(sourcePreviewCount, "source preview")} / {countLabel(flow.steps.length, "step")}</span>
              {flow.limitations?.length ? <span>{flow.limitations.length} known limitation{flow.limitations.length === 1 ? "" : "s"}</span> : null}
              {contextRoute.length > 1 && <span>context: {contextRoute.join(" → ")}</span>}
            </p>
          </div>
          <div className="toolbar-actions">
            {previousFlow && (
              <button type="button" className="inspector-reopen selection-back" onClick={returnToPreviousFlow} title={`Return to ${previousFlow.name}`}>
                ← Back to previous path
              </button>
            )}
            {!inspectorOpen && (
              <button className="inspector-reopen" type="button" onClick={onInspectorOpen} aria-expanded={inspectorOpen}>
                Show source
              </button>
            )}
            <button className="inspector-reopen" type="button" onClick={() => onView("map", stepId)}>
              Open in Explore
            </button>
            <button className={pinnedFlowIds.includes(flow.id) ? "inspector-reopen pin-toggle active" : "inspector-reopen pin-toggle"} type="button" onClick={togglePinned} aria-pressed={pinnedFlowIds.includes(flow.id)} title={pinnedFlowIds.includes(flow.id) ? "Remove this path from your pinned working set" : "Keep this path in your pinned working set"}>
              <Icon name="pin" size={13} /> {pinnedFlowIds.includes(flow.id) ? "Pinned" : "Pin path"}
            </button>
            <div className="toolbar-share-actions" role="group" aria-label="Share this path context">
              <button className="inspector-reopen share-explanation" type="button" onClick={copyExplanation} aria-live="polite">
                {explanationState === "copied" ? "Markdown copied" : explanationState === "failed" ? "Copy failed" : "Copy Markdown"}
              </button>
              <button className="inspector-reopen share-explanation" type="button" onClick={downloadExplanation} aria-live="polite">
                {downloadState === "downloaded" ? "Markdown saved" : downloadState === "failed" ? "Download failed" : "Download .md"}
              </button>
              {onShare && (
                <button className="inspector-reopen" type="button" onClick={sharePath} aria-live="polite">
                  {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
                </button>
              )}
            </div>
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
            <div className="segmented" aria-label="Path order">
              <button
                type="button"
                className={direction === "backward" ? "selected" : ""}
                aria-pressed={direction === "backward"}
                onClick={() => {
                  setDirection("backward");
                  onRecord("Changed path order", flow.id, "start to end");
                  trackEvent("trace_direction_changed", {
                    direction: "backward",
                  });
                }}
              >
                Start → end
              </button>
              <button
                type="button"
                className={direction === "forward" ? "selected" : ""}
                aria-pressed={direction === "forward"}
                onClick={() => {
                  setDirection("forward");
                  onRecord("Changed path order", flow.id, "end to start");
                  trackEvent("trace_direction_changed", {
                    direction: "forward",
                  });
                }}
              >
                End → start
              </button>
            </div>
          </div>
        </div>
        <div className="trace-orientation" aria-label="Selected path summary">
          <div>
            <span>START</span>
            <b>{displayedStart?.label || "Unknown symbol"}</b>
            <small>
              {nodeLocation(displayedStart)}
            </small>
          </div>
          <i aria-hidden="true">
            <span />
          </i>
          <div>
            <span>END</span>
            <b>{displayedEnd?.label || "Unknown symbol"}</b>
            <small>
              {nodeLocation(displayedEnd)}
            </small>
          </div>
          <div className="trace-orientation-fact">
            <span>STEP / TOTAL</span>
            <b>
              {selectedIndex + 1} / {items.length}
            </b>
          </div>
          <div className="trace-orientation-fact">
              <span>{securityPath ? "INDIRECT" : "INFERRED LINKS"}</span>
            <b>{indirectSteps}</b>
          </div>
        </div>
        <details className="reading-guide" open>
          <summary>
            <span>How to read this path</span>
            <small>3 quick steps</small>
          </summary>
          <div className="reading-guide-steps">
            <div><b>01</b><span><strong>Choose a step</strong><small>Click a node or use Previous / Next to move through the path.</small></span></div>
            <div><b>02</b><span><strong>Read the source</strong><small>The inspector keeps the symbol, location, and surrounding code beside the path.</small></span></div>
            <div><b>03</b><span><strong>Follow the context</strong><small>Open a connected path, request flow, or file when you need the next layer.</small></span></div>
          </div>
        </details>
        <PathCanvas
          items={items}
          title={securityPath ? "Witness path" : "Code path"}
          direction={direction}
          selectedId={stepId}
          selectedIndex={selectedIndex}
          onSelect={(id, index) => {
            const node = nodeById.get(id);
            setSelectedPosition(index);
            onPositionChange?.(index);
            setStepId(id);
            onInspectorOpen();
            if (node)
              onRecord(
                "Inspected node",
                node.label || node.id,
                nodeLocation(node),
              );
            trackEvent("trace_node_selected");
          }}
          layoutSource="derived"
        />
        <EvidencePanel
          evidence={evidence}
          fallbackTool="reaches"
          fallbackArgs={flowDisplayName(flow, app.nodes, app.flows)}
          fallbackSummary={`${countLabel(steps.length, securityPath ? "node" : "symbol")} visible in this graph path.`}
          nodeCount={steps.length}
          indirections={indirectionCount(flow, evidence)}
          variant={securityPath ? "evidence" : "path"}
        />
      </main>
      {inspectorOpen && (
        <NodeInspector
          node={selected}
          contextRole={items[selectedIndex]?.label}
          contextNote={items[selectedIndex]?.caption}
          contextOccurrence={items[selectedIndex]?.occurrenceId}
          app={app}
          onNode={(nextNodeId) => {
            const nextIndex = items.findIndex((item) => item.id === nextNodeId);
            if (nextIndex >= 0) {
              setSelectedPosition(nextIndex);
              onPositionChange?.(nextIndex);
              setStepId(nextNodeId);
              onRecord("Inspected nearby symbol", nodeById.get(nextNodeId)?.label || nextNodeId, nodeLocation(nodeById.get(nextNodeId)));
              trackEvent("trace_nearby_node_selected");
              return;
            }
            onView("map", nextNodeId);
          }}
          onFile={onFile}
          onFlow={openConnectedFlow}
          onEntry={onEntry}
          onClose={onInspectorClose}
        />
      )}
    </section>
  );
}
