"""Tatoeba Japanese sentences with English translations."""

from __future__ import annotations

import bz2
import csv
from pathlib import Path

from ..model import SentencePair


def _sentences(path: Path) -> dict[int, str]:
    out = {}
    with bz2.open(path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if len(row) >= 3:
                out[int(row[0])] = row[2]
    return out


def parse(ja_path: Path, en_path: Path, links_path: Path, *, max_len: int = 45) -> list[SentencePair]:
    ja = _sentences(ja_path)
    en = _sentences(en_path)
    pairs: dict[int, SentencePair] = {}
    with bz2.open(links_path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if len(row) < 2:
                continue
            a, b = int(row[0]), int(row[1])
            if a in ja and b in en and a not in pairs and len(ja[a]) <= max_len:
                pairs[a] = SentencePair(a, ja[a], en[b])
    return list(pairs.values())
