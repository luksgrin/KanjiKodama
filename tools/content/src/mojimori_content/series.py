"""Phonetic series derivation (spec §4.3)."""

from __future__ import annotations

from collections import defaultdict

from . import kana
from .model import KanjiEntry, Series, SeriesMember

_POS_RANK = {"right": 0, "bottom": 1, "top": 2, "left": 3, None: 4}


def first_on(k: KanjiEntry) -> str | None:
    return k.on[0] if k.on else None


def best_match(kanji: KanjiEntry, comp: KanjiEntry) -> tuple[str, str] | None:
    """Best (match, component reading) between a kanji's on'yomi and a component's."""
    best: tuple[int, str, str] | None = None
    for a in kanji.on:
        for c in comp.on:
            m = kana.classify(a, c)
            rank = {"exact": 0, "variant": 1, "irregular": 2}[m]
            if best is None or rank < best[0]:
                best = (rank, m, c)
    if best is None or best[1] == "irregular":
        return None
    return best[1], best[2]


def choose_phonetic(
    literal: str,
    uses: list,  # RawUse list
    kanjidic: dict[str, KanjiEntry],
    kvg_phon: str | None,
    override: str | None,
) -> str | None:
    """Pick the phonetic component for a kanji, or None."""
    if override is not None:
        return None if override == "none" else override
    k = kanjidic.get(literal)
    if not k or not k.on:
        return None
    candidates = []
    for u in uses:
        if u.synthetic:
            continue
        marked = u.is_phon or (kvg_phon is not None and kvg_phon in (u.element, u.original))
        comp_literal = u.original or u.element
        comp = kanjidic.get(comp_literal) or kanjidic.get(u.element)
        if not comp or not comp.on or comp_literal == literal:
            if marked:
                candidates.append((0, 2, _POS_RANK.get(u.position, 4), u.element))
            continue
        m = best_match(k, comp)
        score = 0 if marked else 1
        if m:
            candidates.append((score, {"exact": 0, "variant": 1}[m[0]], _POS_RANK.get(u.position, 4), u.element))
        elif marked:
            candidates.append((0, 2, _POS_RANK.get(u.position, 4), u.element))
    if not candidates:
        return None
    candidates.sort()
    return candidates[0][3]


def build_series(
    phonetic_of: dict[str, str],
    kanjidic: dict[str, KanjiEntry],
    component_reading_glyph: dict[str, str],
) -> tuple[list[Series], dict[str, tuple[int, str, str]]]:
    """Group kanji by phonetic component and reading core.

    Returns the series list and a map literal -> (series id, match, predicted reading).
    """
    by_comp: dict[str, list[str]] = defaultdict(list)
    for lit, comp in phonetic_of.items():
        by_comp[comp].append(lit)
    series: list[Series] = []
    info: dict[str, tuple[int, str, str]] = {}
    sid = 0
    for comp, members in sorted(by_comp.items()):
        comp_entry = kanjidic.get(component_reading_glyph.get(comp, comp)) or kanjidic.get(comp)
        comp_ons = comp_entry.on if comp_entry and comp_entry.on else []
        # cluster members by the core of their best-matching reading
        clusters: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
        for lit in members:
            k = kanjidic[lit]
            actual = first_on(k) or ""
            best: tuple[int, str, str, str] | None = None  # (rank, match, comp reading, actual)
            for c in comp_ons:  # component's primary reading first
                for a in k.on:  # kanji's primary reading first
                    m = kana.classify(a, c)
                    rank = {"exact": 0, "variant": 1, "irregular": 2}[m]
                    if rank < 2 and (best is None or rank < best[0]):
                        best = (rank, m, c, a)
            if best:
                clusters[kana.core(best[2])].append((lit, best[3], best[2]))
            else:
                clusters["__irregular__"].append((lit, actual, comp_ons[0] if comp_ons else actual))
        irregular = clusters.pop("__irregular__", [])
        if clusters:
            # singleton clusters on a non-primary component reading are exceptions, not series
            primary_core = kana.core(comp_ons[0]) if comp_ons else None
            for core_key in [c for c in clusters if len(clusters[c]) < 2 and c != primary_core]:
                if len(clusters) == 1:
                    break
                irregular.extend(clusters.pop(core_key))
        if not clusters:
            # phonetic marked but no reading agreement: one series from the component's reading
            reading = comp_ons[0] if comp_ons else (irregular[0][1] if irregular else "")
            sid += 1
            s = Series(sid, comp, reading, [])
            for lit, actual, _ in irregular:
                s.members.append(SeriesMember(lit, actual, "irregular"))
                info[lit] = (sid, "irregular", reading)
            series.append(s)
            continue
        # largest cluster gets the irregulars attached
        main_core = max(clusters, key=lambda c: len(clusters[c]))
        for core_key, items in clusters.items():
            sid += 1
            reading = max((r for _, _, r in items), key=lambda r: sum(1 for i in items if i[2] == r))
            s = Series(sid, comp, reading, [])
            for lit, actual, _ in items:
                m = kana.classify(actual, reading)
                s.members.append(SeriesMember(lit, actual, m))
                info[lit] = (sid, m, reading)
            if core_key == main_core:
                for lit, actual, _ in irregular:
                    s.members.append(SeriesMember(lit, actual, "irregular"))
                    info[lit] = (sid, "irregular", reading)
            series.append(s)
    for s in series:
        s.freeze()
    return series, info
