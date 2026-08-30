import { readFile } from "node:fs/promises";

const fixtures = ["public/code-exploration-bundle.json", "public/demo-bundle.json"];

function fail(file, message) {
  throw new Error(`${file}: ${message}`);
}

function validateNodes(file, ids, steps, label, { required = true } = {}) {
  if (!Array.isArray(steps)) fail(file, `${label} steps must be an array`);
  if (required && steps.length === 0) fail(file, `${label} must contain at least one step`);
  for (const [stepIndex, step] of steps.entries()) {
    const nodeId = String(step?.node_id ?? step?.nodeId ?? step?.node ?? "");
    if (!ids.has(nodeId)) fail(file, `${label} step ${stepIndex} references a missing node`);
  }
}

function verify(file, bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) fail(file, "bundle must be a JSON object");
  const schemaVersion = String(bundle.schema_version ?? "");
  const format = String(bundle.format ?? "");
  if (format && format !== "lachesis-explorer-bundle") fail(file, "format must be lachesis-explorer-bundle");
  if (schemaVersion && !["1.0", "2.0"].includes(schemaVersion)) fail(file, `unsupported schema_version ${schemaVersion}`);
  if (schemaVersion === "2.0" && format !== "lachesis-explorer-bundle") fail(file, "2.0 bundles must declare format lachesis-explorer-bundle");
  const graph = bundle.graph;
  if (!graph || !Array.isArray(graph.nodes)) fail(file, "graph.nodes must be an array");
  const ids = new Set(graph.nodes.map((node) => String(node.id ?? node.node_id ?? "")));
  if (ids.size !== graph.nodes.length || ids.has("")) fail(file, "graph nodes must have unique non-empty IDs");
  if (graph.edges != null && !Array.isArray(graph.edges)) fail(file, "graph.edges must be an array");

  for (const [index, edge] of (graph.edges ?? []).entries()) {
    const source = String(edge.source ?? edge.from ?? edge.source_id ?? "");
    const target = String(edge.target ?? edge.to ?? edge.target_id ?? "");
    if (!ids.has(source) || !ids.has(target)) fail(file, `graph.edges[${index}] references a missing node`);
  }

  const paths = bundle.paths ?? {};
  for (const [kind, pathList] of Object.entries({ values: paths.values ?? graph.value_flows ?? graph.flows ?? [], requests: paths.requests ?? graph.request_paths ?? graph.callpaths ?? [] })) {
    if (!Array.isArray(pathList)) fail(file, `paths.${kind} must be an array`);
    for (const [pathIndex, path] of pathList.entries()) {
      validateNodes(file, ids, path.steps ?? path.hops ?? [], `paths.${kind}[${pathIndex}]`);
      const entryNode = path.entry_node ?? path.entryNode;
      if (entryNode != null && !ids.has(String(entryNode))) fail(file, `paths.${kind}[${pathIndex}] entry_node references a missing node`);
    }
  }

  if (bundle.mcp != null && !Array.isArray(bundle.mcp)) fail(file, "mcp must be an array");
  for (const [index, record] of (bundle.mcp ?? []).entries()) {
    for (const nodeId of (Array.isArray(record.nodes) ? record.nodes : record.node_ids ?? [])) {
      if (!ids.has(String(nodeId))) fail(file, `mcp[${index}] references a missing node`);
    }
  }

  const findings = bundle.security?.findings ?? bundle.findings;
  if (findings != null && !Array.isArray(findings)) fail(file, "security.findings must be an array");
  for (const [index, finding] of (findings ?? []).entries()) {
    const witness = finding.witness?.steps;
    if (witness != null) validateNodes(file, ids, witness, `findings[${index}].witness`, { required: false });
  }

  if (bundle.security != null && (typeof bundle.security !== "object" || Array.isArray(bundle.security))) fail(file, "security must be an object");
  console.log(`${file}: valid (${graph.nodes.length} nodes, ${(graph.edges ?? []).length} edges)`);
}

for (const file of process.argv.slice(2).length ? process.argv.slice(2) : fixtures) {
  const bundle = JSON.parse(await readFile(file, "utf8"));
  verify(file, bundle);
}
