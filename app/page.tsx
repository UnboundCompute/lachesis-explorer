"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header, type RecentBundle } from "../components/Header";
import { Intro } from "../components/Intro";
import { InstallView } from "../components/InstallView";
import { JourneyView } from "../components/JourneyView";
import { TraceView } from "../components/TraceView";
import { SinkView } from "../components/SinkView";
import { OverviewView, type OverviewMode, type OverviewNodeOrder } from "../components/OverviewView";
import { CompareView } from "../components/CompareView";
import { HomeView } from "../components/HomeView";
import { InvestigationContext } from "../components/InvestigationContext";
import { ResourceLinks } from "../components/ResourceLinks";
import { Icon } from "../components/Icon";
import { CommandPalette } from "../components/CommandPalette";
import { ShortcutHelp } from "../components/ShortcutHelp";
import {
  InvestigationTrail,
  type InvestigationEvent,
} from "../components/InvestigationTrail";
import { starter, normalize, type App, type Flow } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";
import { readLocal, removeLocal, writeLocal } from "../lib/storage";

type View =
  "home" | "trace" | "journey" | "investigate" | "map" | "compare" | "install";
type LoadState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};
type PendingLink = {
  view?: string;
  flow?: string;
  node?: string;
  direction?: string;
  entry?: string;
  hop?: string;
  stepOccurrence?: string;
  hopOccurrence?: string;
  stepIndex?: number;
  hopIndex?: number;
  sink?: string;
  filter?: string;
  mapMode?: string;
  mapOrder?: string;
};

const viewLabels: Record<View, string> = {
  home: "Briefing",
  trace: "Graph path",
  journey: "Request path",
  investigate: "Convergence",
  map: "Graph",
  compare: "Revision diff",
  install: "Local workflow",
};

function stepAtPosition(app: App, flowId: string, position: number, direction: "backward" | "forward") {
  const flow = app.flows.find((item) => item.id === flowId);
  if (!flow) return undefined;
  const steps = direction === "forward" ? [...flow.steps].reverse() : flow.steps;
  return steps[position];
}

function positionForFlow(app: App, flowId: string, nodeId: string, direction: "backward" | "forward") {
  const flow = app.flows.find((item) => item.id === flowId);
  if (!flow) return 0;
  const steps = direction === "forward" ? [...flow.steps].reverse() : flow.steps;
  const position = steps.findIndex((step) => step.node_id === nodeId);
  return position >= 0 ? position : 0;
}

function positionForEntry(app: App, entryIndex: number, nodeId: string) {
  const entry = app.entries[entryIndex];
  if (!entry) return 0;
  const position = entry.hops.findIndex((hop) => hop.node_id === nodeId);
  return position >= 0 ? position : 0;
}

function recommendedFlow(flows: Flow[]) {
  return [...flows].sort((a, b) => {
    const score = (flow: Flow) => {
      const roles = flow.steps.map((step) => step.role.trim().toLowerCase());
      const hasSource = Boolean(flow.sourceNodeId) || roles.some((role) => ["source", "origin"].includes(role));
      const hasSink = Boolean(flow.sinkNodeId) || roles.includes("sink");
      return (flow.steps.length > 1 ? 100 : 0) + (hasSource ? 20 : 0) + (hasSink ? 20 : 0) + flow.steps.length;
    };
    return score(b) - score(a);
  })[0];
}

function recommendedSink(app: App) {
  return [...app.nodes]
    .filter((node) => isSinkNode(app, node.id))
    .sort((a, b) => {
      const flowCount = (nodeId: string) => app.flows.filter((flow) => flow.steps.some((step) => step.node_id === nodeId)).length;
      const stepCount = (nodeId: string) => app.flows.reduce((total, flow) => total + flow.steps.filter((step) => step.node_id === nodeId).length, 0);
      return flowCount(b.id) - flowCount(a.id) || stepCount(b.id) - stepCount(a.id);
    })[0];
}

