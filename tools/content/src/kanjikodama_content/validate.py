"""Validation rules (spec §8). Errors fail the build; warnings go to the report."""

from __future__ import annotations

from dataclasses import dataclass, field

from .model import WORDS_PER_LEVEL_BAND, Component, KanjiPlan, Level, Series, VocabPick


@dataclass
class Validation:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def run(
    levels: list[Level],
    plans: dict[str, KanjiPlan],
    components: dict[str, Component],
    series: list[Series],
    vocab: list[VocabPick],
    expected_block_of: dict[str, str],
) -> Validation:
    v = Validation()
    level_of_kanji = {lit: p.level for lit, p in plans.items()}
    built_levels = {lv.number for lv in levels}
    for lv in levels:
        for lit in lv.kanji:
            p = plans[lit]
            if expected_block_of.get(lit) != p.block:
                v.errors.append(f"{lit} is in block {p.block} but classified as {expected_block_of.get(lit)}")
            for use in p.components:
                c = components.get(use.slug)
                if c is None:
                    v.errors.append(f"{lit}: component {use.slug} missing")
                elif c.level is not None and c.level > p.level:
                    v.errors.append(f"{lit} (level {p.level}) uses component {use.slug} taught at level {c.level}")
    members = {m.literal for s in series for m in s.members}
    for s in series:
        for m in s.members:
            if m.literal not in plans:
                v.errors.append(f"series {s.component}/{s.reading}: member {m.literal} not in curriculum")
    for p in plans.values():
        if p.phonetic and p.literal not in members and p.level in built_levels:
            v.errors.append(f"{p.literal} has phonetic {p.phonetic} but belongs to no series")
    per_level: dict[int, int] = {}
    for w in vocab:
        per_level[w.level] = per_level.get(w.level, 0) + 1
        for k in w.kanji:
            if k not in level_of_kanji:
                v.errors.append(f"vocab {w.word}: kanji {k} is not taught")
            elif level_of_kanji[k] > w.level:
                v.errors.append(f"vocab {w.word} (level {w.level}) uses {k} taught at level {level_of_kanji[k]}")
    for lv in levels:
        n = per_level.get(lv.number, 0)
        lo, hi = WORDS_PER_LEVEL_BAND
        if lv.block != "OBSCURE" and not (lo <= n <= hi):
            v.warnings.append(f"level {lv.number} ({lv.block}) has {n} words (band {lo}–{hi})")
    unnamed = [c.slug for c in components.values() if not c.named]
    if unnamed:
        v.warnings.append(f"{len(unnamed)} unnamed components: {' '.join(unnamed)}")
    return v
