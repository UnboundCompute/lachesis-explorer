"""Small publish-time validator for the graph-first Explorer bundle contract."""
from __future__ import annotations

import json
from typing import Any


def _fail(message: str) -> None:
    raise ValueError(f"invalid Explorer bundle: {message}")


def _non_empty_string(value: Any, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        _fail(f"{label} must be a non-empty string")


def validate_bundle(bundle: Any) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        _fail("bundle must be an object")
    if bundle.get("format") != "lachesis-explorer-bundle" or bundle.get("schema_version") != "2.0":
        _fail("only schema 2.0 graph-first bundles are supported")

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
        if path.get("id") is not None:
            if not isinstance(path["id"], str) or not path["id"] or path["id"] in value_path_ids:
                _fail(f"paths.values[{index}].id is invalid or duplicated")
            value_path_ids.add(path["id"])
        for step in path["steps"]:
            if not isinstance(step, dict) or step.get("node_id") not in node_ids:
                _fail(f"paths.values[{index}] references an unknown node")

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
    return bundle


def validate_file(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as stream:
        return validate_bundle(json.load(stream))
