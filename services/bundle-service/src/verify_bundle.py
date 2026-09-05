"""Small publish-time validator for the graph-first Explorer bundle contract."""
from __future__ import annotations

import json
from typing import Any


def _fail(message: str) -> None:
    raise ValueError(f"invalid Explorer bundle: {message}")


def _non_empty_string(value: Any, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        _fail(f"{label} must be a non-empty string")


def _source_backed(node: dict[str, Any]) -> bool:
    if not isinstance(node.get("file"), str) or not node["file"].strip():
        return False
    if not isinstance(node.get("line"), int) or node["line"] < 1:
        return False
    snippet = node.get("snippet")
    window = node.get("source_window")
    return bool(isinstance(snippet, str) and snippet.strip()) or bool(
        isinstance(window, dict) and isinstance(window.get("lines"), list) and window["lines"]
    )


def _understanding_path_has_source(path: Any, nodes: dict[str, dict[str, Any]], key: str) -> bool:
    if not isinstance(path, dict):
        return False
    raw_steps = path.get("steps") if key == "values" else path.get("hops")
    if not isinstance(raw_steps, list):
        return False
    node_ids = [step.get("node_id") for step in raw_steps if isinstance(step, dict)]
    if len(node_ids) < 2 or len(set(node_ids)) < 2:
        return False
    if any(node_id not in nodes or not _source_backed(nodes[node_id]) for node_id in node_ids):
        return False
    source_id = path.get("source_node")
    sink_id = path.get("sink_node")
    return source_id is None or sink_id is None or source_id != sink_id


def _validate_understanding_projection(bundle: dict[str, Any], graph: dict[str, Any], node_ids: set[str]) -> None:
    if str(bundle.get("analysis_projection", "")).strip().lower() != "code-understanding":
        return
    entrypoints = graph.get("entrypoints")
    if not isinstance(entrypoints, list) or not entrypoints:
        _fail("code-understanding projections must include graph.entrypoints")
    for index, entrypoint in enumerate(entrypoints):
        if not isinstance(entrypoint, dict) or entrypoint.get("node_id") not in node_ids:
            _fail(f"graph.entrypoints[{index}] must reference a graph node")
    paths = bundle.get("paths") or {}
    nodes = {node["id"]: node for node in graph["nodes"]}
    candidates = [
        *(paths.get("values", paths.get("value_flows", [])) if isinstance(paths, dict) else []),
        *(paths.get("requests", paths.get("request_paths", [])) if isinstance(paths, dict) else []),
    ]
    if not any(_understanding_path_has_source(path, nodes, "values" if isinstance(path, dict) and "steps" in path else "requests") for path in candidates):
        _fail("code-understanding projections need a multi-node source-backed path")


def validate_bundle(bundle: Any) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        _fail("bundle must be an object")
    if bundle.get("format") != "lachesis-explorer-bundle" or bundle.get("schema_version") != "2.0":
        _fail("only schema 2.0 graph-first bundles are supported")
    if "analysis_projection" in bundle:
        _non_empty_string(bundle["analysis_projection"], "analysis_projection")

    meta = bundle.get("meta")
    if not isinstance(meta, dict):
        _fail("meta must be an object")
    for key in ("repository", "language", "revision"):
        _non_empty_string(meta.get(key), f"meta.{key}")
    for key in ("lines", "indexed_nodes"):
        if not isinstance(meta.get(key), int) or isinstance(meta[key], bool) or meta[key] < 0:
            _fail(f"meta.{key} must be a non-negative integer")

    graph = bundle.get("graph")
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list) or not graph["nodes"]:
        _fail("graph.nodes must be a non-empty array")
    node_ids: set[str] = set()
    for index, node in enumerate(graph["nodes"]):
        if not isinstance(node, dict):
            _fail(f"graph.nodes[{index}] must be an object")
        for key in ("id", "kind", "label"):
            _non_empty_string(node.get(key), f"graph.nodes[{index}].{key}")
        if not isinstance(node.get("file"), str):
            _fail(f"graph.nodes[{index}].file must be a string")
        if node["id"] in node_ids:
            _fail(f"graph.nodes[{index}].id is duplicated")
        node_ids.add(node["id"])
        if not isinstance(node.get("line"), int) or isinstance(node["line"], bool) or node["line"] < 0:
            _fail(f"graph.nodes[{index}].line must be a non-negative integer")
        source_window = node.get("source_window")
        has_snippet = isinstance(node.get("snippet"), str) and bool(node["snippet"].strip())
        has_window = isinstance(source_window, dict) and isinstance(source_window.get("lines"), list) and bool(source_window["lines"])
        if not has_snippet and not has_window:
            _fail(f"graph.nodes[{index}] needs snippet or source_window")

    edges = graph.get("edges", [])
    if not isinstance(edges, list):
        _fail("graph.edges must be an array")
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict) or edge.get("source") not in node_ids or edge.get("target") not in node_ids:
            _fail(f"graph.edges[{index}] references an unknown node")

    paths = bundle.get("paths") or {}
    if not isinstance(paths, dict):
        _fail("paths must be an object")
    value_paths = paths.get("values", paths.get("value_flows", []))
    if not isinstance(value_paths, list):
        _fail("paths.values must be an array")
    value_path_ids: set[str] = set()
    for index, path in enumerate(value_paths):
        if not isinstance(path, dict) or not isinstance(path.get("steps"), list) or not path["steps"]:
            _fail(f"paths.values[{index}] must contain steps")
        for endpoint in ("source_node", "sink_node"):
            if path.get(endpoint) is not None and path[endpoint] not in node_ids:
                _fail(f"paths.values[{index}].{endpoint} references an unknown node")
        if path.get("id") is not None:
            if not isinstance(path["id"], str) or not path["id"] or path["id"] in value_path_ids:
                _fail(f"paths.values[{index}].id is invalid or duplicated")
            value_path_ids.add(path["id"])
        for step in path["steps"]:
            if not isinstance(step, dict) or step.get("node_id") not in node_ids:
                _fail(f"paths.values[{index}] references an unknown node")

    request_paths = paths.get("requests", paths.get("request_paths", []))
    if not isinstance(request_paths, list):
        _fail("paths.requests must be an array")
    request_path_ids: set[str] = set()
    for index, path in enumerate(request_paths):
        if not isinstance(path, dict) or not isinstance(path.get("hops"), list) or not path["hops"]:
            _fail(f"paths.requests[{index}] must contain hops")
        for endpoint in ("source_node", "sink_node"):
            if path.get(endpoint) is not None and path[endpoint] not in node_ids:
                _fail(f"paths.requests[{index}].{endpoint} references an unknown node")
        if path.get("id") is not None:
            if not isinstance(path["id"], str) or not path["id"] or path["id"] in request_path_ids:
                _fail(f"paths.requests[{index}].id is invalid or duplicated")
            request_path_ids.add(path["id"])
        if path.get("entry_node") is not None and path["entry_node"] not in node_ids:
            _fail(f"paths.requests[{index}].entry_node references an unknown node")
        for hop in path["hops"]:
            if not isinstance(hop, dict) or hop.get("node_id") not in node_ids:
                _fail(f"paths.requests[{index}] references an unknown node")

    findings = (bundle.get("security") or {}).get("findings", [])
    if not isinstance(findings, list):
        _fail("security.findings must be an array")
    finding_ids: set[str] = set()
    for finding in findings:
        finding_id = finding.get("finding_id", finding.get("id")) if isinstance(finding, dict) else None
        if finding_id is not None:
            if not isinstance(finding_id, str) or not finding_id or finding_id in finding_ids or finding_id in value_path_ids:
                _fail("security finding IDs must be unique and distinct from value path IDs")
            finding_ids.add(finding_id)
    _validate_understanding_projection(bundle, graph, node_ids)
    return bundle


def validate_file(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as stream:
        return validate_bundle(json.load(stream))


def prepare_file(path: str) -> dict[str, Any]:
    """Canonicalize exporter nulls, validate, and persist the publishable artifact."""
    with open(path, encoding="utf-8") as stream:
        bundle = json.load(stream)
    for node in ((bundle.get("graph") or {}).get("nodes") or []):
        if isinstance(node, dict):
            if node.get("file") is None:
                node["file"] = ""
            if node.get("line") is None:
                node["line"] = 0
    validate_bundle(bundle)
    with open(path, "w", encoding="utf-8") as stream:
        json.dump(bundle, stream, separators=(",", ":"), ensure_ascii=False)
    return bundle
