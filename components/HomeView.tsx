"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { countLabel, flowDisplayName, isSecurityProjection, nodeDisplayName, recommendedFlow, type App, type Evidence, type Flow, type Node } from "../lib/lachesis";
import { loadHostedRepositories } from "../lib/hosted-bundle";
import { copyText } from "../lib/clipboard";
import { Icon } from "./Icon";

type LoadState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};
type RepositoryIndex = {
  repository?: string;
  revision?: string;
  ref?: string;
  git_url?: string;
  built_at?: number;
  bundle_url?: string;
};
type Props = {
  app: App;
  isDemo: boolean;
  loadState: LoadState;
  onUpload: () => void;
  onChangeSource?: () => void;
  onReviewCoverage: () => void;
  sourceSelected: boolean;
  onView: (view: "map" | "investigate" | "trace" | "journey" | "compare") => void;
  onSearch?: (query: string) => void;
  onDismiss: () => void;
  direction: "backward" | "forward";
  onFlow: (flowId: string, nodeId: string) => void;
  onSink: (sinkId: string) => void;
  onEntry: (entryIndex: number, hopId: string) => void;
  onBuild?: (gitUrl: string, ref: string) => void;
  onCancelBuild?: () => void;
  buildState?: { status: string; steps: Array<{ key: string; state: string }>; message?: string };
  repositoryIndex?: RepositoryIndex | null;
  onRefreshRepository?: () => void;
};

const statusCopy: Record<string, string> = {
  lead: "Review first",
  reported: "Reported evidence",
  inconclusive: "Unresolved",
  refuted: "Guard observed",
  verified: "Verified",
};
const statusRank: Record<string, number> = {
  lead: 0,
  reported: 1,
  inconclusive: 1,
  verified: 2,
  refuted: 3,
};
type QueueFilter = "all" | "lead" | "reported" | "inconclusive" | "refuted" | "verified";

function evidenceStatus(evidence?: Evidence) {
  return evidence?.status ?? (evidence ? "reported" : "lead");
}

function sinkFor(flow: Flow, app: App): Node | undefined {
  const sinkStep = [...flow.steps]
    .reverse()
    .find((step) => step.role.trim().toLowerCase() === "sink");
  return app.nodes.find((node) => node.id === (flow.sinkNodeId ?? sinkStep?.node_id ?? flow.steps.at(-1)?.node_id));
}

function sourceFor(flow: Flow, app: App): Node | undefined {
  const sourceStep = flow.steps.find((step) =>
    ["source", "origin"].includes(step.role.trim().toLowerCase()),
  );
  return app.nodes.find(
    (node) => node.id === (flow.sourceNodeId ?? sourceStep?.node_id ?? (flow.steps.length > 1 ? flow.steps[0]?.node_id : undefined)),
  );
}

function nodeLocation(node?: Node) {
  return node
    ? `${node.file || "Source unavailable"}:${node.line || "—"}`
    : "Source location unavailable";
}

function flowContext(flow: Flow, app: App) {
  const evidence = app.mcp.find((item) => item.for === flow.id);
  if (evidence?.result_summary) return evidence.result_summary;
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  if (!nodes.length) return "source location unavailable";
  const location = (node: (typeof app.nodes)[number]) => `${node.file || "source unavailable"}:${node.line || "—"}`;
  return nodes.length === 1 ? location(nodes[0]!) : `${location(nodes[0]!)} → ${location(nodes.at(-1)!)}`;
}

function pathLocation(flow: Flow, app: App) {
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  if (!nodes.length) return "source location unavailable";
  const location = (node: (typeof app.nodes)[number]) => `${node.file || "source unavailable"}:${node.line || "—"}`;
  return nodes.length === 1 ? location(nodes[0]!) : `${location(nodes[0]!)} → ${location(nodes.at(-1)!)}`;
}

function pathScopes(flow: Flow, app: App) {
  const labels: string[] = [];
  flow.steps.forEach((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const label = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository;
    if (label && labels.at(-1) !== label) labels.push(label);
  });
  return labels;
}

function pathKindLabel(flow: Flow) {
  const kind = flow.kind?.trim().toLowerCase();
  if (kind === "call-path" || kind === "callpath") return "call path";
  if (kind === "data-flow" || kind === "dataflow") return "data flow";
  if (kind === "value-flow" || kind === "valueflow") return "value path";
  return flow.kind?.trim() || "graph path";
}

function flowActionLabel(flow: Flow, app: App) {
  const name = flowDisplayName(flow, app.nodes, app.flows);
  const analyzerArtifact = /__builtin_|___chk\b/.test(name);
  if (name.length <= 56 && !analyzerArtifact) return name;
  const source = sourceFor(flow, app) ?? app.nodes.find((node) => node.id === flow.steps[0]?.node_id);
  return `${pathKindLabel(flow)} · ${countLabel(flow.steps.length, "symbol")} · ${nodeLocation(source)}`;
}

function pathQuestion(flow?: Flow) {
  const kind = flow?.kind?.trim().toLowerCase();
  if (kind === "call-path" || kind === "callpath")
    return { title: "How does this call chain unfold?", detail: "Follow calls from symbol to symbol." };
  if (kind === "data-flow" || kind === "dataflow")
    return { title: "How does data move?", detail: "Follow data through each relationship." };
  if (kind === "value-flow" || kind === "valueflow")
    return { title: "Where does a value go?", detail: "Trace a value through its handoffs." };
  return { title: "How does this path work?", detail: "Follow its symbols and relationships." };
}

function EvidenceState({ evidence }: { evidence?: Evidence }) {
  const status = evidence?.status ?? (evidence ? "reported" : "lead");
  return (
    <span className={`finding-state state-${status}`}>
      <i />
      {statusCopy[status] ?? status}
    </span>
  );
}

