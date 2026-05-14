"""Build a lightweight knowledge-graph slice from source (Python AST)."""

from __future__ import annotations

import ast
import os
from dataclasses import dataclass, asdict
from typing import Any, Optional


@dataclass
class KnowledgeNode:
    id: str
    kind: str
    label: str
    fileFsPath: str
    line: Optional[int] = None
    moduleSpecifier: Optional[str] = None


@dataclass
class KnowledgeEdge:
    fromId: str
    toId: str
    kind: str


def _rel_file_label(file_path: str) -> str:
    return os.path.basename(file_path)


def build_python_slice(file_fs_path: str, content: str) -> dict[str, Any]:
    file_id = f"file:{file_fs_path}"
    nodes: list[KnowledgeNode] = [
        KnowledgeNode(id=file_id, kind="file", label=_rel_file_label(file_fs_path), fileFsPath=file_fs_path)
    ]
    edges: list[KnowledgeEdge] = []
    symbol_lines: list[str] = []

    def add_symbol(kind: str, name: str, line: int) -> None:
        sym_id = f"sym:{file_fs_path}:{line}:{name}"
        nodes.append(
            KnowledgeNode(id=sym_id, kind=kind, label=name, fileFsPath=file_fs_path, line=line)
        )
        edges.append(KnowledgeEdge(fromId=file_id, toId=sym_id, kind="contains"))
        symbol_lines.append(f"{kind}:{name}:{line}")

    def add_import(spec: str, line: int) -> None:
        imp_id = f"imp:{file_fs_path}:{line}:{spec}"
        nodes.append(
            KnowledgeNode(
                id=imp_id,
                kind="import",
                label=spec,
                fileFsPath=file_fs_path,
                line=line,
                moduleSpecifier=spec,
            )
        )
        edges.append(KnowledgeEdge(fromId=file_id, toId=imp_id, kind="imports"))
        if spec.startswith(".") or spec.startswith("/"):
            tgt = os.path.normpath(os.path.join(os.path.dirname(file_fs_path), spec))
            edges.append(KnowledgeEdge(fromId=imp_id, toId=f"file:{tgt}", kind="imports"))
        else:
            edges.append(KnowledgeEdge(fromId=imp_id, toId=f"mod:import:{spec}", kind="imports"))
        symbol_lines.append(f"import:{spec}:{line}")

    try:
        tree = ast.parse(content, filename=file_fs_path)
    except SyntaxError:
        symbol_lines.append("error:syntax")
        digest = f"File: {file_fs_path}\n(Syntax error — could not parse Python AST)"
        return {
            "fileFsPath": file_fs_path,
            "languageId": "python",
            "signature": "|".join(sorted(symbol_lines)),
            "nodes": [asdict(n) for n in nodes],
            "edges": [asdict(e) for e in edges],
            "digest": digest,
        }

    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.name
                line = getattr(node, "lineno", 1) or 1
                add_import(name, line)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            line = getattr(node, "lineno", 1) or 1
            if node.level and mod == "":
                spec = "." * node.level
            elif node.level:
                spec = "." * node.level + mod
            else:
                spec = mod
            add_import(spec or "(from)", line)
            for alias in node.names:
                sym = f"{spec}:{alias.name}" if spec else alias.name
                symbol_lines.append(f"from_import:{sym}:{line}")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            line = getattr(node, "lineno", 1) or 1
            add_symbol("function", node.name, line)
        elif isinstance(node, ast.ClassDef):
            line = getattr(node, "lineno", 1) or 1
            add_symbol("class", node.name, line)
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    ml = getattr(item, "lineno", line) or line
                    add_symbol("method", f"{node.name}.{item.name}", ml)

    symbol_lines.sort()
    signature = "|".join(symbol_lines)

    digest_lines: list[str] = []
    digest_lines.append(f"File: {file_fs_path}")
    imps = [n.moduleSpecifier or n.label for n in nodes if n.kind == "import"]
    if imps:
        digest_lines.append(f"Imports: {', '.join(dict.fromkeys(imps))}")
    defs = [n for n in nodes if n.kind not in ("file", "import")]
    for d in defs[:80]:
        digest_lines.append(f"- [{d.kind}] {d.label} (L{d.line})")
    if len(defs) > 80:
        digest_lines.append(f"... and {len(defs) - 80} more symbols")

    return {
        "fileFsPath": file_fs_path,
        "languageId": "python",
        "signature": signature,
        "nodes": [asdict(n) for n in nodes],
        "edges": [asdict(e) for e in edges],
        "digest": "\n".join(digest_lines),
    }


def empty_slice(file_fs_path: str, language_id: str, reason: str) -> dict[str, Any]:
    file_id = f"file:{file_fs_path}"
    return {
        "fileFsPath": file_fs_path,
        "languageId": language_id,
        "signature": f"empty:{reason}",
        "nodes": [asdict(KnowledgeNode(id=file_id, kind="file", label=_rel_file_label(file_fs_path), fileFsPath=file_fs_path))],
        "edges": [],
        "digest": f"File: {file_fs_path}\n({reason})",
    }