function isSinkNode(app: App, nodeId: string) {
  return app.nodes.some(
    (node) =>
      node.id === nodeId &&
      (node.kind === "sink" ||
          app.flows.some((flow) =>
          flow.steps.some((step) => step.node_id === nodeId && step.role.trim().toLowerCase() === "sink"),
        )),
  );
}

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [direction, setDirection] = useState<"backward" | "forward">(
    "backward",
  );
  const [app, setApp] = useState<App>(starter);
  const [compareApp, setCompareApp] = useState<App | null>(null);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(true);
  const [flowId, setFlowId] = useState(starter.flows[0].id);
  const [stepId, setStepId] = useState(starter.flows[0].steps[0].node_id);
  const [stepIndex, setStepIndex] = useState(0);
  const [entryIndex, setEntryIndex] = useState(0);
  const [hopId, setHopId] = useState(starter.entries[0].hops[0].node_id);
  const [hopIndex, setHopIndex] = useState(0);
  const [sinkId, setSinkId] = useState(
    recommendedSink(starter)?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const [mapMode, setMapMode] = useState<OverviewMode>("map");
  const [mapOrder, setMapOrder] = useState<OverviewNodeOrder>("path");
  const [loadState, setLoadState] = useState<LoadState>({
    type: "idle",
    message: "",
  });
  const [isDemo, setIsDemo] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const commandOpenerRef = useRef<HTMLElement | null>(null);
  const helpOpenerRef = useRef<HTMLElement | null>(null);
  const [focusNodeId, setFocusNodeId] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [recentBundles, setRecentBundles] = useState<RecentBundle[]>([]);
  const [activity, setActivity] = useState<InvestigationEvent[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const compareFileRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const previousView = useRef<View | null>(null);
  const dragDepth = useRef(0);
  const pendingLink = useRef<PendingLink | null>(null);
  const importBusy = useRef(false);
  const urlReady = useRef(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const record = useCallback(
    (action: string, target: string, detail: string) =>
      setActivity((current) =>
        [
          {
            id: Date.now() + Math.random(),
            action,
            target,
            detail,
            at: Date.now(),
          },
          ...current,
        ].slice(0, 20),
      ),
    [],
  );

  useEffect(() => {
    const stored = readLocal("lachesis-theme");
    if (stored === "light") setDark(false);
  }, []);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        readLocal("lachesis-recent-bundles") ?? "[]",
      );
      if (Array.isArray(stored))
        setRecentBundles(
          stored
            .filter(
              (item) =>
                item &&
                typeof item.name === "string" &&
                typeof item.loadedAt === "number",
            )
            .slice(0, 3),
        );
    } catch {
      removeLocal("lachesis-recent-bundles");
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    writeLocal("lachesis-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const bundle = app.name || "Untitled bundle";
    document.title = `${viewLabels[view]} · ${bundle} · Lachesis`;
  }, [app.name, view]);
  useEffect(() => {
    if (previousView.current === null) {
      previousView.current = view;
      return;
    }
    if (previousView.current !== view) {
      workspaceRef.current?.focus();
      previousView.current = view;
    }
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link: PendingLink = {
      view: params.get("view") ?? undefined,
      flow: params.get("flow") ?? undefined,
      node: params.get("node") ?? undefined,
      direction: params.get("direction") ?? undefined,
      entry: params.get("entry") ?? undefined,
      hop: params.get("hop") ?? undefined,
      stepOccurrence: params.get("step_occurrence") ?? undefined,
      hopOccurrence: params.get("hop_occurrence") ?? undefined,
      stepIndex: params.get("step_index") == null ? undefined : Number(params.get("step_index")),
      hopIndex: params.get("hop_index") == null ? undefined : Number(params.get("hop_index")),
      sink: params.get("sink") ?? undefined,
      filter: params.get("filter") ?? undefined,
      mapMode: params.get("map_mode") ?? undefined,
      mapOrder: params.get("map_order") ?? undefined,
    };
    if (params.get("sample") === "security") {
      pendingLink.current = link;
      setLoadState({ type: "loading", message: "Loading the security sample…" });
      fetch("/demo-bundle.json")
        .then((response) => {
          if (!response.ok) throw new Error("The security sample could not be loaded.");
          return response.json();
        })
        .then((raw) => activate(normalize(raw), true))
        .catch((error) => {
          pendingLink.current = null;
          urlReady.current = true;
          setLoadState({
            type: "error",
            message: `${error instanceof Error ? error.message : "Could not load the security sample"} The current bundle was kept.`,
          });
        });
      return;
    }
    if (params.get("scope") === "local") {
      pendingLink.current = link;
      setLoadState({
        type: "idle",
        message:
          "This link belongs to a local bundle. Load that bundle to restore its investigation state.",
      });
      return;
    }
    if (
      link.view === "home" ||
      link.view === "trace" ||
      link.view === "journey" ||
      link.view === "investigate" ||
      link.view === "map" ||
      link.view === "compare" ||
      link.view === "install"
    )
      setView(link.view);
    const flow = starter.flows.find((item) => item.id === link.flow);
    if (flow) {
      setFlowId(flow.id);
      if (link.node && flow.steps.some((step) => step.node_id === link.node))
        setStepId(link.node);
      const linkedSteps = link.direction === "forward" ? [...flow.steps].reverse() : flow.steps;
      const occurrenceIndex = link.stepOccurrence
        ? linkedSteps.findIndex((step) => step.id === link.stepOccurrence)
        : -1;
      const linkedStepIndex = occurrenceIndex >= 0 ? occurrenceIndex : link.stepIndex ?? -1;
      if (linkedStepIndex >= 0 && linkedStepIndex < linkedSteps.length && (!link.node || linkedSteps[linkedStepIndex]?.node_id === link.node)) {
        setStepId(linkedSteps[linkedStepIndex].node_id);
        setStepIndex(linkedStepIndex);
      }
    }
    const index = starter.entries.findIndex((item) => item.id === link.entry);
    if (index >= 0) {
      setEntryIndex(index);
      if (
        link.hop &&
        starter.entries[index].hops.some((item) => item.node_id === link.hop)
      )
        setHopId(link.hop);
      const occurrenceIndex = link.hopOccurrence
        ? starter.entries[index].hops.findIndex((hop) => hop.id === link.hopOccurrence)
        : -1;
      const linkedHopIndex = occurrenceIndex >= 0 ? occurrenceIndex : link.hopIndex ?? -1;
      if (linkedHopIndex >= 0 && linkedHopIndex < starter.entries[index].hops.length && (!link.hop || starter.entries[index].hops[linkedHopIndex]?.node_id === link.hop)) {
        setHopId(starter.entries[index].hops[linkedHopIndex].node_id);
        setHopIndex(linkedHopIndex);
      }
    }
    if (
      link.sink &&
      starter.nodes.some(
        (node) => node.id === link.sink && isSinkNode(starter, node.id),
      )
    )
      setSinkId(link.sink);
    if (link.direction === "forward") setDirection("forward");
    if (link.view === "trace") setQuery(link.filter ?? "");
    if (link.view === "map") setMapQuery(link.filter ?? "");
    if (link.mapMode && ["map", "architecture", "health"].includes(link.mapMode)) setMapMode(link.mapMode as OverviewMode);
    if (link.mapOrder && ["path", "centrality"].includes(link.mapOrder)) setMapOrder(link.mapOrder as OverviewNodeOrder);
    if (
      link.view === "map" &&
      link.node &&
      starter.nodes.some((node) => node.id === link.node)
    )
      setFocusNodeId(link.node);
    urlReady.current = true;
  }, []);

  useEffect(() => {
    if (!urlReady.current) return;
    const params = new URLSearchParams();
    params.set("view", view);
    if (!isDemo) params.set("scope", "local");
    if (view === "trace") {
      params.set("flow", flowId);
      params.set("node", stepId);
      params.set("direction", direction);
      params.set("step_index", String(stepIndex));
      if (query) params.set("filter", query);
      const occurrence = stepAtPosition(app, flowId, stepIndex, direction)?.id;
      if (occurrence) params.set("step_occurrence", occurrence);
    } else if (view === "journey") {
      params.set("entry", app.entries[entryIndex]?.id ?? "");
      params.set("hop", hopId);
      params.set("hop_index", String(hopIndex));
      const occurrence = app.entries[entryIndex]?.hops[hopIndex]?.id;
      if (occurrence) params.set("hop_occurrence", occurrence);
    } else if (view === "investigate" && sinkId) {
      params.set("sink", sinkId);
    } else if (view === "map") {
      if (focusNodeId) params.set("node", focusNodeId);
      if (mapQuery) params.set("filter", mapQuery);
      if (mapMode !== "map") params.set("map_mode", mapMode);
      if (mapOrder !== "path") params.set("map_order", mapOrder);
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [app, direction, entryIndex, focusNodeId, flowId, hopId, hopIndex, isDemo, mapMode, mapOrder, mapQuery, query, sinkId, stepId, stepIndex, view]);

  useEffect(() => {
    function restoreFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const nextView = params.get("view");
      if (nextView && ["home", "trace", "journey", "investigate", "map", "compare", "install"].includes(nextView))
        setView(nextView as View);
      const linkedFlow = app.flows.find((item) => item.id === params.get("flow"));
      if (linkedFlow) {
        const linkedSteps = params.get("direction") === "forward" ? [...linkedFlow.steps].reverse() : linkedFlow.steps;
        const occurrenceIndex = params.get("step_occurrence")
          ? linkedSteps.findIndex((step) => step.id === params.get("step_occurrence"))
          : -1;
        const requestedIndex = params.get("step_index") == null ? -1 : Number(params.get("step_index"));
        const linkedStepIndex = occurrenceIndex >= 0 ? occurrenceIndex : requestedIndex;
        if (linkedStepIndex >= 0 && linkedStepIndex < linkedSteps.length) {
          setFlowId(linkedFlow.id);
          setStepId(linkedSteps[linkedStepIndex].node_id);
          setStepIndex(linkedStepIndex);
        }
      }
      if (nextView === "trace") setQuery(params.get("filter") ?? "");
      else setQuery("");
      if (nextView === "map") setMapQuery(params.get("filter") ?? "");
      else setMapQuery("");
      const nextMapMode = params.get("map_mode");
      setMapMode(nextMapMode && ["map", "architecture", "health"].includes(nextMapMode) ? nextMapMode as OverviewMode : "map");
      const nextMapOrder = params.get("map_order");
      setMapOrder(nextMapOrder === "centrality" ? "centrality" : "path");
      const linkedEntry = app.entries.findIndex((item) => item.id === params.get("entry"));
      if (linkedEntry >= 0) {
        const hops = app.entries[linkedEntry].hops;
        const occurrenceIndex = params.get("hop_occurrence")
          ? hops.findIndex((hop) => hop.id === params.get("hop_occurrence"))
          : -1;
        const requestedIndex = params.get("hop_index") == null ? -1 : Number(params.get("hop_index"));
        const linkedHopIndex = occurrenceIndex >= 0 ? occurrenceIndex : requestedIndex;
        if (linkedHopIndex >= 0 && linkedHopIndex < hops.length) {
          setEntryIndex(linkedEntry);
          setHopId(hops[linkedHopIndex].node_id);
          setHopIndex(linkedHopIndex);
        }
      }
      const linkedSink = params.get("sink");
      if (linkedSink && isSinkNode(app, linkedSink))
        setSinkId(linkedSink);
      const linkedNode = params.get("node");
      if (nextView === "map" && linkedNode && app.nodes.some((node) => node.id === linkedNode))
        setFocusNodeId(linkedNode);
      else setFocusNodeId("");
      setDirection(params.get("direction") === "forward" ? "forward" : "backward");
    }
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, [app]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const editing = target.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      const inDialog = Boolean(target.closest('[role="dialog"]'));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commandOpenerRef.current = document.activeElement as HTMLElement | null;
        setCommandOpen((open) => !open);
        return;
      }
      if (event.key === "?" && !editing && !inDialog && !commandOpen && !menu) {
        event.preventDefault();
        helpOpenerRef.current = document.activeElement as HTMLElement | null;
        setHelpOpen(true);
        return;
      }
      if (event.key === "Escape") {
        const inspectorHasFocus = Boolean(
          (document.activeElement as HTMLElement | null)?.closest(
            ".detail-panel",
          ),
        );
        const trailOpen = Boolean(
          document.querySelector('[role="dialog"][aria-label="Investigation trail"]'),
        );
        setCommandOpen(false);
        setHelpOpen(false);
        setMenu(false);
        if (!commandOpen && !helpOpen && !menu && !trailOpen) {
          setInspectorOpen(false);
          if (inspectorHasFocus)
            window.requestAnimationFrame(() => {
              const sourceTrigger = document.querySelector<HTMLButtonElement>('[aria-controls="source-inspector"]');
              if (sourceTrigger) sourceTrigger.focus();
              else document.querySelector<HTMLButtonElement>(".inspector-reopen")?.focus();
            });
        }
        dragDepth.current = 0;
        setDragActive(false);
        return;
      }
      if (editing || inDialog) return;
      if (event.key === "/" && view === "trace") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".search input")?.focus();
      }
      if (view === "trace" && event.key === "ArrowLeft") {
        setDirection("backward");
        record("Changed direction", flowId, "comes from");
        trackEvent("trace_direction_changed", {
          direction: "backward",
          source: "keyboard",
        });
      }
      if (view === "trace" && event.key === "ArrowRight") {
        setDirection("forward");
        record("Changed direction", flowId, "goes to");
        trackEvent("trace_direction_changed", {
          direction: "forward",
          source: "keyboard",
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, flowId, record, commandOpen, helpOpen, menu]);

  function changeView(next: View) {
    if (next !== view && urlReady.current) {
      const params = new URLSearchParams(window.location.search);
      params.set("view", next);
      window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
    setView(next);
    record("Changed lens", viewLabels[next], "");
  }

  function changeMapMode(next: OverviewMode) {
    if (next !== mapMode && urlReady.current && view === "map") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "map");
      if (next === "map") params.delete("map_mode");
      else params.set("map_mode", next);
      window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
    setMapMode(next);
    record("Changed graph lens", next === "map" ? "Topology" : next === "architecture" ? "Architecture" : "Health", "");
    trackEvent("graph_lens_changed", { lens: next });
  }

  function changeMapOrder(next: OverviewNodeOrder) {
    if (next !== mapOrder && urlReady.current && view === "map") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "map");
      if (next === "path") params.delete("map_order");
      else params.set("map_order", next);
      window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
    setMapOrder(next);
  }

  async function copyInvestigationLink(params: Record<string, string>) {
    const url = new URL(window.location.href);
    url.search = "";
    if (isDemo) {
      const securityMode = app.findings.length > 0 || app.bundle.projection === "security projection";
      if (securityMode) url.searchParams.set("sample", "security");
    } else {
      url.searchParams.set("scope", "local");
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    try {
      await copyText(url.toString());
      setLoadState({ type: "success", message: "Investigation link copied." });
      trackEvent("investigation_link_copied", {
        view: params.view ?? "unknown",
      });
      return true;
    } catch {
      setLoadState({
        type: "error",
        message:
          "Could not copy the link. Your browser may block clipboard access.",
      });
      return false;
    }
  }

  function activate(next: App, demo = false) {
    const pending = pendingLink.current;
    const firstSink = recommendedSink(next)?.id ?? "";
    const firstFlow = recommendedFlow(next.flows);
    setApp(next);
    setCompareApp(null);
    setFlowId(firstFlow?.id ?? "");
    const initialStepId = firstFlow?.sourceNodeId ?? firstFlow?.steps[0]?.node_id ?? next.nodes[0]?.id ?? "";
    setStepId(initialStepId);
    setStepIndex(firstFlow ? positionForFlow(next, firstFlow.id, initialStepId, "backward") : 0);
    setEntryIndex(0);
    setHopId(next.entries[0]?.hops[0]?.node_id ?? next.nodes[0]?.id ?? "");
    setHopIndex(0);
    setSinkId(firstSink);
    setDirection("backward");
    setQuery("");
    setMapQuery("");
    setFocusNodeId("");
    let restored = false;
    if (pending) {
      if (
        pending.view === "home" ||
        pending.view === "trace" ||
        pending.view === "journey" ||
        pending.view === "investigate" ||
        pending.view === "map" ||
        pending.view === "compare" ||
        pending.view === "install"
      )
        setView(pending.view);
      const linkedFlow = next.flows.find((flow) => flow.id === pending.flow);
      if (linkedFlow) {
        setFlowId(linkedFlow.id);
        setStepId(
          pending.node &&
            linkedFlow.steps.some((step) => step.node_id === pending.node)
            ? pending.node
            : (linkedFlow.steps[0]?.node_id ?? ""),
        );
        const linkedSteps = pending.direction === "forward" ? [...linkedFlow.steps].reverse() : linkedFlow.steps;
        const occurrenceIndex = pending.stepOccurrence
          ? linkedSteps.findIndex((step) => step.id === pending.stepOccurrence)
          : -1;
        const linkedStepIndex = occurrenceIndex >= 0 ? occurrenceIndex : pending.stepIndex ?? -1;
        if (linkedStepIndex >= 0 && linkedStepIndex < linkedSteps.length && (!pending.node || linkedSteps[linkedStepIndex]?.node_id === pending.node)) {
          setStepId(linkedSteps[linkedStepIndex].node_id);
          setStepIndex(linkedStepIndex);
        }
        restored = true;
      }
      const linkedEntry = next.entries.findIndex(
        (entry) => entry.id === pending.entry,
      );
      if (linkedEntry >= 0) {
        setEntryIndex(linkedEntry);
        setHopId(
          pending.hop &&
            next.entries[linkedEntry].hops.some(
              (hop) => hop.node_id === pending.hop,
            )
            ? pending.hop
            : (next.entries[linkedEntry].hops[0]?.node_id ?? next.nodes[0].id),
        );
        const occurrenceIndex = pending.hopOccurrence
          ? next.entries[linkedEntry].hops.findIndex((hop) => hop.id === pending.hopOccurrence)
          : -1;
        const linkedHopIndex = occurrenceIndex >= 0 ? occurrenceIndex : pending.hopIndex ?? -1;
        if (linkedHopIndex >= 0 && linkedHopIndex < next.entries[linkedEntry].hops.length && (!pending.hop || next.entries[linkedEntry].hops[linkedHopIndex]?.node_id === pending.hop)) {
          setHopId(next.entries[linkedEntry].hops[linkedHopIndex].node_id);
          setHopIndex(linkedHopIndex);
        }
        restored = true;
      }
      if (
        pending.view === "map" &&
        pending.node &&
        next.nodes.some((node) => node.id === pending.node)
      ) {
        setFocusNodeId(pending.node);
        restored = true;
      }
      if (pending.sink && next.nodes.some((node) => node.id === pending.sink)) {
        setSinkId(pending.sink);
        restored = true;
      }
      if (pending.view === "install" || pending.view === "map") restored = true;
      if (pending.direction === "forward") setDirection("forward");
      if (pending.view === "trace") setQuery(pending.filter ?? "");
      if (pending.view === "map") setMapQuery(pending.filter ?? "");
      if (pending.view === "map" && pending.mapMode && ["map", "architecture", "health"].includes(pending.mapMode)) setMapMode(pending.mapMode as OverviewMode);
      if (pending.view === "map") setMapOrder(pending.mapOrder === "centrality" ? "centrality" : "path");
      pendingLink.current = null;
    }
    urlReady.current = true;
    setMenu(false);
    setInspectorOpen(true);
    setIsDemo(demo);
    setActivity([]);
    setLoadState({
      type: restored || !pending ? "success" : "error",
      message: restored
        ? `Loaded ${next.name || "bundle.json"} and restored the local investigation link.`
        : pending
          ? `Loaded ${next.name || "bundle.json"}, but its linked evidence IDs were not found. Opened the first available evidence.`
          : `Loaded ${next.name || "bundle.json"}.`,
    });
    const recent: RecentBundle = {
      name: next.name || "Untitled bundle",
      language: next.language || "unknown",
      commit: next.commit || "no commit",
      lines: next.lines,
      flows: next.flows.length,
      loadedAt: Date.now(),
    };
    setRecentBundles((current) => {
      const updated = [
        recent,
        ...current.filter(
          (item) =>
            `${item.name}:${item.commit}` !== `${recent.name}:${recent.commit}`,
        ),
      ].slice(0, 3);
      writeLocal(
        "lachesis-recent-bundles",
        JSON.stringify(updated),
      );
      return updated;
    });
    record(
      "Loaded bundle",
      next.name || "Untitled bundle",
      `${next.nodes.length} nodes · ${next.flows.length} flows`,
    );
    trackEvent("bundle_loaded", {
      has_callpaths: next.entries.length > 0,
      flow_count: next.flows.length,
    });
  }

  async function upload(file?: File) {
    if (!file) return;
    if (importBusy.current) return;
    importBusy.current = true;
    setLoadState({ type: "loading", message: `Reading ${file.name}…` });
    try {
      const text = await file.text();
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error("This file is not valid JSON.");
      }
      activate(normalize(raw));
    } catch (error) {
      setLoadState({
        type: "error",
        message: `${error instanceof Error ? error.message : "Could not read bundle.json"} The current bundle was kept.`,
      });
      trackEvent("bundle_load_failed");
    } finally {
      importBusy.current = false;
      setDragActive(false);
    }
  }

  async function loadCodeSample() {
    if (importBusy.current) return;
    importBusy.current = true;
    setLoadState({
      type: "loading",
      message: "Reading the code exploration sample…",
    });
    setIsDemo(true);
    try {
      const response = await fetch("/code-exploration-bundle.json");
      if (!response.ok)
        throw new Error("The code exploration sample could not be loaded.");
      activate(normalize(await response.json()), true);
    } catch (error) {
      setLoadState({
        type: "error",
        message: `${error instanceof Error ? error.message : "Could not load the code exploration sample"} The current bundle was kept.`,
      });
      trackEvent("bundle_load_failed");
    } finally {
      importBusy.current = false;
    }
  }

  async function loadSecuritySample() {
    if (importBusy.current) return;
    importBusy.current = true;
    setLoadState({
      type: "loading",
      message: "Reading the security sample…",
    });
    setIsDemo(true);
    try {
      const response = await fetch("/demo-bundle.json");
      if (!response.ok)
        throw new Error("The security sample could not be loaded.");
      activate(normalize(await response.json()), true);
    } catch (error) {
      setLoadState({
        type: "error",
        message: `${error instanceof Error ? error.message : "Could not load the security sample"} The current bundle was kept.`,
      });
      trackEvent("bundle_load_failed");
    } finally {
      importBusy.current = false;
    }
  }

  async function uploadComparison(file?: File) {
    if (!file) return;
    if (importBusy.current) return;
    importBusy.current = true;
    try {
      const raw = JSON.parse(await file.text());
      setCompareApp(normalize(raw));
      changeView("compare");
      setLoadState({
        type: "success",
        message: `Loaded ${file.name} as the comparison bundle.`,
      });
      record("Loaded comparison bundle", file.name, "active bundle kept");
      trackEvent("comparison_bundle_loaded");
    } catch (error) {
      setLoadState({
        type: "error",
        message: `${error instanceof Error ? error.message : "Could not read comparison bundle"} The active bundle was kept.`,
      });
      trackEvent("comparison_bundle_load_failed");
    } finally {
      importBusy.current = false;
      if (compareFileRef.current) compareFileRef.current.value = "";
    }
  }

  return (
    <div
      className="app-shell"
      id="top"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDragEnd={() => {
        dragDepth.current = 0;
        setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        upload(event.dataTransfer.files?.[0]);
      }}
    >
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <Header
        view={view}
        setView={changeView}
        app={app}
        menu={menu}
        setMenu={setMenu}
        onUpload={() => fileRef.current?.click()}
        onCommand={() => {
          commandOpenerRef.current = document.activeElement as HTMLElement | null;
          setCommandOpen(true);
        }}
        dark={dark}
        setDark={setDark}
        recentBundles={recentBundles}
      />
      <input
        id="bundle-upload"
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={compareFileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => uploadComparison(event.target.files?.[0])}
      />
      {commandOpen && (
        <CommandPalette
          app={app}
          opener={commandOpenerRef.current}
          onClose={() => setCommandOpen(false)}
          onView={changeView}
          onFlow={(nextFlow, nextNode) => {
            changeView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
            record("Opened graph path", nextFlow, "via command palette");
          }}
          onEntry={(nextIndex, nextHop) => {
            changeView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
            record(
              "Opened request path",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "via command palette",
            );
          }}
          onSink={(nextSink) => {
            changeView("investigate");
            setSinkId(nextSink);
            record(
              "Focused sink",
              app.nodes.find((node) => node.id === nextSink)?.label ?? nextSink,
              "via command palette",
            );
          }}
          onNode={(nextNode) => {
            setFocusNodeId(nextNode);
            changeView("map");
            setInspectorOpen(true);
            record(
              "Inspected graph node",
              app.nodes.find((node) => node.id === nextNode)?.label ?? nextNode,
              "via command palette",
            );
          }}
        />
      )}
      {helpOpen && (
        <ShortcutHelp opener={helpOpenerRef.current} onClose={closeHelp} />
      )}
      {dragActive && (
        <div className="drop-overlay" role="presentation">
          <div>
            <span className="drop-glyph">
              <Icon name="upload" size={22} />
            </span>
            <b>Drop bundle.json to inspect</b>
            <small>
              Your current bundle changes only after validation succeeds.
            </small>
          </div>
        </div>
      )}
      <div
        ref={workspaceRef}
        id="workspace-content"
        tabIndex={-1}
        role="region"
        aria-label={`${viewLabels[view]} workspace`}
      >
      {view !== "home" && (
        <Intro
          view={view as Exclude<View, "home">}
          app={app}
          loadState={loadState}
          isDemo={isDemo}
          onUpload={() => fileRef.current?.click()}
        />
      )}
      {view === "home" && (
        <HomeView
          app={app}
          isDemo={isDemo}
          loadState={loadState}
          onUpload={() => fileRef.current?.click()}
          onLoadSample={loadCodeSample}
          onLoadSecuritySample={loadSecuritySample}
          onView={(next) => changeView(next)}
          direction={direction}
          onFlow={(nextFlow, nextNode) => {
            changeView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
            record("Opened priority witness", nextFlow, "from briefing");
          }}
          onSink={(nextSink) => {
            changeView("investigate");
            setSinkId(nextSink);
            record("Focused execution boundary", nextSink, "from briefing");
          }}
          onEntry={(nextIndex, nextHop) => {
            changeView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
            record(
              "Opened request path",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "from briefing",
            );
          }}
        />
      )}
      <InvestigationContext
        app={app}
        view={view}
        onHome={() => changeView("home")}
        flowId={flowId}
        stepId={stepId}
        stepIndex={stepIndex}
        entryIndex={entryIndex}
        hopId={hopId}
        hopIndex={hopIndex}
        sinkId={sinkId}
        focusNodeId={focusNodeId}
      />
      {view === "trace" && (
        <TraceView
          app={app}
          flowId={flowId}
          setFlowId={setFlowId}
          stepId={stepId}
          setStepId={setStepId}
          query={query}
          setQuery={setQuery}
          direction={direction}
          setDirection={setDirection}
          position={stepIndex}
          onPositionChange={setStepIndex}
          inspectorOpen={inspectorOpen}
          onInspectorOpen={() => setInspectorOpen(true)}
          onInspectorClose={() => setInspectorOpen(false)}
          onRecord={record}
          onView={(next: "journey" | "map", nextNode) => {
            if (next === "map" && nextNode) setFocusNodeId(nextNode);
            changeView(next);
          }}
          onShare={(position) =>
            copyInvestigationLink({
              view: "trace",
              flow: flowId,
              node: stepId,
              direction,
              filter: query,
              step_occurrence: stepAtPosition(app, flowId, position, direction)?.id ?? "",
              step_index: String(position),
            })
          }
          onFlow={(nextFlow, nextNode) => {
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
          }}
          onEntry={(nextIndex, nextHop) => {
            changeView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
          }}
        />
      )}
      {view === "journey" && (
        <JourneyView
          app={app}
          entryIndex={entryIndex}
          setEntryIndex={setEntryIndex}
          hopId={hopId}
          setHopId={setHopId}
          position={hopIndex}
          onPositionChange={setHopIndex}
          inspectorOpen={inspectorOpen}
          onInspectorOpen={() => setInspectorOpen(true)}
          onInspectorClose={() => setInspectorOpen(false)}
          onRecord={record}
          onView={(next: "trace" | "map", nextNode) => {
            if (next === "map" && nextNode) setFocusNodeId(nextNode);
            changeView(next);
          }}
          onShare={(position) =>
            copyInvestigationLink({
              view: "journey",
              entry: app.entries[entryIndex]?.id ?? "",
              hop: hopId,
              hop_occurrence: app.entries[entryIndex]?.hops[position]?.id ?? "",
              hop_index: String(position),
            })
          }
          onFlow={(nextFlow, nextNode) => {
            changeView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
          }}
          onEntry={(nextIndex, nextHop) => {
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
          }}
        />
      )}
      {view === "investigate" && (
        <SinkView
          app={app}
          sinkId={sinkId}
          setSinkId={setSinkId}
          onRecord={record}
          onEntry={(nextIndex, nextNode) => {
            changeView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextNode);
            setHopIndex(positionForEntry(app, nextIndex, nextNode));
            setInspectorOpen(true);
            record(
              "Opened connected request path",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "from convergence inspector",
            );
          }}
          onOpenFlow={(nextFlow, nextNode, originalPosition) => {
            changeView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            const selectedFlow = app.flows.find((flow) => flow.id === nextFlow);
            const selectedPosition = originalPosition == null || !selectedFlow
              ? positionForFlow(app, nextFlow, nextNode, direction)
              : direction === "forward"
                ? selectedFlow.steps.length - 1 - originalPosition
                : originalPosition;
            setStepIndex(selectedPosition);
            setInspectorOpen(true);
          }}
          onView={(next, nextNode) => {
            if (next === "map" && nextNode) setFocusNodeId(nextNode);
            changeView(next);
          }}
          onShare={(nextSink) =>
            copyInvestigationLink({ view: "investigate", sink: nextSink })
          }
        />
      )}
      {view === "map" && (
        <OverviewView
          app={app}
          mode={mapMode}
          setMode={changeMapMode}
          nodeOrder={mapOrder}
          setNodeOrder={changeMapOrder}
          query={mapQuery}
          setQuery={setMapQuery}
          focusNodeId={focusNodeId}
          onFocusNode={setFocusNodeId}
          onRecord={record}
          onShare={(nodeId) =>
            copyInvestigationLink({ view: "map", node: nodeId, filter: mapQuery, map_mode: mapMode, map_order: mapOrder })
          }
          onFlow={(nextFlow, nextNode) => {
            changeView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
            record("Opened connected graph path", nextFlow, "from graph");
          }}
          onEntry={(nextIndex, nextHop) => {
            changeView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
            record(
              "Opened connected request path",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "from graph",
            );
          }}
        />
      )}
      {view === "compare" && (
        <div role="main" aria-label="Revision comparison">
          <CompareView
            base={app}
            compare={compareApp}
            onUpload={() => compareFileRef.current?.click()}
            onOpenFlow={(nextFlow, nextNode) => {
              changeView("trace");
              setFlowId(nextFlow);
              setStepId(nextNode);
              setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
              setInspectorOpen(true);
              record("Opened changed graph path", nextFlow, "from revision diff");
            }}
          />
        </div>
      )}
      {view === "install" && (
        <InstallView onUpload={() => fileRef.current?.click()} />
      )}
      </div>
      <ResourceLinks />
      <InvestigationTrail
        app={app}
        items={activity}
        onClear={() => setActivity([])}
      />
      <footer>
        <span>
          <i className="status-dot" /> Active bundle: <b>{app.name}</b>
        </span>
        <span>
          Shortcuts: <b>⌘K</b> jump · <b>/</b> search · <b>← →</b> direction ·{" "}
          <b>[ ]</b> step ·{" "}
          <b>Esc</b> close · <button className="footer-help" type="button" onClick={() => { helpOpenerRef.current = document.activeElement as HTMLElement | null; setHelpOpen(true); }}> <b>?</b> keyboard help</button>
        </span>
        <span className="footer-brand">Lachesis · graph reader</span>
      </footer>
    </div>
  );
}