function BuildIntake({ onBuild, onCancelBuild, buildState }: Pick<Props, "onBuild" | "onCancelBuild" | "buildState">) {
  const [gitUrl, setGitUrl] = useState("");
  const [ref, setRef] = useState("");
  const [formError, setFormError] = useState("");
  if (!onBuild) return null;
  const busy = buildState?.status && !["idle", "ready", "error", "too_large", "unsupported_language", "expired", "cancelled"].includes(buildState.status);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gitUrl.trim() || busy) return;
    let parsed: URL;
    try {
      parsed = new URL(gitUrl.trim());
    } catch {
      setFormError("Enter a full HTTPS repository URL, such as https://github.com/org/repository.");
      return;
    }
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/$/, "").replace(/\.git$/, "");
    const segments = path.split("/").filter(Boolean);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !["github.com", "gitlab.com", "bitbucket.org"].includes(host) || segments.length !== 2) {
      setFormError("Use a public HTTPS GitHub, GitLab, or Bitbucket repository URL without credentials or extra path segments.");
      return;
    }
    setFormError("");
    onBuild?.(gitUrl.trim(), ref.trim());
  }
  const statusLabels: Record<string, string> = { queued: "Queued", clone: "Clone repository", cloning: "Cloning repository", build: "Build graph", building: "Building graph", export: "Export bundle", exporting: "Exporting bundle", ready: "Bundle ready", cancelled: "Build cancelled", too_large: "Repository is too large", unsupported_language: "Language is not supported", expired: "Build expired", error: "Build failed" };
  return <section className="hosted-build" aria-labelledby="hosted-build-title">
    <div className="hosted-build-heading"><span className="selection-option-number">01</span><div><span className="panel-label">FRESH GRAPH</span><h2 id="hosted-build-title">Paste a repository URL</h2><p>Build a fresh graph from a public GitHub, GitLab, or Bitbucket repository.</p></div></div>
    <form onSubmit={submit} className="hosted-build-form" aria-label="Build graph from repository">
      <label htmlFor="hosted-repository-url"><span>Repository URL</span><input id="hosted-repository-url" value={gitUrl} onChange={event => { setGitUrl(event.target.value); if (formError) setFormError(""); }} placeholder="https://github.com/org/repository" inputMode="url" autoComplete="url" aria-invalid={Boolean(formError)} aria-describedby={formError ? "hosted-repository-error" : "hosted-repository-help"} disabled={Boolean(busy)} /></label>
      <label htmlFor="hosted-repository-ref"><span>Ref <small>optional</small></span><input id="hosted-repository-ref" value={ref} onChange={event => setRef(event.target.value)} placeholder="main" disabled={Boolean(busy)} /></label>
      {busy ? <button type="button" className="hosted-build-cancel" onClick={onCancelBuild}>Cancel build</button> : <button type="submit" disabled={!gitUrl.trim()}>Build graph<Icon name="arrow" size={13} /></button>}
    </form>
    <p id="hosted-repository-help" className="hosted-build-help">Public repositories only. Private URLs, SSH URLs, credentials, and nested paths are not accepted.</p>
    {formError && <p id="hosted-repository-error" className="hosted-build-form-error" role="alert">{formError}</p>}
    {buildState?.status && buildState.status !== "idle" && <div className={`hosted-build-status ${buildState.status}`} role={["error", "too_large", "unsupported_language", "expired", "cancelled"].includes(buildState.status) ? "alert" : "status"} aria-live="polite" aria-busy={Boolean(busy)}><b>{buildState.message || statusLabels[buildState.status] || `Build ${buildState.status}.`}</b>{buildState.steps.length > 0 && <ol aria-label="Build progress">{buildState.steps.map(step => <li key={step.key} className={step.state}><span aria-hidden="true" />{statusLabels[step.key] || step.key}<small>{step.state === "done" ? "Complete" : step.state === "running" ? "In progress" : "Waiting"}</small></li>)}</ol>}{["too_large", "unsupported_language"].includes(buildState.status) && <small>Run <code>lachesis trace . --out bundle.json</code>, then use “Load another bundle” to continue locally.</small>}</div>}
  </section>;
}

