"""Assign every KANJIDIC2 kanji to a block (N5..N1) or an Obscure sub-tier."""

from __future__ import annotations

from collections import Counter

from .model import Classified, KanjiEntry


def obscure_tier(k: KanjiEntry) -> int:
    if k.is_joyo:
        return 1
    if k.is_jinmeiyo:
        return 2
    row = k.jis208_row
    if row is not None and row <= 47:
        return 3
    return 4


def classify_all(
    kanjidic: dict[str, KanjiEntry], jlpt_levels: dict[str, str]
) -> dict[str, Classified]:
    out: dict[str, Classified] = {}
    for literal, k in kanjidic.items():
        if literal in jlpt_levels:
            out[literal] = Classified(literal, jlpt_levels[literal])
            continue
        if not k.meanings or not (k.on or k.kun):
            continue  # Obscure requires at least one reading and one meaning
        out[literal] = Classified(literal, "OBSCURE", obscure_tier(k))
    return out


def counts(classified: dict[str, Classified]) -> dict[str, int]:
    c = Counter()
    for cl in classified.values():
        key = cl.block if cl.tier is None else f"OBSCURE-{cl.tier}"
        c[key] += 1
    return dict(c)
