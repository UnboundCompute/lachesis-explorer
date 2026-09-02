import type { App, Entry, Flow, Node, Step } from "./lachesis";

function location(node?: Node) {
  if (!node) return "Source location unavailable";
  return node.file ? `${node.file}:${node.line || "—"}` : "Source location unavailable";
}

function scope(node?: Node) {
  return node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository || "";
}

function codeBlock(snippet: string) {
  if (!snippet.trim()) return "Source snippet was not included in the bundle.";
  return snippet.split("\n").map((line) => `    ${line}`).join("\n");
}

function sourceText(node?: Node) {
  return node?.sourceWindow?.lines.join("\n") || node?.snippet || "";
}

function repositoryHeader(app: App) {
  return [
    `Repository: ${app.name || "Untitled bundle"}`,
    `Revision: ${app.commit || "Not reported"}`,
    `Language: ${app.language || "Not reported"}`,
  ].join("\n");
}

function explorerReference(url?: string) {
  if (!url) return "";
  return `\n\n## Open in Lachesis\n\n${url}\n\nThe graph bundle is processed locally and is not embedded in this link.`;
}

function limitationsSection(limitations?: string[]) {
  if (!limitations?.length) return "";
  return `\n\n## Bundle limitations\n\n${limitations.map((limitation) => `- ${limitation}`).join("\n")}`;
}

export function explainFlow(app: App, flow: Flow, direction: "backward" | "forward", selectedIndex: number, url?: string) {
  const steps = direction === "backward" ? flow.steps : [...flow.steps].reverse();
  const selectedStep = steps[selectedIndex] ?? steps[0];
  const selectedNode = app.nodes.find((node) => node.id === selectedStep?.node_id);
  const path = steps.map((step: Step, index) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const context = scope(node);
    const relation = step.edge?.relation || step.role || "continues to";
    return `${index + 1}. **${node?.label || step.node_id}** — ${relation}\n   \`${location(node)}\`${context ? ` · ${context}` : ""}${step.note ? `\n   ${step.note}` : ""}`;
  }).join("\n");

  return `# ${flow.name}\n\n${flow.description || `A ${flow.kind || "graph"} path through ${steps.length} symbols.`}\n\n${repositoryHeader(app)}\nExplorer order: ${direction === "backward" ? "start to end" : "end to start"}\n\n## Path\n\n${path}\n\n## Current focus\n\n**${selectedNode?.label || selectedStep?.node_id || "Unknown symbol"}** at \`${location(selectedNode)}\`\n\n${codeBlock(sourceText(selectedNode))}${limitationsSection(flow.limitations)}${explorerReference(url)}`;
}

export function explainEntry(app: App, entry: Entry, selectedIndex: number, url?: string) {
  const selectedHop = entry.hops[selectedIndex] ?? entry.hops[0];
  const selectedNode = app.nodes.find((node) => node.id === selectedHop?.node_id);
  const path = entry.hops.map((hop, index) => {
    const node = app.nodes.find((item) => item.id === hop.node_id);
    const context = scope(node);
    return `${index + 1}. **${node?.label || hop.node_id}** — ${hop.edge_label || "calls"}\n   \`${location(node)}\`${context ? ` · ${context}` : ""}${hop.caption ? `\n   ${hop.caption}` : ""}`;
  }).join("\n");

  return `# ${entry.label}\n\n${entry.description || `A request flow through ${entry.hops.length} symbols.`}\n\n${repositoryHeader(app)}\n\n## Request flow\n\n${path}\n\n## Current focus\n\n**${selectedNode?.label || selectedHop?.node_id || "Unknown symbol"}** at \`${location(selectedNode)}\`\n\n${codeBlock(sourceText(selectedNode))}${limitationsSection(entry.limitations)}${explorerReference(url)}`;
}

export function explainNode(app: App, node: Node, url?: string) {
  const parent = node.parentId ? app.nodes.find((item) => item.id === node.parentId) : undefined;
  const children = app.nodes.filter((item) => item.parentId === node.id).slice(0, 12);
  const flows = app.flows.filter((flow) => flow.steps.some((step) => step.node_id === node.id));
  const entries = app.entries.filter((entry) => entry.hops.some((hop) => hop.node_id === node.id));
  const relationships = app.edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .slice(0, 12)
    .map((edge) => {
      const outgoing = edge.source === node.id;
      const peerId = outgoing ? edge.target : edge.source;
      const peer = app.nodes.find((item) => item.id === peerId);
      return `- ${outgoing ? "leads to" : "receives from"} **${peer?.label || peerId}** — ${edge.relation || "connected"} (\`${location(peer)}\`)`;
    })
    .join("\n");
  const pathNames = flows.slice(0, 8).map((flow) => `- ${flow.name}`).join("\n");
  const entryNames = entries.slice(0, 8).map((entry) => `- ${entry.label}`).join("\n");

  const hierarchy = [
    parent ? `Enclosed by: **${parent.label || parent.id}**` : "",
    children.length ? `\n## Contained symbols\n\n${children.map((child) => `- ${child.label || child.id} (${child.kind}, line ${child.line || "—"})`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  return `# ${node.label || node.id}\n\n${node.documentation || `A ${node.kind} in the loaded code graph.`}\n\n${repositoryHeader(app)}\nKind: ${node.kind}\nLocation: \`${location(node)}\`${scope(node) ? `\nContext: ${scope(node)}` : ""}\n\n${hierarchy ? `${hierarchy}\n` : ""}## Source\n\n${codeBlock(sourceText(node))}\n\n## Where it appears\n\n${pathNames || "No graph paths include this symbol."}\n\n${entryNames ? `## Request flows\n\n${entryNames}\n\n` : ""}## Nearby relationships\n\n${relationships || "No connected relationships are included."}${explorerReference(url)}`;
}
