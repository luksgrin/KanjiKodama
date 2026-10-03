"""Level ordering within a block (spec §4.1)."""

from __future__ import annotations

import heapq
import math
from collections import defaultdict

from .model import KANJI_PER_LEVEL, KanjiEntry


def level_count(n: int) -> int:
    return max(1, math.ceil(n / KANJI_PER_LEVEL))


def chunk(items: list[str], n_levels: int) -> list[list[str]]:
    size = math.ceil(len(items) / n_levels) if n_levels else len(items)
    return [items[i : i + size] for i in range(0, len(items), size)] if items else []


def order_block(
    literals: list[str],
    kanjidic: dict[str, KanjiEntry],
    deps: dict[str, set[str]],  # kanji -> component kanji that are in the same block
    series_of: dict[str, int | None],
    pins: dict[str, int],  # literal -> ordinal within block (1-based level)
) -> list[list[str]]:
    """Topological order by dependencies with frequency priority and series clustering."""
    lits = set(literals)
    indeg = dict.fromkeys(literals, 0)
    rev: dict[str, list[str]] = defaultdict(list)
    for lit in literals:
        for d in deps.get(lit, ()):
            if d in lits and d != lit:
                indeg[lit] += 1
                rev[d].append(lit)

    def freq(lit: str) -> int:
        k = kanjidic.get(lit)
        return (k.freq if k and k.freq else 9999) + (k.strokes or 0) / 100 if k else 9999

    # series anchor: the lowest-frequency rank among members already in the block
    anchor: dict[int, float] = {}
    for lit in literals:
        s = series_of.get(lit)
        if s is not None:
            anchor[s] = min(anchor.get(s, 1e9), freq(lit))

    def key(lit: str) -> tuple[float, float, str]:
        s = series_of.get(lit)
        a = anchor.get(s, freq(lit)) if s is not None else freq(lit)
        # cluster near the series anchor, but the anchor itself goes first
        return (a + (0.5 if s is not None and anchor.get(s) != freq(lit) else 0.0), freq(lit), lit)

    heap = [(key(lit), lit) for lit in literals if indeg[lit] == 0]
    heapq.heapify(heap)
    ordered: list[str] = []
    while heap:
        _, lit = heapq.heappop(heap)
        ordered.append(lit)
        for nxt in rev[lit]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                heapq.heappush(heap, (key(nxt), nxt))
    if len(ordered) != len(literals):  # cycle: append leftovers by frequency
        rest = sorted(set(literals) - set(ordered), key=freq)
        ordered.extend(rest)

    n_levels = level_count(len(ordered))
    levels = chunk(ordered, n_levels)
    # apply pins: move pinned kanji to the requested level (clamped)
    for lit, ordinal in pins.items():
        if lit in lits:
            for lv in levels:
                if lit in lv:
                    lv.remove(lit)
            target = min(max(ordinal, 1), len(levels)) - 1
            levels[target].append(lit)
    return [lv for lv in levels if lv]
