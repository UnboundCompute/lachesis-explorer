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
import { countLabel, isSecurityProjection, recommendedFlow, starter, normalize, type App } from "../lib/lachesis";
import { trackEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";
import { readLocal, removeLocal, writeLocal } from "../lib/storage";
import { cancelHostedBuild, getHostedBuildStatus, HostedRequestError, loadHostedBundle, loadHostedRepository, submitHostedBuild, type BuildResponse, type RepositoryIndex } from "../lib/hosted-bundle";

type View =
  "home" | "trace" | "journey" | "investigate" | "map" | "compare" | "install";
type LoadState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};
type PendingLink = {
  repository?: string;
  revision?: string;
  region?: string;
  label?: string;
  anchor?: string;
  domain?: string;
  step?: string;
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
  mapNeighborhood?: boolean;
};
type ViewUrlOverrides = Record<string, string | undefined>;
type BuildState = { status: "idle" | BuildResponse["status"]; steps: Array<{ key: string; state: string }>; message?: string };
type HandoffContext = Pick<PendingLink, "repository" | "revision" | "region" | "label" | "anchor" | "flow" | "step" | "domain">;

const viewLabels: Record<View, string> = {
  home: "Understand",
  trace: "Trace",
  journey: "Request flow",
  investigate: "What reaches here",
  map: "Explore",
  compare: "Compare",
  install: "Setup",
};

function bundleImportError(error: unknown, subject: string, kept: string) {
  const detail = error instanceof Error ? error.message : `Could not read ${subject}`;
  const jsonError = detail === "This file is not valid JSON." || detail.includes("Unexpected token") || detail.includes("Unexpected end of JSON input");
  const guidance = jsonError
    ? "Fix the JSON syntax and try again."
    : "Check docs/GRAPH_EXPLORER_CONTRACT.md for the required bundle shape.";
  return `${detail} ${guidance} ${kept}`;
}

function bundleLoadSummary(next: App) {
  const counts = `${countLabel(next.nodes.length, "node")} · ${countLabel(next.flows.length, "path")} · ${countLabel(next.edges.length, "relationship")}`;
  const indexed = next.coverage.indexedNodes;
  const scope = indexed != null && indexed > next.nodes.length
    ? ` Showing a focused projection of ${indexed.toLocaleString()} indexed nodes.`
    : "";
  return `${counts}.${scope}`;
}

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

function recommendedSink(app: App) {
  return [...app.nodes]
    .filter((node) => isSinkNode(app, node.id))
    .sort((a, b) => {
      const flowCount = (nodeId: string) => app.flows.filter((flow) => flow.steps.some((step) => step.node_id === nodeId)).length;
      const stepCount = (nodeId: string) => app.flows.reduce((total, flow) => total + flow.steps.filter((step) => step.node_id === nodeId).length, 0);
      return flowCount(b.id) - flowCount(a.id) || stepCount(b.id) - stepCount(a.id);
    })[0];
}