function RepositoryFreshness({ index, onRefresh, busy }: { index: RepositoryIndex; onRefresh?: () => void; busy: boolean }) {
  const builtAt = index.built_at ? new Date(index.built_at * 1000) : undefined;
  const age = builtAt
    ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        -Math.max(0, Math.round((Date.now() - builtAt.getTime()) / 86_400_000)),
        "day",
      )
    : "unknown time";
  return (
    <aside className="repository-freshness" aria-label="Repository graph freshness">
      <div>
        <span className="panel-label">REPOSITORY GRAPH</span>
        <b>{index.repository || "Canonical repository"}</b>
        <small>Built {age}{index.revision ? ` · ${index.revision.slice(0, 12)}` : ""}</small>
      </div>
      {onRefresh && <button type="button" onClick={onRefresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh graph"}<Icon name="arrow" size={13} /></button>}
    </aside>
  );
}

function RepositoryGallery() {
  const [repositories, setRepositories] = useState<RepositoryIndex[]>([]);
  const [page, setPage] = useState(0);
  const hostedConfigured = Boolean(process.env.NEXT_PUBLIC_BUNDLE_API_URL?.trim());
  const pageSize = 6;
  useEffect(() => {
    if (!hostedConfigured) return;
    const controller = new AbortController();
    loadHostedRepositories(controller.signal).then((items) => { setRepositories(items); setPage(0); }).catch(() => undefined);
    return () => controller.abort();
  }, [hostedConfigured]);
  const pageCount = Math.max(1, Math.ceil(repositories.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = repositories.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function routeFor(repository?: string) {
    const parts = repository?.split("/").filter(Boolean) ?? [];
    if (parts.length !== 3) return "#";
    return parts[0] === "github.com"
      ? `/r/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`
      : `/r/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
  }
  if (!hostedConfigured) return (
    <section className="repository-gallery" aria-labelledby="repository-gallery-title">
      <div className="understand-section-heading"><div><span className="panel-label">CACHED CODEBASES</span><h2 id="repository-gallery-title">Connect the hosted catalog to browse cached repositories.</h2></div><p>Local development intentionally makes no hosted requests. Configure the hosted API to show warm repository cards here.</p></div>
    </section>
  );
  if (!repositories.length) return (
    <section className="repository-gallery repository-gallery-empty" aria-labelledby="repository-gallery-title">
      <div className="understand-section-heading"><div><span className="panel-label">CACHED CODEBASES</span><h2 id="repository-gallery-title">No cached repositories yet.</h2></div><p>Build a public repository above and it will appear here once its graph is ready.</p></div>
    </section>
  );
  return (
    <section className="repository-gallery" aria-labelledby="repository-gallery-title">
      <div className="understand-section-heading"><div className="repository-gallery-heading"><span className="selection-option-number">02</span><div><span className="panel-label">READY TO EXPLORE</span><h2 id="repository-gallery-title">Choose a cached codebase</h2></div></div><p>Open a warm graph instantly. Every card shows the revision you are about to read.</p></div>
      <div className="repository-gallery-grid">
        {pageItems.map((item) => <a className="repository-card" href={routeFor(item.repository)} key={item.repository + ":" + item.revision}>
          <b>{item.repository || "Unnamed repository"}</b>
          <small>{item.revision ? item.revision.slice(0, 12) : "revision unavailable"}{item.ref ? ` · ${item.ref}` : ""}</small>
          <span>Open graph <Icon name="arrow" size={13} /></span>
        </a>)}
      </div>
      <div className="repository-gallery-footer">
        <small>Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, repositories.length)} of {repositories.length} cached codebases</small>
        <nav aria-label="Cached codebase pages">
          <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>Previous</button>
          <span>Page {currentPage + 1} of {pageCount}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage === pageCount - 1}>Next</button>
        </nav>
      </div>
    </section>
  );
}

function RepositorySelection({ onUpload, onBuild, onCancelBuild, buildState, loadState, onDismiss }: Pick<Props, "onUpload" | "onBuild" | "onCancelBuild" | "buildState" | "loadState" | "onDismiss">) {
  return (
    <main className="repository-selection" aria-labelledby="repository-selection-title">
      <section className="repository-selection-hero">
        <h1 id="repository-selection-title">Understand a codebase without opening every file.</h1>
        <p>Lachesis turns a code graph into a guided reading surface. Start with a fresh repository graph or open one that is already cached; the workspace opens when its evidence is ready.</p>
        <BuildIntake onBuild={onBuild} onCancelBuild={onCancelBuild} buildState={buildState} />
      </section>
      {loadState.message && (
        <p className={`briefing-notice ${loadState.type}`} role={loadState.type === "error" ? "alert" : "status"}>
          <i />
          <span>{loadState.message}</span>
          <button className="notice-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss status message"><Icon name="close" size={14} /></button>
        </p>
      )}
      <RepositoryGallery />
      <section className="repository-selection-upload" aria-labelledby="repository-selection-upload-title">
        <div>
          <span className="panel-label">LOCAL OPTION</span>
          <h2 id="repository-selection-upload-title">Already have a bundle?</h2>
          <p>Use a <code>bundle.json</code> from a local Lachesis run. It stays in this browser and skips the hosted build queue.</p>
        </div>
        <button type="button" className="load-bundle-secondary" onClick={onUpload} disabled={loadState.type === "loading"}>
          <span className="load-bundle-secondary-icon"><Icon name="upload" size={15} /></span>
          <span><b>{loadState.type === "loading" ? "Reading bundle…" : "Upload bundle.json"}</b><small>Local only · no hosted build</small></span>
          <Icon name="arrow" size={14} />
        </button>
      </section>
      <p className="repository-selection-note">Already opening a design-map link? A valid bundle deep link skips this screen and restores its pointed-to repository context.</p>
    </main>
  );
}

function RepositoryArtifactShelf({ index }: { index?: RepositoryIndex | null }) {
  const [copied, setCopied] = useState("");
  const repository = index?.repository?.split("/").filter(Boolean) ?? [];
  const canonicalPath = repository.length === 3
    ? repository[0] === "github.com"
      ? `/r/${encodeURIComponent(repository[1])}/${encodeURIComponent(repository[2])}`
      : `/r/${repository.map((part) => encodeURIComponent(part)).join("/")}`
    : "";
  async function copyArtifact(kind: string, value: string) {
    try {
      await copyText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? "" : current), 1800);
    } catch {
      setCopied("");
    }
  }
  if (!index || !canonicalPath) return (
    <section className="artifact-shelf artifact-shelf-empty" aria-labelledby="artifact-shelf-title">
      <div><span className="panel-label">SHAREABLE ARTIFACTS</span><h2 id="artifact-shelf-title">Keep this investigation portable.</h2><p>Local bundles can share the current investigation link in this browser. A hosted repository page additionally unlocks a README badge and downloadable bundle artifact.</p></div>
      <div className="artifact-shelf-actions"><button type="button" onClick={() => copyArtifact("local", typeof window === "undefined" ? "" : window.location.href)}>{copied === "local" ? "Local link copied" : "Copy local investigation link"}</button></div>
    </section>
  );
  const canonicalUrl = typeof window === "undefined" ? canonicalPath : `${window.location.origin}${canonicalPath}`;
  const badge = `[![Understand with Lachesis](https://img.shields.io/badge/understand_with-Lachesis-18c79a?logo=github)](${canonicalUrl})`;
  const markdown = `## Understand this codebase\n\n[Open ${index.repository} in Lachesis](${canonicalUrl})\n\nRevision: ${index.revision || "unknown"}`;
  const bundleUrl = index.bundle_url && process.env.NEXT_PUBLIC_BUNDLE_API_URL
    ? new URL(index.bundle_url, process.env.NEXT_PUBLIC_BUNDLE_API_URL).toString()
    : undefined;
  return (
    <section className="artifact-shelf" aria-labelledby="artifact-shelf-title">
      <div className="artifact-shelf-heading"><div><span className="panel-label">SHAREABLE ARTIFACTS</span><h2 id="artifact-shelf-title">Package the path you just understood.</h2></div><small>{index.revision ? `revision ${index.revision.slice(0, 12)}` : "revision unavailable"}</small></div>
      <div className="artifact-shelf-actions">
        <button type="button" onClick={() => copyArtifact("link", canonicalUrl)}>{copied === "link" ? "Link copied" : "Copy canonical link"}</button>
        <button type="button" onClick={() => copyArtifact("badge", badge)}>{copied === "badge" ? "Badge copied" : "Copy README badge"}</button>
        <button type="button" onClick={() => copyArtifact("markdown", markdown)}>{copied === "markdown" ? "Markdown copied" : "Copy Markdown"}</button>
        {bundleUrl && <a href={bundleUrl} download={`${index.repository?.replaceAll("/", "-") || "lachesis"}-bundle.json`}>Download bundle <Icon name="arrow" size={12} /></a>}
      </div>
      <code className="artifact-shelf-preview">{canonicalUrl}</code>
    </section>
  );
}

export function HomeView({
  app,
  isDemo,
  loadState,
  onUpload,
  onChangeSource,
  onReviewCoverage,
  onView,
  onSearch,
  onDismiss,
  direction,
  onFlow,
  onSink,
  onEntry,
  onBuild,
  onCancelBuild,
  buildState,
  repositoryIndex,
  onRefreshRepository,
  sourceSelected,
}: Props) {
  const [selectedId, setSelectedId] = useState(app.findings[0]?.id ?? "");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  useEffect(() => {
    setSelectedId(app.findings[0]?.id ?? "");
    setQueueFilter("all");
    setQueueSearch("");
    setSourceSearch("");
  }, [app]);
  function submitSourceSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = sourceSearch.trim();
    if (query) onSearch?.(query);
  }
  const findings = useMemo(
    () =>
      app.findings
        .map((flow) => ({
          flow,
          evidence: app.mcp.find((item) => item.for === flow.id),
          sink: sinkFor(flow, app),
        }))
        .sort(
          (a, b) =>
            (statusRank[evidenceStatus(a.evidence)] ?? 4) -
            (statusRank[evidenceStatus(b.evidence)] ?? 4),
        ),
    [app],
  );
  const metadataOnly = findings.length === 0 && app.flows.length === 0 && app.mcp.length > 0;
  const securityMode = isSecurityProjection(app);
  const graphOnly = !securityMode && app.nodes.length > 0 && !metadataOnly;
  const bundleMode = securityMode
    ? "Security evidence projection"
    : "Code exploration graph";
  const graphFocus = useMemo(() => recommendedFlow(app, { requireRenderableSource: true }), [app]);
  const curatedTour = app.bundle.curatedTour;
  const curatedTourSteps = useMemo(
    () => curatedTour?.steps.flatMap((step) => {
      const flow = app.flows.find((item) => item.id === step.flowId);
      return flow ? [{ step, flow }] : [];
    }) ?? [],
    [app.flows, curatedTour],
  );
  const graphFocusNode = graphFocus?.steps[0]
    ? app.nodes.find((node) => node.id === graphFocus.steps[0]?.node_id)
    : undefined;
  const firstEntry = app.entries[0];
  const firstSink = [...app.nodes]
    .filter(
      (node) =>
        node.kind === "sink" ||
        app.flows.some((flow) =>
          flow.steps.some((step) => step.node_id === node.id && step.role.trim().toLowerCase() === "sink"),
        ),
    )
    .sort((a, b) => {
      const flowCount = (node: Node) => app.flows.filter((flow) => flow.steps.some((step) => step.node_id === node.id)).length;
      const stepCount = (node: Node) => app.flows.reduce((total, flow) => total + flow.steps.filter((step) => step.node_id === node.id).length, 0);
      return flowCount(b) - flowCount(a) || stepCount(b) - stepCount(a);
    })[0];
  const visibleFindings = useMemo(
    () => {
      const term = queueSearch.trim().toLowerCase();
      return findings.filter((item) => {
        const matchesStatus = queueFilter === "all" || evidenceStatus(item.evidence) === queueFilter;
        if (!matchesStatus) return false;
        if (!term) return true;
        const nodes = item.flow.steps
          .map((step) => app.nodes.find((node) => node.id === step.node_id))
          .filter(Boolean);
        return [
          item.flow.name,
          item.flow.kind,
          item.flow.description,
          item.evidence?.result_summary,
          ...item.flow.steps.flatMap((step) => [step.role, step.note, step.edge?.relation]),
          ...nodes.flatMap((node) => node ? [node.label, node.qualifiedName, node.signature, node.documentation, node.snippet, node.sourceWindow?.lines.join(" "), node.file, node.module] : []),
        ].filter(Boolean).join(" ").toLowerCase().includes(term);
      });
    },
    [app, findings, queueFilter, queueSearch],
  );
  const priority =
    visibleFindings.find((item) => item.flow.id === selectedId) ??
    visibleFindings[0];
  const queueItems = graphOnly
    ? app.flows.map((flow) => ({
        flow,
        evidence: undefined,
        sink: sinkFor(flow, app),
      }))
    : visibleFindings;
  const leadCount = findings.filter(
    (item) => evidenceStatus(item.evidence) === "lead",
  ).length;
  const reportedCount = findings.filter(
    (item) => evidenceStatus(item.evidence) === "reported",
  ).length;
  const unresolvedCount = findings.filter(
    (item) => item.evidence?.status === "inconclusive",
  ).length;
  const refutedCount = findings.filter(
    (item) => item.evidence?.status === "refuted",
  ).length;
  const filterCount = (filter: QueueFilter) =>
    filter === "all"
      ? findings.length
      : findings.filter((item) => evidenceStatus(item.evidence) === filter)
          .length;
  const dynamicCount = app.edges.filter((edge) => edge.dynamic).length;
  const incompletePaths = app.entries.filter(
    (entry) => !entry.hasLayout,
  ).length;
  const guardVerdict = priority?.evidence?.guards?.verdict;
  const title =
    leadCount || unresolvedCount
      ? "Start with the paths that need a closer read."
      : reportedCount
        ? "Start with a bundled path, then verify it in source."
        : metadataOnly
        ? "Linked records are present, but no traceable path steps are available."
        : graphOnly
        ? graphFocus
          ? "Understand this code by following one path."
          : "Explore how this code is connected."
        : "No open evidence paths in this bundle.";

  if (!sourceSelected) return <RepositorySelection onUpload={onUpload} onBuild={onBuild} onCancelBuild={onCancelBuild} buildState={buildState} loadState={loadState} onDismiss={onDismiss} />;

  if (graphOnly) {
    const startNode = graphFocus
      ? sourceFor(graphFocus, app) ?? app.nodes.find((node) => node.id === graphFocus.steps[0]?.node_id)
      : undefined;
    const endNode = graphFocus
      ? sinkFor(graphFocus, app) ?? app.nodes.find((node) => node.id === graphFocus.steps.at(-1)?.node_id)
      : undefined;
    const otherPaths = app.flows.filter((flow) => flow.id !== graphFocus?.id).slice(0, 4);

    return (
      <main className="understand-home">
        <header className="understand-hero">
          <div className="understand-copy">
            <div className="briefing-status-line">
              <span className={isDemo ? "fixture-flag" : "fixture-flag live"}>
                <i />
                {isDemo ? "Synthetic working bundle" : "Loaded local bundle"}
              </span>
              <span>{bundleMode} · contract {app.bundle.schemaVersion}</span>
            </div>
            <h1>Understand {app.name || "this codebase"}, one path at a time.</h1>
            <p>
              {app.bundle.description ||
                "Start with a real behavior, follow its calls and data handoffs, and inspect the source without losing your place—build a mental model without opening files one by one."}
            </p>
            <p className="understand-value">
              Paths keep the relevant symbols, relationships, and source context together, so unfamiliar code becomes a guided reading instead of file-by-file tab hopping.
            </p>
            <div className="understand-actions">
              {onChangeSource && <button type="button" className="understand-secondary" onClick={onChangeSource}><Icon name="back" size={14} /> Change codebase</button>}
              {graphFocus && (
                <button
                  type="button"
                  className="understand-primary"
                  aria-label={`Follow ${flowDisplayName(graphFocus, app.nodes, app.flows)}`}
                  title={`Follow ${flowDisplayName(graphFocus, app.nodes, app.flows)}`}
                  onClick={() => onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")}
                >
                  Follow “{flowActionLabel(graphFocus, app)}” <Icon name="arrow" size={14} />
                </button>
              )}
              {!graphFocus && app.flows.length > 0 && (
                <button type="button" className="understand-secondary" onClick={() => onView("trace")}>
                  Review bundled paths <Icon name="arrow" size={14} />
                </button>
              )}
              <button type="button" className="understand-secondary" onClick={onUpload} disabled={loadState.type === "loading"}>
                <Icon name="upload" size={14} />
                {loadState.type === "loading" ? "Reading bundle…" : "Load another bundle"}
              </button>
            </div>
            {onSearch && (
              <form
                className="understand-search"
                onSubmit={submitSourceSearch}
              >
                <Icon name="search" size={15} />
                <input
                  value={sourceSearch}
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder="Find a symbol, file, or source text…"
                  aria-label="Find a symbol, file, or source text in this codebase"
                />
                <button type="submit" disabled={!sourceSearch.trim()}>Find</button>
              </form>
            )}
            <RepositoryArtifactShelf index={repositoryIndex} />
          </div>
          <dl className="understand-facts" aria-label="Active codebase">
            <div><dt>Code paths</dt><dd>{app.flows.length.toLocaleString()} {graphFocus ? "ready to follow" : app.flows.length ? "bundled" : "included"}</dd></div>
            <div><dt>Request flows</dt><dd>{app.entries.length.toLocaleString()} starting points</dd></div>
            <div><dt>Files</dt><dd>{(app.files.length || new Set(app.nodes.map((node) => node.file).filter(Boolean)).size).toLocaleString()} in this bundle</dd></div>
            <div><dt>Source previews</dt><dd>{countLabel(app.nodes.filter((node) => node.snippet.trim() || node.sourceWindow?.lines.length).length, "source preview")} of {countLabel(app.nodes.length, "symbol")}</dd></div>
          </dl>
        </header>

        {loadState.message && (
          <p className={`briefing-notice ${loadState.type}`} role={loadState.type === "error" ? "alert" : "status"}>
            <i />
            <span>{loadState.message}</span>
            {loadState.type === "error" && <span className="notice-actions">
              <button type="button" className="notice-action" onClick={onUpload}>Try another bundle</button>
              <a className="notice-action notice-link" href="https://github.com/UnboundCompute/lachesis-explorer/blob/main/docs/GRAPH_EXPLORER_CONTRACT.md" target="_blank" rel="noreferrer">Open bundle contract</a>
            </span>}
            <button className="notice-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss status message"><Icon name="close" size={14} /></button>
          </p>
        )}

        {app.coverage.limitations.length > 0 && (
          <aside className="understand-coverage" aria-label="Bundle coverage note">
            <div>
              <span className="panel-label">WHAT THIS BUNDLE INCLUDES</span>
              <p>
                {countLabel(app.coverage.includedNodes ?? app.nodes.length, "node")} of {countLabel(app.coverage.indexedNodes ?? app.nodes.length, "indexed node")} are available here. Paths and source context reflect this bundle’s included projection.
              </p>
            </div>
            <div className="understand-coverage-detail">
              <small>{app.coverage.limitations[0]}{app.coverage.limitations.length > 1 ? ` · +${app.coverage.limitations.length - 1} more` : ""}</small>
              <button type="button" onClick={onReviewCoverage}>Review data quality <Icon name="arrow" size={12} /></button>
            </div>
          </aside>
        )}

        {curatedTourSteps.length > 0 && (
          <section className="understand-tour" aria-labelledby="understand-tour-title">
            <div className="understand-section-heading">
              <div>
                <span className="panel-label">CURATED START</span>
                <h2 id="understand-tour-title">{curatedTour?.title || "Start here"}</h2>
              </div>
              {curatedTour?.maintainer && (
                <p className="understand-tour-byline">
                  {curatedTour.maintainer.url ? (
                    <a href={curatedTour.maintainer.url} target="_blank" rel="noreferrer">{curatedTour.maintainer.name}</a>
                  ) : curatedTour.maintainer.name}
                  {" · publisher-provided tour"}
                </p>
              )}
            </div>
            {curatedTour?.description && <p className="understand-tour-description">{curatedTour.description}</p>}
            <ol className="understand-tour-list">
              {curatedTourSteps.map(({ step, flow }, index) => (
                <li key={`${curatedTour?.id}-${flow.id}-${index}`}>
                  <button type="button" onClick={() => onFlow(flow.id, step.nodeId ?? flow.sourceNodeId ?? flow.steps[0]?.node_id ?? "")}>
                    <span className="understand-tour-index">{String(index + 1).padStart(2, "0")}</span>
                    <span><b>{step.label || flowActionLabel(flow, app)}</b><small>{step.note || `${pathKindLabel(flow)} · ${countLabel(flow.steps.length, "symbol")}`}</small></span>
                    <Icon name="arrow" size={13} />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="understand-questions" aria-labelledby="understand-questions-title">
          <div className="understand-section-heading">
            <h2 id="understand-questions-title">What do you want to understand?</h2>
            <p>Choose the question closest to the job in front of you.</p>
          </div>
          <div className="understand-question-list">
            <button type="button" onClick={() => graphFocus ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "") : onView("map")}>
              <span><b>How does this behavior work?</b><small>{graphFocus ? "Follow one complete call or data path." : "No traceable code path is included in this bundle."}</small></span>
              <Icon name="arrow" size={14} />
            </button>
            <button type="button" onClick={() => firstEntry ? onEntry(0, firstEntry.hops[0]?.node_id ?? "") : onView("map")}>
              <span><b>What happens after a starting point?</b><small>{firstEntry ? "Walk the request from handler to effect." : "No request flow is included in this bundle."}</small></span>
              <Icon name="arrow" size={14} />
            </button>
            <button type="button" onClick={() => onView("map")}>
              <span><b>How is the codebase organized?</b><small>Explore modules and their relationships.</small></span>
              <Icon name="arrow" size={14} />
            </button>
            <button type="button" onClick={() => firstSink ? onSink(firstSink.id) : onView("map")}>
              <span><b>What reaches this code?</b><small>{firstSink ? "Compare paths that arrive at one destination." : "No destination is available in this bundle."}</small></span>
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>

        {graphFocus ? (
          <section className="understand-start" aria-labelledby="understand-start-title">
            <div className="understand-section-heading">
              <h2 id="understand-start-title">A useful place to start</h2>
              <p>The most complete path included in this bundle.</p>
            </div>
            <div className="understand-path">
              <div className="understand-path-copy">
                <span>{pathKindLabel(graphFocus)} · {countLabel(graphFocus.steps.length, "symbol")}</span>
                <h3 title={flowDisplayName(graphFocus, app.nodes, app.flows)}>{flowActionLabel(graphFocus, app)}</h3>
                <p>{graphFocus.description || `Follow the path from ${startNode ? nodeDisplayName(startNode) : "its first symbol"} to ${endNode ? nodeDisplayName(endNode) : "its final symbol"}.`}</p>
              </div>
              <div className="understand-route" aria-label="Recommended path endpoints">
                <span><small>Starts at</small><b>{startNode?.label || "Not reported"}</b><em>{nodeLocation(startNode)}</em></span>
                <i><span /></i>
                <span><small>Ends at</small><b>{endNode?.label || "Not reported"}</b><em>{nodeLocation(endNode)}</em></span>
              </div>
              <button type="button" onClick={() => onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")}>
                Open this path <Icon name="arrow" size={14} />
              </button>
            </div>
          </section>
        ) : (
          <section className="understand-empty">
            <h2>No ready-made paths were included</h2>
            <p>The graph is still available. Explore its symbols and relationships directly.</p>
            <button type="button" onClick={() => onView("map")}>Explore the graph <Icon name="arrow" size={14} /></button>
          </section>
        )}

        {otherPaths.length > 0 && (
          <section className="understand-more" aria-labelledby="understand-more-title">
            <div className="understand-section-heading">
              <h2 id="understand-more-title">Other paths in this bundle</h2>
              <p>Open only what helps answer your next question.</p>
            </div>
            <div className="understand-path-list">
              {otherPaths.map((flow) => (
                <button type="button" key={flow.id} onClick={() => onFlow(flow.id, flow.sourceNodeId ?? flow.steps[0]?.node_id ?? "")}>
                  <span><b title={flowDisplayName(flow, app.nodes, app.flows)}>{flowActionLabel(flow, app)}</b><small>{pathKindLabel(flow)} · {countLabel(flow.steps.length, "symbol")}{flowDisplayName(flow, app.nodes, app.flows) === flow.name ? ` · ${pathLocation(flow, app)}` : ""}</small></span>
                  <Icon name="arrow" size={13} />
                </button>
              ))}
            </div>
          </section>
        )}

        <footer className="understand-footer">
          <span>Source stays beside every step. Path explanations can be copied as portable Markdown.</span>
          <span>{isDemo ? "Synthetic sample" : "Processed locally"} · {app.language || "language not reported"}</span>
          {isDemo && <span>Explicit fixture link</span>}
        </footer>
      </main>
    );
  }

  return (
    <main className="investigation-briefing">
      <header className="briefing-intro">
        <div className="briefing-copy">
          <div className="briefing-status-line">
            <span className={isDemo ? "fixture-flag" : "fixture-flag live"}>
              <i />
              {isDemo ? "Synthetic working bundle" : "Loaded local bundle"}
            </span>
            <span>
              {bundleMode} · contract{" "}
              {app.bundle.schemaVersion}
            </span>
          </div>
          <h1>{title}</h1>
          <p>
            {metadataOnly
              ? "This bundle includes linked records without path steps. Explore the graph structure while the exporter adds a traceable path."
              : graphOnly
              ? app.bundle.description ||
                (graphFocus
                  ? "Start with a bundled path, then move through the symbols and relationships that make the behavior understandable."
                  : "This bundle contains graph structure but no bundled paths. Open the graph to inspect its relationships directly.")
              : "Start with the strongest bundled path, follow its symbols and handoffs, and inspect the source. Security status and uncertainty stay visible when the bundle reports them."}
          </p>
        </div>
        <div className="briefing-actions">
          <button type="button" className="load-bundle-action" onClick={onUpload} disabled={loadState.type === "loading"} aria-busy={loadState.type === "loading"}>
            <span>
              <Icon name="upload" size={16} />
              <b>
                {loadState.type === "loading"
                  ? "Reading bundle…"
                  : "Load bundle.json"}
              </b>
              <small>Processed only in this browser</small>
            </span>
            <span className="action-orb">
              <Icon name="arrow" size={14} />
            </span>
          </button>
          {onChangeSource && <button type="button" className="change-source-action" onClick={onChangeSource}><Icon name="back" size={14} /> Change codebase</button>}
          <RepositoryArtifactShelf index={repositoryIndex} />
        </div>
      </header>

      <ol className="briefing-guide" aria-label="How to read this bundle">
        <li>
          <span>01</span>
          <div>
            <b>Choose a path</b>
            <small>{graphFocus ? `Start with a ${pathKindLabel(graphFocus)} or request flow.` : "Open the graph to inspect its relationships."}</small>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <b>Follow the handoffs</b>
            <small>Read each symbol and relationship in sequence.</small>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <b>Open the source</b>
            <small>Verify the exact file and line behind the step.</small>
          </div>
        </li>
      </ol>

      {loadState.message && (
        <p
          className={`briefing-notice ${loadState.type}`}
          role={loadState.type === "error" ? "alert" : "status"}
        >
          <i />
          <span>{loadState.message}</span>
          {loadState.type === "error" && <span className="notice-actions">
            <button type="button" className="notice-action" onClick={onUpload}>Try another bundle</button>
            <a className="notice-action notice-link" href="https://github.com/UnboundCompute/lachesis-explorer/blob/main/docs/GRAPH_EXPLORER_CONTRACT.md" target="_blank" rel="noreferrer">Open bundle contract</a>
          </span>}
          <button className="notice-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss status message"><Icon name="close" size={14} /></button>
        </p>
      )}

      {onSearch && (
        <form className="briefing-source-search" onSubmit={submitSourceSearch}>
          <Icon name="search" size={15} />
          <label htmlFor="briefing-source-search-input">Find a symbol or file in this codebase</label>
          <input
            id="briefing-source-search-input"
            value={sourceSearch}
            onChange={(event) => setSourceSearch(event.target.value)}
            placeholder="e.g. src/routes/search.ts or normalize"
            aria-label="Find a symbol, file, or source text in this codebase"
          />
          <button type="submit" disabled={!sourceSearch.trim()}>Find</button>
        </form>
      )}

      <div className="triage-board">
        <section className="priority-investigation">
          <div className="priority-header">
            <span>
              {graphOnly ? "Suggested starting path" : "Priority investigation"}
            </span>
            {priority && <EvidenceState evidence={priority.evidence} />}
          </div>
          {priority ? (
            <>
              <div className="priority-title">
                <span className="target-mark">
                  <Icon name="target" size={18} />
                </span>
                <div>
                  <h2 title={flowDisplayName(priority.flow, app.nodes, app.flows)}>{flowActionLabel(priority.flow, app)}</h2>
                  <p>
                    {nodeLocation(priority.sink)}
                  </p>
                </div>
              </div>
              <div className="witness-route" aria-label="Witness summary">
                <span>
                  <small>Source</small>
                  <b>
                    {sourceFor(priority.flow, app)?.label ?? "Unknown source"}
                  </b>
                </span>
                <i>
                  <span />
                </i>
                <span>
                  <small>Boundary</small>
                  <b>{priority.sink?.label ?? "Unknown sink"}</b>
                </span>
              </div>
              <p className="priority-summary">
                {priority.evidence?.result_summary ?? priority.flow.description ??
                  `${countLabel(priority.flow.steps.length, "bundled step")} connect${priority.flow.steps.length === 1 ? "s" : ""} the selected source and boundary.`}
              </p>
              <div className="judgment-row">
                <div>
                  <small>Confidence</small>
                  <b>{priority.evidence?.confidence ?? "bundle"}</b>
                </div>
                <div>
                  <small>Guard verdict</small>
                  <b>{guardVerdict?.replace("-", " ") ?? "not reported"}</b>
                </div>
                <div>
                  <small>Witness</small>
                  <b>{countLabel(priority.flow.steps.length, "step")}</b>
                </div>
              </div>
              {priority.evidence?.limitations?.[0] && (
                <p className="priority-limitation">
                  <Icon name="spark" size={13} />
                  <span>
                    <b>Known limit</b>
                    {priority.evidence.limitations[0]}
                  </span>
                </p>
              )}
              <div className="priority-actions">
                <button
                  type="button"
                  onClick={() =>
                    onFlow(priority.flow.id, priority.flow.sourceNodeId ?? priority.flow.steps[0].node_id)
                  }
                >
                  Trace this witness{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
                {priority.sink && (
                  <button type="button" onClick={() => onSink(priority.sink!.id)}>
                    Compare reaching paths
                  </button>
                )}
              </div>
            </>
          ) : graphOnly && graphFocus ? (
            <>
              <div className="priority-title">
                <span className="target-mark">
                  <Icon name="code" size={18} />
                </span>
                <div>
                  <h2 title={flowDisplayName(graphFocus, app.nodes, app.flows)}>{flowActionLabel(graphFocus, app)}</h2>
                  <p>Suggested starting path · code understanding</p>
                </div>
              </div>
              {graphFocus.steps.length > 1 ? (
                <div className="witness-route" aria-label="Path summary">
                  <span>
                    <small>Starts at</small>
                    <b>
                      {sourceFor(graphFocus, app) ? nodeDisplayName(sourceFor(graphFocus, app)!) : "Source not reported"}
                    </b>
                  </span>
                  <i>
                    <span />
                  </i>
                  <span>
                    <small>Reaches</small>
                    <b>
                      {sinkFor(graphFocus, app) ? nodeDisplayName(sinkFor(graphFocus, app)!) : "Boundary not reported"}
                    </b>
                  </span>
                </div>
              ) : (
                <div className="witness-route single-symbol-route" aria-label="Selected symbol">
                  <span>
                    <small>Starting symbol</small>
                    <b>{graphFocusNode ? nodeDisplayName(graphFocusNode) : graphFocus.steps[0]?.node_id ?? "Symbol not reported"}</b>
                  </span>
                  <span>
                    <small>Location</small>
                    <b>{graphFocusNode ? `${graphFocusNode.file || "Source unavailable"}:${graphFocusNode.line || "—"}` : "Source location unavailable"}</b>
                  </span>
                </div>
              )}
              {pathScopes(graphFocus, app).length > 1 && (
                <div className="briefing-scope-route" aria-label="Path context route">
                  <small>Context route</small>
                  <b>{pathScopes(graphFocus, app).join(" → ")}</b>
                </div>
              )}
              <p className="priority-summary">
                {graphFocus.steps.length > 1
                  ? `This bundled ${pathKindLabel(graphFocus)} connects ${countLabel(graphFocus.steps.length, "symbol")}. Open it to inspect each relationship and its exact source location.`
                  : "This bundle contains one symbol for this path. Open it to inspect its source and relationships in the surrounding graph."}
              </p>
              <div className="judgment-row">
                <div>
                  <small>Path type</small>
                  <b>{pathKindLabel(graphFocus)}</b>
                </div>
                <div>
                  <small>Relationships</small>
                  <b>{app.edges.length} normalized</b>
                </div>
                <div>
                  <small>Evidence</small>
                  <b>{app.mcp.length ? countLabel(app.mcp.length, "linked record") : "not supplied"}</b>
                </div>
              </div>
              <div className="priority-actions">
                <button
                  type="button"
                  onClick={() =>
                    onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")
                  }
                >
                  Start with this path{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
                <button type="button" onClick={() => onView("map")}>Open full graph</button>
              </div>
            </>
          ) : metadataOnly ? (
            <div className="briefing-empty">
              <h2>Linked records without a traceable path</h2>
              <p>
                {app.mcp.length} linked record{app.mcp.length === 1 ? "" : "s"}{" "}
                {app.mcp.length === 1 ? "is" : "are"} attached, but the bundle
                does not include path steps that can be inspected here.
              </p>
              <div className="priority-actions">
                <button type="button" onClick={() => onView("map")}>
                  Explore the graph{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
              </div>
            </div>
          ) : graphOnly ? (
            <div className="briefing-empty">
              <h2>{app.flows.length ? "Paths need more source context" : "Graph structure is ready to explore"}</h2>
              <p>{app.flows.length
                ? `This bundle includes ${countLabel(app.flows.length, "bundled path")}, but none has complete source previews for a guided starting point. Review the paths as exported, or explore the graph directly.`
                : `This bundle includes ${countLabel(app.nodes.length, "node")} and ${countLabel(app.edges.length, "relationship")}, but no graph paths were included.`}</p>
              <div className="priority-actions">
                {app.flows.length > 0 && <button type="button" onClick={() => onView("trace")}>Review paths</button>}
                <button type="button" onClick={() => onView("map")}>
                  Open full graph{" "}
                  <span className="action-orb">
                    <Icon name="arrow" size={13} />
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="briefing-empty">
              <h2>No traceable paths available</h2>
              <p>
                This bundle does not include a path to follow yet. Load a bundle
                with paths, or explore the graph structure that is available.
              </p>
              <div className="priority-actions">
                <button type="button" onClick={onUpload} disabled={loadState.type === "loading"}>
                  {loadState.type === "loading" ? "Reading bundle…" : "Load another bundle"}
                </button>
                <button type="button" onClick={() => onView("map")}>Explore current graph</button>
              </div>
            </div>
          )}
        </section>

        <aside className="evidence-queue">
          <div className="queue-heading">
            <div>
              <span>{graphOnly ? "Graph index" : metadataOnly ? "Linked records" : "Evidence queue"}</span>
              <small>
                {metadataOnly
                  ? "Records without traceable path steps"
                  : graphOnly
                  ? "Paths available to explore"
                  : "Choose a lead to keep it in context"}
              </small>
            </div>
            <b>{graphOnly ? app.flows.length : metadataOnly ? app.mcp.length : visibleFindings.length}</b>
          </div>
          {!graphOnly && !metadataOnly && (
            <div className="queue-filters" role="group" aria-label="Filter evidence queue">
              {(
                ["all", "lead", "reported", "inconclusive", "refuted", "verified"] as QueueFilter[]
              ).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  className={queueFilter === filter ? "active" : ""}
                  aria-pressed={queueFilter === filter}
                  onClick={() => setQueueFilter(filter)}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "lead"
                      ? "Lead"
                      : filter === "reported"
                        ? "Reported"
                      : filter === "inconclusive"
                        ? "Unresolved"
                    : filter === "refuted"
                      ? "Refuted"
                      : "Verified"}{" "}
                  <span>{filterCount(filter)}</span>
                </button>
              ))}
            </div>
          )}
          {!graphOnly && !metadataOnly && (
            <label className="search queue-search">
              <Icon name="search" size={14} />
              <input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Find a path, symbol, file, or code…"
                aria-label="Search evidence paths by path, symbol, file, or source code"
              />
              {queueSearch && <button type="button" onClick={() => setQueueSearch("")} aria-label="Clear evidence search"><Icon name="close" size={14} /></button>}
            </label>
          )}
          <div className="queue-list">
            {queueItems.map((item, index) => (
              <button
                type="button"
                key={item.flow.id}
                className={
                  item.flow.id === (priority?.flow.id ?? graphFocus?.id)
                    ? "active"
                    : ""
                }
                aria-pressed={
                  item.flow.id === (priority?.flow.id ?? graphFocus?.id)
                }
                  aria-label={`Select ${flowDisplayName(item.flow, app.nodes, app.flows)}, ${flowContext(item.flow, app)}`}
                onClick={() =>
                  graphOnly
                    ? onFlow(item.flow.id, direction === "forward" ? item.flow.steps.at(-1)?.node_id ?? "" : item.flow.sourceNodeId ?? item.flow.steps[0]?.node_id ?? "")
                    : setSelectedId(item.flow.id)
                }
              >
                <span className="queue-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="queue-copy">
                  <b title={flowDisplayName(item.flow, app.nodes, app.flows)}>{flowActionLabel(item.flow, app)}</b>
                  <small>
                    {graphOnly
                      ? `${pathKindLabel(item.flow)} · ${countLabel(item.flow.steps.length, "symbol")} · ${pathLocation(item.flow, app)}`
                      : `${item.evidence?.confidence ?? "bundle"} confidence · ${countLabel(item.flow.steps.length, "step")}`}
                  </small>
                  {graphOnly && <small className="queue-row-context">{flowContext(item.flow, app)}</small>}
                </span>
                {!graphOnly && <EvidenceState evidence={item.evidence} />}
                <Icon name="arrow" size={12} />
              </button>
            ))}
          </div>
          {!queueItems.length && (
            <div className="queue-empty">
              {metadataOnly
                ? "These records need path steps before they can be traced."
                : graphOnly
                  ? graphFocus
                    ? "This bundle has no security overlay; explore its graph paths instead."
                    : "No paths were included; open the full graph to browse its structure."
                : queueSearch
                  ? `No findings match “${queueSearch}”${queueFilter !== "all" ? " with this status filter" : ""}.`
                  : "No findings match this filter."}
              {!graphOnly && !metadataOnly && (queueFilter !== "all" || queueSearch) && (
                <button type="button" onClick={() => { setQueueFilter("all"); setQueueSearch(""); }}>
                  {queueSearch ? "Clear search and filters" : "Show all findings"}
                </button>
              )}
            </div>
          )}
          {!graphOnly && !metadataOnly && (
            <div className="queue-foot">
              <span>
                <i className="lead-dot" />
                {leadCount} lead
              </span>
              <span>
                <i className="unknown-dot" />
                {unresolvedCount} unresolved
              </span>
              <span>
                <i className="reported-dot" />
                {reportedCount} reported
              </span>
              <span>
                <i className="refuted-dot" />
                {refutedCount} refuted
              </span>
              <span>
                <i className="verified-dot" />
                {findings.filter((item) => evidenceStatus(item.evidence) === "verified").length} verified
              </span>
            </div>
          )}
        </aside>
      </div>

      <section className="briefing-questions" aria-labelledby="briefing-questions-title">
        <div>
          <span className="panel-label" id="briefing-questions-title">LOOK AT IT ANOTHER WAY</span>
          <p>Choose a different question when the suggested path is not the one you need.</p>
        </div>
        <div className="question-list">
          <button type="button" onClick={() => graphFocus ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "") : onView("map")}>
            <b>{pathQuestion(graphFocus).title}</b>
            <small>{graphFocus ? pathQuestion(graphFocus).detail : "No graph paths in this bundle."}</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => firstEntry ? onEntry(0, firstEntry.hops[0]?.node_id ?? "") : onView("map")}>
            <b>Which request flow should I follow?</b>
            <small>{firstEntry ? "Walk a request from starting point to effect." : "No request flows in this bundle."}</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => firstSink ? onSink(firstSink.id) : onView("map")}>
            <b>What converges here?</b>
            <small>{firstSink ? "Compare paths that reach one boundary." : "No boundary nodes in this bundle."}</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => onView("map")}>
            <b>How is it connected?</b>
            <small>Survey modules, relationships, and shape.</small>
            <Icon name="arrow" size={12} />
          </button>
          <button type="button" onClick={() => onView("compare")}>
            <b>What changed between revisions?</b>
            <small>Load another bundle to compare paths and relationships.</small>
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </section>

      <section className="bundle-reading">
        <div className="reading-heading">
          <div>
            <h2>Read the bundle from another angle.</h2>
            <p>The same evidence stays connected as you change lenses.</p>
          </div>
          <span>
            {app.name} · {app.commit}
          </span>
        </div>
        <div className="reading-grid">
          <button
            type="button"
            onClick={() =>
              metadataOnly
                ? onView("map")
                : graphOnly
                ? graphFocus
                  ? onFlow(graphFocus.id, graphFocus.sourceNodeId ?? graphFocus.steps[0]?.node_id ?? "")
                  : onView("map")
                : app.findings.length
                  ? onView("investigate")
                  : onView("map")
            }
          >
            <span className="reading-metric">
              {metadataOnly
                ? app.mcp.length
                : graphOnly
                ? app.flows.length
                : new Set(findings.map((item) => item.sink?.id).filter(Boolean))
                    .size}
            </span>
            <span>
              <b>{metadataOnly ? "Linked records" : graphOnly ? "Graph paths" : "Execution boundaries"}</b>
              <small>
                {metadataOnly
                  ? "Open the graph while these records await traceable path steps."
                  : graphOnly && graphFocus
                  ? "Trace a bundled path through its connected symbols."
                  : graphOnly && app.flows.length
                    ? "Review the exported paths, then open the graph for broader context."
                  : graphOnly
                    ? "Open the graph to inspect its included structure."
                    : "Compare every value converging on a sink."}
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
          <button type="button" onClick={() => onView("map")}>
            <span className="reading-metric">{app.nodes.length}</span>
            <span>
              <b>Graph topology</b>
              <small>
                {countLabel(app.edges.length, "relationship")} · {countLabel(dynamicCount, "dynamic")}
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
          <button
            type="button"
            onClick={() =>
              app.entries[0]
                ? onEntry(0, app.entries[0].hops[0]?.node_id ?? "")
                : onView("map")
            }
          >
            <span className="reading-metric">{app.entries.length}</span>
            <span>
              <b>Request flows</b>
              <small>
                {incompletePaths
                  ? `${incompletePaths} use derived layout`
                  : "All carry bundled layout"}
                .
              </small>
            </span>
            <Icon name="arrow" size={13} />
          </button>
        </div>
      </section>

      <footer className="bundle-provenance">
        <div>
          <span className="local-badge">
            <i />
            Local-only inspection
          </span>
          <span>
            {app.language} · {app.lines > 0 ? `${app.lines.toLocaleString()} indexed lines` : "line count not reported"}
          </span>
          <span className="coverage-note">
            <i />
            {countLabel(app.coverage.includedNodes ?? app.nodes.length, "graph node")} shown ·{" "}
            {countLabel(app.coverage.indexedNodes ?? app.nodes.length, "indexed node")}
          </span>
        </div>
        <div>
          <span>Engine</span>
          <b>{app.bundle.engine ?? "not reported"}</b>
          <span>Catalog</span>
          <b>{app.bundle.catalog ?? "not reported"}</b>
        </div>
      </footer>
    </main>
  );
}
