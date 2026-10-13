"""Unofficial JLPT lists (Jonathan Waller's, via MIT-licensed mirrors)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from ..model import JlptWord


def parse_kanji_levels(path: Path) -> dict[str, str]:
    """kanji -> 'N5'..'N1'. Only the jlpt_new field is read."""
    data = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for literal, fields in data.items():
        lvl = fields.get("jlpt_new")
        if lvl in (1, 2, 3, 4, 5):
            out[literal] = f"N{lvl}"
    return out


def parse_vocab(path: Path, level: str) -> list[JlptWord]:
    out = []
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            expr = (row.get("expression") or "").strip()
            reading = (row.get("reading") or "").strip()
            if expr:
                out.append(JlptWord(expr, reading or expr, level))
    return out
