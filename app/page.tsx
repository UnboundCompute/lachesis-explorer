"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header, type RecentBundle } from "../components/Header";
import { Intro } from "../components/Intro";
import { InstallView } from "../components/InstallView";
import { JourneyView } from "../components/JourneyView";
import { TraceView } from "../components/TraceView";
import { SinkView } from "../components/SinkView";
import { OverviewView } from "../components/OverviewView";
import { CompareView } from "../components/CompareView";
import { HomeView } from "../components/HomeView";
import { InvestigationContext } from "../components/InvestigationContext";
import { ResourceLinks } from "../components/ResourceLinks";
import { Icon } from "../components/Icon";
import { CommandPalette } from "../components/CommandPalette";
import {
  InvestigationTrail,
  type InvestigationEvent,
} from "../components/InvestigationTrail";
import { starter, normalize, type App } from "../lib/lachesis";
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
  stepIndex?: number;
  hopIndex?: number;
  sink?: string;
};

const viewLabels: Record<View, string> = {
  home: "Briefing",
  trace: "Value flow",
  journey: "Request path",
  investigate: "Sink field",
  map: "System map",
  compare: "Revision diff",
  install: "Local workflow",
};

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
    starter.nodes.find((node) => node.kind === "sink")?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({
    type: "idle",
    message: "",
  });
  const [isDemo, setIsDemo] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [recentBundles, setRecentBundles] = useState<RecentBundle[]>([]);
  const [activity, setActivity] = useState<InvestigationEvent[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const compareFileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const pendingLink = useRef<PendingLink | null>(null);
  const importBusy = useRef(false);

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
    const params = new URLSearchParams(window.location.search);
    const link: PendingLink = {
      view: params.get("view") ?? undefined,
      flow: params.get("flow") ?? undefined,
      node: params.get("node") ?? undefined,
      direction: params.get("direction") ?? undefined,
      entry: params.get("entry") ?? undefined,
      hop: params.get("hop") ?? undefined,
      stepIndex: params.get("step_index") == null ? undefined : Number(params.get("step_index")),
      hopIndex: params.get("hop_index") == null ? undefined : Number(params.get("hop_index")),
      sink: params.get("sink") ?? undefined,
    };
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
      if (link.stepIndex != null && link.stepIndex >= 0 && link.stepIndex < linkedSteps.length && linkedSteps[link.stepIndex]?.node_id === link.node)
        setStepIndex(link.stepIndex);
    }
    const index = starter.entries.findIndex((item) => item.id === link.entry);
    if (index >= 0) {
      setEntryIndex(index);
      if (
        link.hop &&
        starter.entries[index].hops.some((item) => item.node_id === link.hop)
      )
        setHopId(link.hop);
      if (link.hopIndex != null && link.hopIndex >= 0 && link.hopIndex < starter.entries[index].hops.length && starter.entries[index].hops[link.hopIndex]?.node_id === link.hop)
        setHopIndex(link.hopIndex);
    }
    if (
      link.sink &&
      starter.nodes.some(
        (node) => node.id === link.sink && node.kind === "sink",
      )
    )
      setSinkId(link.sink);
    if (link.direction === "forward") setDirection("forward");
    if (
      link.view === "map" &&
      link.node &&
      starter.nodes.some((node) => node.id === link.node)
    )
      setFocusNodeId(link.node);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const editing = target.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setMenu(false);
        setInspectorOpen(false);
        dragDepth.current = 0;
        setDragActive(false);
        return;
      }
      if (editing) return;
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
  }, [view, flowId, record]);

  function changeView(next: View) {
    setView(next);
    record("Changed lens", viewLabels[next], "");
  }

  async function copyInvestigationLink(params: Record<string, string>) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("scope", "local");
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    try {
      await copyText(url.toString());
      setLoadState({ type: "success", message: "Investigation link copied." });
      trackEvent("investigation_link_copied", {
        view: params.view ?? "unknown",
      });
    } catch {
      setLoadState({
        type: "error",
        message:
          "Could not copy the link. Your browser may block clipboard access.",
      });
    }
  }

  function activate(next: App) {
    const pending = pendingLink.current;
    const firstSink =
      next.nodes.find(
        (node) =>
          node.kind === "sink" ||
          next.flows.some((flow) =>
            flow.steps.some(
              (step) => step.node_id === node.id && step.role === "sink",
            ),
          ),
      )?.id ?? "";
    const firstFlow = next.flows[0];
    setApp(next);
    setFlowId(firstFlow?.id ?? "");
    setStepId(firstFlow?.steps[0]?.node_id ?? next.nodes[0]?.id ?? "");
    setStepIndex(0);
    setEntryIndex(0);
    setHopId(next.entries[0]?.hops[0]?.node_id ?? next.nodes[0]?.id ?? "");
    setHopIndex(0);
    setSinkId(firstSink);
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
        const linkedStepIndex = pending.stepIndex;
        const linkedSteps = pending.direction === "forward" ? [...linkedFlow.steps].reverse() : linkedFlow.steps;
        setStepIndex(linkedStepIndex != null && linkedStepIndex >= 0 && linkedStepIndex < linkedSteps.length && linkedSteps[linkedStepIndex]?.node_id === pending.node ? linkedStepIndex : 0);
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
        const linkedHopIndex = pending.hopIndex;
        setHopIndex(linkedHopIndex != null && linkedHopIndex >= 0 && linkedHopIndex < next.entries[linkedEntry].hops.length && next.entries[linkedEntry].hops[linkedHopIndex]?.node_id === pending.hop ? linkedHopIndex : 0);
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
      pendingLink.current = null;
    }
    setMenu(false);
    setInspectorOpen(true);
    setIsDemo(false);
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
    try {
      const response = await fetch("/code-exploration-bundle.json");
      if (!response.ok)
        throw new Error("The code exploration sample could not be loaded.");
      activate(normalize(await response.json()));
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

  async function uploadComparison(file?: File) {
    if (!file) return;
    if (importBusy.current) return;
    importBusy.current = true;
    try {
      const raw = JSON.parse(await file.text());
      setCompareApp(normalize(raw));
      setView("compare");
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
    <main
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
      <Header
        view={view}
        setView={changeView}
        app={app}
        menu={menu}
        setMenu={setMenu}
        onUpload={() => fileRef.current?.click()}
        onCommand={() => setCommandOpen(true)}
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
          onClose={() => setCommandOpen(false)}
          onView={changeView}
          onFlow={(nextFlow, nextNode) => {
            setView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(0);
            setInspectorOpen(true);
            record("Opened graph path", nextFlow, "via command palette");
          }}
          onEntry={(nextIndex, nextHop) => {
            setView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(0);
            setInspectorOpen(true);
            record(
              "Opened request path",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "via command palette",
            );
          }}
          onSink={(nextSink) => {
            setView("investigate");
            setSinkId(nextSink);
            record(
              "Focused sink",
              app.nodes.find((node) => node.id === nextSink)?.label ?? nextSink,
              "via command palette",
            );
          }}
          onNode={(nextNode) => {
            setFocusNodeId(nextNode);
            setView("map");
            setInspectorOpen(true);
            record(
              "Inspected graph node",
              app.nodes.find((node) => node.id === nextNode)?.label ?? nextNode,
              "via command palette",
            );
          }}
        />
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
          onView={(next) => changeView(next)}
          onFlow={(nextFlow, nextNode) => {
            setView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(0);
            setInspectorOpen(true);
            record("Opened priority witness", nextFlow, "from briefing");
          }}
          onSink={(nextSink) => {
            setView("investigate");
            setSinkId(nextSink);
            record("Focused execution boundary", nextSink, "from briefing");
          }}
          onEntry={(nextIndex, nextHop) => {
            setView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(0);
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
        flowId={flowId}
        stepId={stepId}
        entryIndex={entryIndex}
        hopId={hopId}
        sinkId={sinkId}
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
          onView={(next: "journey" | "map") => changeView(next)}
          onShare={(position) =>
            copyInvestigationLink({
              view: "trace",
              flow: flowId,
              node: stepId,
              direction,
              step_index: String(position),
            })
          }
          onFlow={(nextFlow, nextNode) => {
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(0);
            setInspectorOpen(true);
          }}
          onEntry={(nextIndex, nextHop) => {
            setView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(0);
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
          onView={(next: "trace" | "map") => changeView(next)}
          onShare={(position) =>
            copyInvestigationLink({
              view: "journey",
              entry: app.entries[entryIndex]?.id ?? "",
              hop: hopId,
              hop_index: String(position),
            })
          }
          onFlow={(nextFlow, nextNode) => {
            setView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(0);
            setInspectorOpen(true);
          }}
          onEntry={(nextIndex, nextHop) => {
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(0);
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
          onOpenFlow={(nextFlow, nextNode) => {
            setView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(0);
            setInspectorOpen(true);
          }}
          onView={(next) => changeView(next)}
        />
      )}
      {view === "map" && (
        <OverviewView
          app={app}
          focusNodeId={focusNodeId}
          onRecord={record}
          onShare={(nodeId) =>
            copyInvestigationLink({ view: "map", node: nodeId })
          }
          onFlow={(nextFlow, nextNode) => {
            setView("trace");
            setFlowId(nextFlow);
            setStepId(nextNode);
            setStepIndex(0);
            setInspectorOpen(true);
            record("Opened connected graph path", nextFlow, "from system map");
          }}
          onEntry={(nextIndex, nextHop) => {
            setView("journey");
            setEntryIndex(nextIndex);
            setHopId(nextHop);
            setHopIndex(0);
            setInspectorOpen(true);
            record(
              "Opened connected request path",
              app.entries[nextIndex]?.label ?? "Unknown entry",
              "from system map",
            );
          }}
        />
      )}
      {view === "compare" && (
        <CompareView
          base={app}
          compare={compareApp}
          onUpload={() => compareFileRef.current?.click()}
        />
      )}
      {view === "install" && (
        <InstallView onUpload={() => fileRef.current?.click()} />
      )}
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
          <b>Esc</b> close
        </span>
        <span className="footer-brand">Lachesis · graph reader</span>
      </footer>
    </main>
  );
}
