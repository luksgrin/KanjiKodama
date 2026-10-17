"""KRADFILE / RADKFILE parsers (EUC-JP)."""

from __future__ import annotations

import gzip
from pathlib import Path


def parse_kradfile(path: Path) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    with gzip.open(path, "rb") as f:
        for raw in f:
            line = raw.decode("euc_jp", errors="replace").strip()
            if not line or line.startswith("#"):
                continue
            kanji, _, rest = line.partition(":")
            out[kanji.strip()] = rest.split()
    return out


def parse_radkfile(path: Path) -> dict[str, tuple[int, str]]:
    """radical -> (stroke count, string of kanji containing it)."""
    out: dict[str, tuple[int, str]] = {}
    current: str | None = None
    strokes = 0
    buf: list[str] = []
    with gzip.open(path, "rb") as f:
        for raw in f:
            line = raw.decode("euc_jp", errors="replace").rstrip("\n")
            if line.startswith("#"):
                continue
            if line.startswith("$"):
                if current is not None:
                    out[current] = (strokes, "".join(buf))
                parts = line.split()
                current, strokes, buf = parts[1], int(parts[2]), []
            elif current is not None:
                buf.append(line.strip())
    if current is not None:
        out[current] = (strokes, "".join(buf))
    return out
