import type { App } from "../lib/lachesis";
import { Icon } from "./Icon";

type LoadState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};
type View = "trace" | "journey" | "investigate" | "map" | "compare" | "install";
export function Intro({
  view,
  app,
  loadState,
  isDemo,
  onUpload,
  onDismiss,
}: {
  view: View;
  app: App;
  loadState: LoadState;
  isDemo: boolean;
  onUpload: () => void;
  onDismiss: () => void;
}) {
  const securityMode = app.findings.length > 0 || app.bundle.projection === "security projection";
  const bundleMode = securityMode
    ? "Security evidence projection"
    : "Code exploration graph";
  const copy = {
    trace: [
      "Follow one behavior through the code.",
      "Move through each call or data handoff, with the exact source beside it.",
    ],
    journey: [
      "See what happens after an entrypoint.",
      "Walk a focused request flow from its first handler to its final effect.",
    ],
    investigate: securityMode
      ? [
          "Start at the effect. Reveal every converging value.",
          "Compare the bundled paths that reach one execution boundary without turning overlap into a claim.",
        ]
      : [
          "See everything that reaches this code.",
          "Compare the bundled paths that meet at one destination, then open any path in context.",
        ],
    map: [
      "Build a mental model of the codebase.",
      "Explore modules, relationships, important symbols, and the graph data available to answer questions.",
    ],
    compare: [
      "Understand what changed between revisions.",
      "Load a second bundle to compare added, removed, and changed code paths without replacing the active graph.",
    ],
    install: [
      "Bring code understanding into your local workflow.",
      "Build the graph locally, query it over MCP, and explore the same bundle here.",
    ],
  }[view];
  const kicker =
    view === "trace"
      ? "GRAPH-PATH LENS"
      : view === "journey"
        ? "REQUEST-PATH LENS"
        : view === "investigate"
            ? securityMode
              ? "SINK-FIRST LENS"
              : "BOUNDARY LENS"
          : view === "map"
            ? "GRAPH LENS"
            : view === "compare"
              ? "REVISION DIFF"
              : "LOCAL WORKFLOW";
  const included = app.coverage.includedNodes ?? app.nodes.length;
  const indexed = app.coverage.indexedNodes ?? included;
  return (
    <section className="context-strip">
      <div className="context-copy">
        <div className="context-meta">
          <span className="context-kicker">{kicker}</span>
          <span
            className={isDemo ? "bundle-origin demo" : "bundle-origin live"}
          >
            <i />
            {isDemo ? "Demo bundle" : "Loaded bundle"}
          </span>
          <span className="bundle-mode">{bundleMode}</span>
        </div>
        <h1>{copy[0]}</h1>
        <p>{copy[1]}</p>
      </div>
      <div className="context-actions">
        <dl className="bundle-facts">
          <div>
            <dt>Repository</dt>
            <dd>{app.name || "Untitled"}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{app.language || "Unknown"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{app.lines > 0 ? `${app.lines.toLocaleString()} lines` : "Not reported"}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{app.commit || "—"}</dd>
          </div>
        </dl>
        <span className="coverage-note">
          <i />
          {included.toLocaleString()} graph nodes shown ·{" "}
          {indexed.toLocaleString()} indexed
          {app.coverage.limitations.length ? " · limited projection" : ""}
        </span>
        <button type="button" className="context-upload" onClick={onUpload} disabled={loadState.type === "loading"} aria-busy={loadState.type === "loading"}>
          <span>
            {loadState.type === "loading"
              ? "Reading bundle…"
              : "Load bundle.json"}
          </span>
          <span className="button-icon">
            <Icon name="upload" size={14} />
          </span>
        </button>
      </div>
      {loadState.message && (
        <p
          className={`import-notice ${loadState.type}`}
          role={loadState.type === "error" ? "alert" : "status"}
        >
          <i />
          <span>{loadState.message}</span>
          <button type="button" onClick={onDismiss} aria-label="Dismiss status message">×</button>
        </p>
      )}
    </section>
  );
}
