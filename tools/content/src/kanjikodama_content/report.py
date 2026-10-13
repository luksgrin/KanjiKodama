"""HTML validation report."""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, PackageLoader, select_autoescape

_env = Environment(loader=PackageLoader("kanjikodama_content", "templates"), autoescape=select_autoescape(["html"]))


def render(path: Path, **ctx) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_env.get_template("report.html.j2").render(**ctx), encoding="utf-8")