function nodeForHandoff(app: App, anchor?: string, region?: string) {
  const needle = (anchor || region || '').trim().toLowerCase();
  if (!needle) return undefined;
  return app.nodes.find((node) => [node.id, node.label, node.qualifiedName, node.signature, node.file, node.scope?.label, node.scope?.module]
    .filter(Boolean)
    .some((value) => value!.trim().toLowerCase() === needle));
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
  const [mapNeighborhoodOnly, setMapNeighborhoodOnly] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({
    type: "idle",
    message: "",
  });
  const [isDemo, setIsDemo] = useState(true);
  const [bundleOrigin, setBundleOrigin] = useState<"sample" | "local" | "hosted">("sample");
  const [hostedBundleId, setHostedBundleId] = useState<string | undefined>();
  const [repositoryIndex, setRepositoryIndex] = useState<RepositoryIndex | null>(null);
  const [buildState, setBuildState] = useState<BuildState>({ status: "idle", steps: [] });
  const [dragActive, setDragActive] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const commandOpenerRef = useRef<HTMLElement | null>(null);
  const helpOpenerRef = useRef<HTMLElement | null>(null);
  const [focusNodeId, setFocusNodeId] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [recentBundles, setRecentBundles] = useState<RecentBundle[]>([]);
  const [activity, setActivity] = useState<InvestigationEvent[]>([]);
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [handoffContext, setHandoffContext] = useState<HandoffContext>({});
  const [navigation, setNavigation] = useState({ canBack: false, canForward: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const compareFileRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const previousView = useRef<View | null>(null);
  const dragDepth = useRef(0);
  const pendingLink = useRef<PendingLink | null>(null);
  const importBusy = useRef(false);
  const buildController = useRef<AbortController | null>(null);
  const activeJobId = useRef<string | null>(null);
  const urlReady = useRef(false);
  const navigationDepth = useRef(0);
  const navigationMaxDepth = useRef(0);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => () => {
    buildController.current?.abort();
  }, []);

  function initializeNavigation() {
    const state = window.history.state;
    const depth = state?.lachesis === true && Number.isFinite(state.depth) ? state.depth : 0;
    navigationDepth.current = depth;
    navigationMaxDepth.current = depth;
    setNavigation({ canBack: depth > 0, canForward: false });
    window.history.replaceState({ ...(state ?? {}), lachesis: true, depth }, "", window.location.href);
  }

  function pushNavigation(params: URLSearchParams) {
    const depth = navigationDepth.current + 1;
    navigationDepth.current = depth;
    navigationMaxDepth.current = depth;
    setNavigation({ canBack: true, canForward: false });
    window.history.pushState({ lachesis: true, depth }, "", `${window.location.pathname}?${params.toString()}`);
  }

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
    if (readLocal("lachesis-theme") === "light") setDark(false);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    writeLocal("lachesis-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (loadState.type !== "error") return;
    let settleFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(() => {
        const alert = document.querySelector<HTMLElement>('[role="alert"]');
        if (!alert) return;
        const top = alert.getBoundingClientRect().top + window.scrollY;
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, Math.max(0, top - 120));
        root.style.scrollBehavior = previousScrollBehavior;
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settleFrame);
    };
  }, [loadState.type]);
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
      previousView.current = view;
      const frame = window.requestAnimationFrame(() => {
        workspaceRef.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "auto" });
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: "auto" });
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link: PendingLink = {
      repository: params.get("repository") ?? undefined,
      revision: params.get("revision") ?? undefined,
      region: params.get("region") ?? undefined,
      label: params.get("label") ?? undefined,
      anchor: params.get("anchor") ?? undefined,
      domain: params.get("domain") ?? undefined,
      step: params.get("step_context") ?? params.get("step") ?? undefined,
      view: params.get("view") ?? undefined,
      flow: params.get("flow_context") ?? params.get("flow") ?? undefined,
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
      mapNeighborhood: params.get("map_focus") === "neighborhood",
    };
    setHandoffContext({
      repository: link.repository,
      revision: link.revision,
      region: link.region,
      label: link.label,
      anchor: link.anchor,
      flow: link.flow,
      step: link.step,
      domain: link.domain,
    });
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
          setUrlInitialized(true);
          setLoadState({
            type: "error",
            message: `${error instanceof Error ? error.message : "Could not load the security sample"} The current bundle was kept.`,
          });
        });
      return;
    }
    const hostedBundleId = params.get("bundle");
    if (hostedBundleId) {
      pendingLink.current = link;
      setLoadState({ type: "loading", message: "Loading the hosted bundle…" });
      const controller = new AbortController();
      loadHostedBundle(hostedBundleId, controller.signal)
        .then((raw) => activate(normalize(raw), false, "hosted", hostedBundleId))
        .catch((error) => {
          if (controller.signal.aborted) return;
          pendingLink.current = null;
          urlReady.current = true;
          setUrlInitialized(true);
          setLoadState({
            type: "error",
            message: `${error instanceof Error ? error.message : "Could not load the hosted bundle"} The current bundle was kept.`,
          });
          trackEvent("bundle_load_failed");
        });
      return () => controller.abort();
    }
    const routeParts = window.location.pathname.split("/").filter(Boolean);
    const repositoryRoute = routeParts[0] === "r" && (routeParts.length === 3 || routeParts.length === 4)
      ? routeParts
      : null;
    if (repositoryRoute) {
      const host = repositoryRoute.length === 3 ? "github.com" : repositoryRoute[1];
      const owner = repositoryRoute.length === 3 ? repositoryRoute[1] : repositoryRoute[2];
      const revisionPart = repositoryRoute.length === 3 ? repositoryRoute[2] : repositoryRoute[3];
      const at = revisionPart.indexOf("@");
      const repo = at >= 0 ? revisionPart.slice(0, at) : revisionPart;
      const revision = at >= 0 ? revisionPart.slice(at + 1) : undefined;
      const repository = `${owner}/${repo}`;
      const routeLink = { ...link, repository, revision };
      pendingLink.current = routeLink;
      setHandoffContext({ ...routeLink, repository, revision });
      setLoadState({ type: "loading", message: `Resolving ${repository}…` });
      const controller = new AbortController();
      loadHostedRepository(host, owner, repo, revision, controller.signal)
        .then(async (index) => {
          setRepositoryIndex(index);
          pendingLink.current = { ...routeLink, repository: index.repository?.replace(`${host}/`, "") || repository, revision: index.revision || revision };
          setHandoffContext({ ...routeLink, repository: index.repository?.replace(`${host}/`, "") || repository, revision: index.revision || revision });
          const raw = await loadHostedBundle(index.bundle_id, controller.signal);
          activate(normalize(raw), false, "hosted", index.bundle_id);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          pendingLink.current = null;
          urlReady.current = true;
          setUrlInitialized(true);
          setLoadState({
            type: "error",
            message: `${error instanceof Error ? error.message : "Could not load the repository"} The current bundle was kept.`,
          });
          trackEvent("repository_route_load_failed");
        });
      return () => controller.abort();
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
      const nodeIndex = link.node ? linkedSteps.findIndex((step) => step.node_id === link.node) : -1;
      const linkedStepIndex = occurrenceIndex >= 0 ? occurrenceIndex : link.stepIndex ?? nodeIndex;
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
      const hopIndex = link.hop ? starter.entries[index].hops.findIndex((hop) => hop.node_id === link.hop) : -1;
      const linkedHopIndex = occurrenceIndex >= 0 ? occurrenceIndex : link.hopIndex ?? hopIndex;
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
    if (link.view === "map") {
      setMapMode(link.mapMode && ["map", "architecture", "health"].includes(link.mapMode)
        ? link.mapMode as OverviewMode
        : "map");
    }
    if (link.mapOrder && ["path", "centrality"].includes(link.mapOrder)) setMapOrder(link.mapOrder as OverviewNodeOrder);
    setMapNeighborhoodOnly(Boolean(link.mapNeighborhood));
    if (
      link.view === "map" &&
      link.node &&
      starter.nodes.some((node) => node.id === link.node)
    )
      setFocusNodeId(link.node);
    initializeNavigation();
    urlReady.current = true;
    setUrlInitialized(true);
  }, []);

  useEffect(() => {
    if (!urlInitialized) return;
    const params = new URLSearchParams();
    if (handoffContext.repository) params.set("repository", handoffContext.repository);
    if (handoffContext.revision) params.set("revision", handoffContext.revision);
    if (handoffContext.region) params.set("region", handoffContext.region);
    if (handoffContext.label) params.set("label", handoffContext.label);
    if (handoffContext.anchor) params.set("anchor", handoffContext.anchor);
    if (handoffContext.flow) params.set("flow_context", handoffContext.flow);
    if (handoffContext.step) params.set("step_context", handoffContext.step);
    if (handoffContext.domain) params.set("domain", handoffContext.domain);
    params.set("view", view);
    const securityMode = isSecurityProjection(app);
    if (bundleOrigin === "hosted" && hostedBundleId) params.set("bundle", hostedBundleId);
    else if (!isDemo) params.set("scope", "local");
    if (isDemo && securityMode) params.set("sample", "security");
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
      if (mapNeighborhoodOnly) params.set("map_focus", "neighborhood");
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
  }, [app, bundleOrigin, direction, entryIndex, focusNodeId, handoffContext, flowId, hostedBundleId, hopId, hopIndex, isDemo, mapMode, mapNeighborhoodOnly, mapOrder, mapQuery, query, sinkId, stepId, stepIndex, urlInitialized, view]);

  useEffect(() => {
    function restoreFromUrl() {
      const state = window.history.state;
      if (state?.lachesis === true && Number.isFinite(state.depth)) {
        navigationDepth.current = state.depth;
        setNavigation({ canBack: state.depth > 0, canForward: state.depth < navigationMaxDepth.current });
      } else {
        navigationDepth.current = 0;
        setNavigation({ canBack: false, canForward: false });
      }
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
        const nodeIndex = params.get("node") ? linkedSteps.findIndex((step) => step.node_id === params.get("node")) : -1;
        const linkedStepIndex = occurrenceIndex >= 0 ? occurrenceIndex : requestedIndex >= 0 ? requestedIndex : nodeIndex;
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
      setMapMode(nextMapMode && ["map", "architecture", "health"].includes(nextMapMode)
        ? nextMapMode as OverviewMode
        : "map");
      const nextMapOrder = params.get("map_order");
      setMapOrder(nextMapOrder === "centrality" ? "centrality" : "path");
      setMapNeighborhoodOnly(params.get("map_focus") === "neighborhood");
      const linkedEntry = app.entries.findIndex((item) => item.id === params.get("entry"));
      if (linkedEntry >= 0) {
        const hops = app.entries[linkedEntry].hops;
        const occurrenceIndex = params.get("hop_occurrence")
          ? hops.findIndex((hop) => hop.id === params.get("hop_occurrence"))
          : -1;
        const requestedIndex = params.get("hop_index") == null ? -1 : Number(params.get("hop_index"));
        const hopIndex = params.get("hop") ? hops.findIndex((hop) => hop.node_id === params.get("hop")) : -1;
        const linkedHopIndex = occurrenceIndex >= 0 ? occurrenceIndex : requestedIndex >= 0 ? requestedIndex : hopIndex;
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

  function traceUrlOverrides(nextFlow: string, nextNode: string, nextStepIndex = positionForFlow(app, nextFlow, nextNode, direction)): ViewUrlOverrides {
    return { flow: nextFlow, node: nextNode, direction, step_index: String(nextStepIndex) };
  }

  function journeyUrlOverrides(nextIndex: number, nextHop: string, nextHopIndex = positionForEntry(app, nextIndex, nextHop)): ViewUrlOverrides {
    return { entry: app.entries[nextIndex]?.id, hop: nextHop, hop_index: String(nextHopIndex) };
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const editing = target.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      const inDialog = Boolean(target.closest('[role="dialog"]'));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenu(false);
        setHelpOpen(false);
        setCommandOpen((open) => {
          if (!open) commandOpenerRef.current = document.activeElement as HTMLElement | null;
          return !open;
        });
        return;
      }
      if (event.key === "Escape" && editing && !inDialog) {
        event.preventDefault();
        target.blur();
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
              const sourceTrigger = document.querySelector<HTMLButtonElement>('.inspector-reopen[aria-expanded="false"]');
              if (sourceTrigger) sourceTrigger.focus();
              else document.querySelector<HTMLButtonElement>(".inspector-reopen")?.focus();
            });
        }
        dragDepth.current = 0;
        setDragActive(false);
        return;
      }
      if (editing || inDialog || event.defaultPrevented || target.closest("button, a, [role='button'], [role='option']")) return;
      if (event.key === "/") {
        const searchSelector = view === "trace"
          ? ".sidebar .search input"
          : view === "home"
            ? ".understand-search input, .briefing-source-search input"
          : view === "map"
            ? ".query-composer input"
            : view === "journey"
              ? ".entry-search input"
              : view === "investigate"
                ? ".sink-search input"
                : view === "compare"
                  ? ".compare-search input"
                  : "";
        const search = searchSelector
          ? document.querySelector<HTMLInputElement>(searchSelector)
          : null;
        event.preventDefault();
        if (search) {
          search.focus();
          return;
        }
        setMenu(false);
        setHelpOpen(false);
        commandOpenerRef.current = document.activeElement as HTMLElement | null;
        setCommandOpen(true);
        return;
      }
      if (view === "trace" && event.key === "ArrowLeft") {
        setDirection("backward");
        record("Changed path order", flowId, "start to end");
        trackEvent("trace_direction_changed", {
          direction: "backward",
          source: "keyboard",
        });
      }
      if (view === "trace" && event.key === "ArrowRight") {
        setDirection("forward");
        record("Changed path order", flowId, "end to start");
        trackEvent("trace_direction_changed", {
          direction: "forward",
          source: "keyboard",
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, flowId, record, commandOpen, helpOpen, menu]);

  function changeView(next: View, mapModeOverride?: OverviewMode, focusNodeOverride?: string, mapQueryOverride?: string, urlOverrides?: ViewUrlOverrides) {
    if (next !== view && urlReady.current) {
      const params = new URLSearchParams(window.location.search);
      [
        "flow",
        "node",
        "direction",
        "step_index",
        "step_occurrence",
        "entry",
        "hop",
        "hop_index",
        "hop_occurrence",
        "sink",
        "filter",
        "map_mode",
        "map_order",
        "map_focus",
      ].forEach((key) => params.delete(key));
      params.set("view", next);
      if (next === "map" && focusNodeOverride) params.set("node", focusNodeOverride);
      if (next === "map" && mapQueryOverride) params.set("filter", mapQueryOverride);
      if (next === "map" && mapModeOverride && mapModeOverride !== "map") params.set("map_mode", mapModeOverride);
      Object.entries(urlOverrides ?? {}).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      pushNavigation(params);
    }
    if (next === "map" && mapModeOverride) {
      setMapMode(mapModeOverride);
    } else if (next === "map" && view !== "map") {
      setMapMode("map");
      setMapNeighborhoodOnly(false);
    }
    setView(next);
    record("Changed view", viewLabels[next], "");
    if (next !== view) {
      window.requestAnimationFrame(() => {
        workspaceRef.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    }
  }

  function openNodeInMap(nodeId: string) {
    setFocusNodeId(nodeId);
    setMapQuery("");
    changeView("map", "map", nodeId);
    setMapNeighborhoodOnly(true);
  }

  function changeMapMode(next: OverviewMode) {
    if (next !== mapMode && urlReady.current && view === "map") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "map");
      if (next === "map") params.delete("map_mode");
      else params.set("map_mode", next);
      pushNavigation(params);
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
      pushNavigation(params);
    }
    setMapOrder(next);
  }

  function changeMapNeighborhood(next: boolean) {
    if (next !== mapNeighborhoodOnly && urlReady.current && view === "map") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "map");
      if (next) params.set("map_focus", "neighborhood");
      else params.delete("map_focus");
      pushNavigation(params);
    }
    setMapNeighborhoodOnly(next);
    trackEvent("topology_neighborhood_toggled", { focused: next });
  }

  async function copyInvestigationLink(params: Record<string, string>) {
    const url = new URL(window.location.href);
    url.search = "";
    const canonicalRepositoryRoute = window.location.pathname.startsWith("/r/");
    if (bundleOrigin === "hosted" && hostedBundleId && !canonicalRepositoryRoute) {
      url.searchParams.set("bundle", hostedBundleId);
    } else if (isDemo) {
      const securityMode = isSecurityProjection(app);
      if (securityMode) url.searchParams.set("sample", "security");
    } else {
      url.searchParams.set("scope", "local");
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    try {
      await copyText(url.toString());
      setLoadState({
        type: "success",
        message: isDemo
          ? "Investigation link copied."
          : "Local investigation link copied. The recipient will need the same bundle.json to open it.",
      });
      trackEvent("investigation_link_copied", {
        view: params.view ?? "unknown",
        link_kind: canonicalRepositoryRoute ? "canonical_repository" : bundleOrigin === "hosted" ? "opaque_bundle" : "local_or_sample",
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

  function openSourceFile(file: string) {
    setMapQuery(`file:${file}`);
    setMapNeighborhoodOnly(false);
    setFocusNodeId("");
    changeView("map", "map", undefined, `file:${file}`);
    trackEvent("source_file_explored");
  }

  function replayActivity(target: string) {
    const node = app.nodes.find((item) => item.id === target || item.label === target);
    if (node) {
      openNodeInMap(node.id);
      record("Reopened graph node", node.label || node.id, "from exploration history");
      return;
    }
    const flow = app.flows.find((item) => item.id === target || item.name === target);
    if (flow) {
      const orderedSteps = direction === "forward" ? [...flow.steps].reverse() : flow.steps;
      const nextNode = orderedSteps[0]?.node_id ?? "";
      const nextStepIndex = positionForFlow(app, flow.id, nextNode, direction);
      changeView("trace", undefined, undefined, undefined, traceUrlOverrides(flow.id, nextNode, nextStepIndex));
      setQuery("");
      setFlowId(flow.id);
      setStepId(nextNode);
      setStepIndex(nextStepIndex);
      setInspectorOpen(true);
      record("Reopened graph path", flow.name, "from exploration history");
      return;
    }
    const entryIndex = app.entries.findIndex((item) => item.id === target || item.label === target);
    if (entryIndex >= 0) {
      const entry = app.entries[entryIndex];
      changeView("journey", undefined, undefined, undefined, journeyUrlOverrides(entryIndex, entry.hops[0]?.node_id ?? "", 0));
      setEntryIndex(entryIndex);
      setHopId(entry.hops[0]?.node_id ?? "");
      setHopIndex(0);
      setInspectorOpen(true);
      record("Reopened request flow", entry.label, "from exploration history");
    }
  }

  function activate(next: App, demo = false, origin: "sample" | "local" | "hosted" = demo ? "sample" : "local", loadedBundleId?: string) {
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    });
    const pending = pendingLink.current;
    const firstSink = recommendedSink(next)?.id ?? "";
    const firstFlow = recommendedFlow(next);
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
    setMapMode("map");
    setMapOrder("path");
    setMapNeighborhoodOnly(false);
    setFocusNodeId("");
    let restored = false;
    if (pending) {
      const requestedView = pending.view ?? (pending.region || pending.label || pending.anchor || pending.domain ? "map" : pending.flow || pending.step ? "trace" : undefined);
      if (
        requestedView === "home" ||
        requestedView === "trace" ||
        requestedView === "journey" ||
        requestedView === "investigate" ||
        requestedView === "map" ||
        requestedView === "compare" ||
        requestedView === "install"
      )
        setView(requestedView);
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
        const nodeIndex = pending.node ? linkedSteps.findIndex((step) => step.node_id === pending.node) : -1;
        const linkedStepIndex = occurrenceIndex >= 0 ? occurrenceIndex : pending.stepIndex ?? nodeIndex;
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
        const hopIndex = pending.hop ? next.entries[linkedEntry].hops.findIndex((hop) => hop.node_id === pending.hop) : -1;
        const linkedHopIndex = occurrenceIndex >= 0 ? occurrenceIndex : pending.hopIndex ?? hopIndex;
        if (linkedHopIndex >= 0 && linkedHopIndex < next.entries[linkedEntry].hops.length && (!pending.hop || next.entries[linkedEntry].hops[linkedHopIndex]?.node_id === pending.hop)) {
          setHopId(next.entries[linkedEntry].hops[linkedHopIndex].node_id);
          setHopIndex(linkedHopIndex);
        }
        restored = true;
      }
      const handoffNode = nodeForHandoff(next, pending.anchor, pending.region);
      if (
        requestedView === "map" &&
        ((pending.node && next.nodes.some((node) => node.id === pending.node)) || handoffNode)
      ) {
        setFocusNodeId(pending.node && next.nodes.some((node) => node.id === pending.node) ? pending.node : handoffNode!.id);
        restored = true;
      }
      if (pending.sink && next.nodes.some((node) => node.id === pending.sink)) {
        setSinkId(pending.sink);
        restored = true;
      }
      if (requestedView === "install" || requestedView === "map") restored = true;
      if (pending.direction === "forward") setDirection("forward");
      if (pending.view === "trace") setQuery(pending.filter ?? "");
      if (requestedView === "map") setMapQuery(pending.filter ?? "");
      if (requestedView === "map") setMapMode(pending.mapMode && ["map", "architecture", "health"].includes(pending.mapMode) ? pending.mapMode as OverviewMode : "map");
      if (requestedView === "map") setMapOrder(pending.mapOrder === "centrality" ? "centrality" : "path");
      if (requestedView === "map") setMapNeighborhoodOnly(Boolean(pending.mapNeighborhood));
      pendingLink.current = null;
    }
    initializeNavigation();
    urlReady.current = true;
    setUrlInitialized(true);
    setMenu(false);
    setInspectorOpen(true);
    setIsDemo(origin === "sample");
    setBundleOrigin(origin);
    setHostedBundleId(origin === "hosted" ? loadedBundleId : undefined);
    if (origin !== "hosted") setRepositoryIndex(null);
    setActivity([]);
    setLoadState({
      type: restored || !pending ? "success" : "error",
      message: restored
        ? `Loaded ${next.name || "bundle.json"} and restored the local investigation link. ${bundleLoadSummary(next)}`
        : pending
          ? `Loaded ${next.name || "bundle.json"}, but its linked evidence IDs were not found. Opened the first available evidence. ${bundleLoadSummary(next)}`
          : `Loaded ${next.name || "bundle.json"}. ${bundleLoadSummary(next)}`,
    });
    const recent: RecentBundle = {
      name: next.name || "Untitled bundle",
      language: next.language || "unknown",
      commit: next.commit || "no commit",
      lines: next.lines,
      flows: next.flows.length,
      loadedAt: Date.now(),
      ...(origin === "hosted" && loadedBundleId ? { bundleId: loadedBundleId } : {}),
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
      `${countLabel(next.nodes.length, "node")} · ${countLabel(next.flows.length, "flow")}`,
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
        message: bundleImportError(error, "bundle.json", "The current bundle was kept."),
      });
      trackEvent("bundle_load_failed");
    } finally {
      importBusy.current = false;
      setDragActive(false);
    }
  }

  async function openRecentHostedBundle(bundleId: string) {
    if (importBusy.current) return;
    importBusy.current = true;
    setLoadState({ type: "loading", message: "Reopening the hosted bundle…" });
    try {
      const raw = await loadHostedBundle(bundleId);
      activate(normalize(raw), false, "hosted", bundleId);
      trackEvent("recent_hosted_bundle_reopened");
    } catch (error) {
      setLoadState({
        type: "error",
        message: `${error instanceof Error ? error.message : "Could not reopen the hosted bundle"} The current bundle was kept.`,
      });
      trackEvent("bundle_load_failed");
    } finally {
      importBusy.current = false;
    }
  }

  async function startHostedBuild(gitUrl: string, ref: string) {
    if (importBusy.current) return;
    importBusy.current = true;
    const controller = new AbortController();
    buildController.current = controller;
    setBuildState({ status: "queued", steps: [], message: "Submitting build…" });
    setLoadState({ type: "loading", message: "Preparing a hosted code graph…" });
    try {
      let status = await submitHostedBuild(gitUrl, ref, controller.signal);
      activeJobId.current = status.job_id ?? null;
      setBuildState({ status: status.status, steps: status.steps ?? [], message: "Build queued…" });
      let attempts = 0;
      const buildDeadline = Date.now() + 15 * 60 * 1000;
      while (!["ready", "too_large", "unsupported_language", "error", "expired", "cancelled"].includes(status.status)) {
        await new Promise((resolve, reject) => {
          const remaining = buildDeadline - Date.now();
          if (remaining <= 0) { reject(new Error("The hosted build took too long. You can build this repository locally instead.")); return; }
          const timer = window.setTimeout(resolve, Math.min(5000, 1000 + attempts * 500, remaining));
          controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Build cancelled", "AbortError")); }, { once: true });
        });
        attempts += 1;
        if (attempts > 180) throw new Error("The hosted build took too long. You can build this repository locally instead.");
        try {
          status = await getHostedBuildStatus(status.job_id ?? "", controller.signal);
        } catch (error) {
          if (!(error instanceof HostedRequestError) || error.retryAfterMs == null) throw error;
          await new Promise((resolve, reject) => {
            const remaining = buildDeadline - Date.now();
            if (remaining <= 0) { reject(new Error("The hosted build took too long. You can build this repository locally instead.")); return; }
            const timer = window.setTimeout(resolve, Math.min(error.retryAfterMs!, remaining));
            controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Build cancelled", "AbortError")); }, { once: true });
          });
          continue;
        }
        setBuildState({ status: status.status, steps: status.steps ?? [], message: status.status === "queued" ? "Waiting for a worker…" : undefined });
      }
      if (status.status === "too_large" || status.status === "unsupported_language") {
        setBuildState({ status: status.status, steps: status.steps ?? [], message: "This repository needs the local build path." });
        setLoadState({ type: "error", message: "The hosted builder cannot handle this repository yet. Run Lachesis locally and upload the resulting bundle.json." });
        return;
      }
      if (status.status !== "ready" || !status.bundle_id) throw new Error(status.error?.message || "The hosted build did not produce a bundle.");
      const bundleId = status.bundle_id;
      const raw = await loadHostedBundle(bundleId, controller.signal);
      setRepositoryIndex((current) => current ? {
        ...current,
        bundle_id: bundleId,
        revision: status.sha || current.revision,
        built_at: Math.floor(Date.now() / 1000),
        cache_hit: false,
      } : current);
      activate(normalize(raw), false, "hosted", bundleId);
    } catch (error) {
      if (controller.signal.aborted) return;
      setBuildState({ status: "error", steps: [], message: error instanceof Error ? error.message : "Hosted build failed." });
      setLoadState({ type: "error", message: `${error instanceof Error ? error.message : "Hosted build failed."} The current bundle was kept.` });
      trackEvent("hosted_build_failed");
    } finally {
      if (buildController.current === controller) buildController.current = null;
      activeJobId.current = null;
      importBusy.current = false;
    }
  }

  async function cancelActiveBuild() {
    const jobId = activeJobId.current;
    if (!jobId) return;
    try {
      const response = await cancelHostedBuild(jobId);
      buildController.current?.abort();
      setBuildState({ status: response.status, steps: response.steps ?? [], message: response.status === "cancelled" ? "Build cancelled." : `Build is already ${response.status}.` });
      setLoadState({ type: "success", message: response.status === "cancelled" ? "Hosted build cancelled. The current bundle was kept." : `The hosted build is already ${response.status}.` });
      activeJobId.current = null;
      importBusy.current = false;
    } catch (error) {
      setLoadState({ type: "error", message: `${error instanceof Error ? error.message : "The hosted build could not be cancelled."} The build may still be running.` });
    }
  }

  async function loadCodeSample() {
    if (importBusy.current) return;
    importBusy.current = true;
    setLoadState({
      type: "loading",
      message: "Reading the code exploration sample…",
    });
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
    setLoadState({ type: "loading", message: `Reading comparison bundle ${file.name}…` });
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
        message: bundleImportError(error, "comparison bundle", "The active bundle was kept."),
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
          setMenu(false);
          setHelpOpen(false);
          setCommandOpen(true);
        }}
        dark={dark}
        setDark={setDark}
        recentBundles={recentBundles}
        onOpenRecent={openRecentHostedBundle}
        canGoBack={navigation.canBack}
        canGoForward={navigation.canForward}
        onGoBack={() => window.history.back()}
        onGoForward={() => window.history.forward()}
      />
      <input
        id="bundle-upload"
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        aria-label="Load a graph bundle"
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
        aria-label="Load a comparison bundle"
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
            changeView("trace", undefined, undefined, undefined, traceUrlOverrides(nextFlow, nextNode));
            setQuery("");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
            record("Opened graph path", nextFlow, "via command palette");
          }}
          onEntry={(nextIndex, nextHop) => {
            changeView("journey", undefined, undefined, undefined, journeyUrlOverrides(nextIndex, nextHop));
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
            record(
              "Opened request flow",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "via command palette",
            );
          }}
          onSink={(nextSink) => {
            changeView("investigate", undefined, undefined, undefined, { sink: nextSink });
            setSinkId(nextSink);
            record(
              "Focused sink",
              app.nodes.find((node) => node.id === nextSink)?.label ?? nextSink,
              "via command palette",
            );
          }}
          onNode={(nextNode) => {
            openNodeInMap(nextNode);
            record(
              "Inspected graph node",
              app.nodes.find((node) => node.id === nextNode)?.label ?? nextNode,
              "via command palette",
            );
          }}
          onFile={openSourceFile}
        />
      )}
      {helpOpen && (
        <ShortcutHelp opener={helpOpenerRef.current} onClose={closeHelp} />
      )}
      {dragActive && (
        <div className="drop-overlay" role="status" aria-live="polite" aria-atomic="true">
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
          onDismiss={() => {
            setLoadState({ type: "idle", message: "" });
            workspaceRef.current?.focus();
          }}
        />
      )}
      {view === "home" && (
        <HomeView
          app={app}
          isDemo={isDemo}
          loadState={loadState}
          onUpload={() => fileRef.current?.click()}
          onReviewCoverage={() => {
            setMapQuery("");
            changeView("map", "health");
          }}
          onLoadSample={loadCodeSample}
          onLoadSecuritySample={loadSecuritySample}
          onBuild={startHostedBuild}
          repositoryIndex={repositoryIndex}
          onRefreshRepository={() => {
            if (repositoryIndex?.git_url) startHostedBuild(repositoryIndex.git_url, repositoryIndex.ref || "main");
          }}
          buildState={buildState}
          onView={(next) => changeView(next)}
          onSearch={(nextQuery) => {
            setMapQuery(nextQuery);
            setMapNeighborhoodOnly(false);
            changeView("map", "map", undefined, nextQuery);
            trackEvent("home_source_search_submitted");
          }}
          onDismiss={() => {
            setLoadState({ type: "idle", message: "" });
            workspaceRef.current?.focus();
          }}
          direction={direction}
          onFlow={(nextFlow, nextNode) => {
            const nextStepIndex = positionForFlow(app, nextFlow, nextNode, direction);
            changeView("trace", undefined, undefined, undefined, {
              flow: nextFlow,
              node: nextNode,
              direction,
              step_index: String(nextStepIndex),
            });
            setQuery("");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(nextStepIndex);
            setInspectorOpen(true);
            record("Opened path", nextFlow, "from understanding home");
          }}
          onSink={(nextSink) => {
            changeView("investigate", undefined, undefined, undefined, { sink: nextSink });
            setSinkId(nextSink);
            record("Focused destination", nextSink, "from understanding home");
          }}
          onEntry={(nextIndex, nextHop) => {
            const nextHopIndex = positionForEntry(app, nextIndex, nextHop);
            changeView("journey", undefined, undefined, undefined, {
              entry: app.entries[nextIndex]?.id,
              hop: nextHop,
              hop_index: String(nextHopIndex),
            });
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(nextHopIndex);
            setInspectorOpen(true);
            record(
              "Opened request flow",
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
        handoff={handoffContext}
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
            if (next === "map" && nextNode) openNodeInMap(nextNode);
            else changeView(next);
          }}
          onFlow={(nextFlow, nextNode) => {
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(positionForFlow(app, nextFlow, nextNode, direction));
            setInspectorOpen(true);
          }}
          onEntry={(nextIndex, nextHop) => {
            const nextHopIndex = positionForEntry(app, nextIndex, nextHop);
            changeView("journey", undefined, undefined, undefined, journeyUrlOverrides(nextIndex, nextHop, nextHopIndex));
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(nextHopIndex);
            setInspectorOpen(true);
          }}
          onFile={openSourceFile}
          onShare={(params) => copyInvestigationLink(params)}
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
            if (next === "map" && nextNode) openNodeInMap(nextNode);
            else changeView(next);
          }}
          onFlow={(nextFlow, nextNode) => {
            const nextStepIndex = positionForFlow(app, nextFlow, nextNode, direction);
            changeView("trace", undefined, undefined, undefined, traceUrlOverrides(nextFlow, nextNode, nextStepIndex));
            setQuery("");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(nextStepIndex);
            setInspectorOpen(true);
          }}
          onEntry={(nextIndex, nextHop) => {
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(positionForEntry(app, nextIndex, nextHop));
            setInspectorOpen(true);
          }}
          onFile={openSourceFile}
          onShare={(params) => copyInvestigationLink(params)}
        />
      )}
      {view === "investigate" && (
        <SinkView
          app={app}
          sinkId={sinkId}
          setSinkId={setSinkId}
          onRecord={record}
          onEntry={(nextIndex, nextNode) => {
            const nextHopIndex = positionForEntry(app, nextIndex, nextNode);
            changeView("journey", undefined, undefined, undefined, {
              entry: app.entries[nextIndex]?.id,
              hop: nextNode,
              hop_index: String(nextHopIndex),
            });
            setEntryIndex(nextIndex);
            setHopId(nextNode);
            setHopIndex(nextHopIndex);
            setInspectorOpen(true);
            record(
              "Opened connected request flow",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "from convergence inspector",
            );
          }}
          onOpenFlow={(nextFlow, nextNode, originalPosition) => {
            const selectedFlow = app.flows.find((flow) => flow.id === nextFlow);
            const selectedPosition = originalPosition == null || !selectedFlow
              ? positionForFlow(app, nextFlow, nextNode, direction)
              : direction === "forward"
                ? selectedFlow.steps.length - 1 - originalPosition
                : originalPosition;
            changeView("trace", undefined, undefined, undefined, {
              flow: nextFlow,
              node: nextNode,
              direction,
              step_index: String(selectedPosition),
            });
            setQuery("");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(selectedPosition);
            setInspectorOpen(true);
          }}
          onView={(next, nextNode) => {
            if (next === "map" && nextNode) openNodeInMap(nextNode);
            else changeView(next);
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
          neighborhoodOnly={mapNeighborhoodOnly}
          setNeighborhoodOnly={changeMapNeighborhood}
          query={mapQuery}
          setQuery={setMapQuery}
          focusNodeId={focusNodeId}
          onFocusNode={setFocusNodeId}
          onRecord={record}
          onFile={openSourceFile}
          onShare={(nodeId) =>
            copyInvestigationLink({ view: "map", node: nodeId, filter: mapQuery, map_mode: mapMode, map_order: mapOrder, map_focus: mapNeighborhoodOnly ? "neighborhood" : "" })
          }
          onFlow={(nextFlow, nextNode) => {
            const nextStepIndex = positionForFlow(app, nextFlow, nextNode, direction);
            changeView("trace", undefined, undefined, undefined, traceUrlOverrides(nextFlow, nextNode, nextStepIndex));
            setQuery("");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(nextStepIndex);
            setInspectorOpen(true);
            record("Opened connected graph path", nextFlow, "from graph");
          }}
          onEntry={(nextIndex, nextHop) => {
            const nextHopIndex = positionForEntry(app, nextIndex, nextHop);
            changeView("journey", undefined, undefined, undefined, journeyUrlOverrides(nextIndex, nextHop, nextHopIndex));
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(nextHopIndex);
            setInspectorOpen(true);
            record(
              "Opened connected request flow",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "from graph",
            );
          }}
        />
      )}
      {view === "compare" && (
        <CompareView
          base={app}
          compare={compareApp}
          loading={loadState.type === "loading"}
          onUpload={() => compareFileRef.current?.click()}
          onOpenFlow={(nextFlow, nextNode) => {
            const nextStepIndex = positionForFlow(app, nextFlow, nextNode, direction);
            changeView("trace", undefined, undefined, undefined, traceUrlOverrides(nextFlow, nextNode, nextStepIndex));
            setQuery("");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(nextStepIndex);
            setInspectorOpen(true);
            record("Opened changed graph path", nextFlow, "from revision diff");
          }}
          onOpenNode={(nextNode) => {
            openNodeInMap(nextNode);
            record("Inspected removed graph node", app.nodes.find((node) => node.id === nextNode)?.label ?? nextNode, "from revision diff");
          }}
        />
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
        onReplay={replayActivity}
      />
      <footer>
        <span>
          <i className="status-dot" /> Active bundle: <b>{app.name}</b>
        </span>
        <span>
          Shortcuts: <b>⌘K</b> jump · <b>/</b> focus search · <b>← →</b> direction / nodes · <b>↑ ↓</b> topology rows ·{" "}
          <b>[ ]</b> step ·{" "}
          <b>Esc</b> close · <button className="footer-help" type="button" onClick={() => { helpOpenerRef.current = document.activeElement as HTMLElement | null; setHelpOpen(true); }}> <b>?</b> keyboard help</button>
        </span>
        <span className="footer-brand">Lachesis · graph reader</span>
      </footer>
    </div>
  );
}
