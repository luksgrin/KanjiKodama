"""Structural mnemonic scaffolds, replaced by hand-written text from content/mnemonics/*.yaml."""

from __future__ import annotations

from pathlib import Path

import yaml

from .model import Component, KanjiEntry, KanjiPlan, Series


def load_handwritten(mnemonic_dir: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    if not mnemonic_dir.exists():
        return out
    for f in sorted(mnemonic_dir.glob("*.yaml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        for literal, fields in data.items():
            if isinstance(fields, dict):
                out[literal] = {k: str(v) for k, v in fields.items()}
    return out


def scaffold(
    plan: KanjiPlan,
    entry: KanjiEntry,
    components: dict[str, Component],
    series: dict[int, Series],
) -> tuple[str, str]:
    meaning = entry.meanings[0] if entry.meanings else "?"
    parts = []
    for use in plan.components:
        c = components.get(use.slug)
        label = c.name if c else use.slug
        tag = {"semantic": " (meaning)", "phonetic": " (sound)", "both": " (meaning + sound)"}.get(use.role, "")
        parts.append(f"{use.slug} {label}{tag}")
    if parts:
        meaning_mn = f"{' + '.join(parts)} → {plan.literal} “{meaning}”."
    else:
        meaning_mn = f"{plan.literal} “{meaning}” is a basic form: learn its shape directly."
    if plan.phonetic and plan.series_id in series:
        s = series[plan.series_id]
        actual = entry.on[0] if entry.on else "—"
        if plan.match == "exact":
            reading_mn = f"{plan.phonetic}-series → {s.reading}. {plan.literal} follows the rule: {actual}."
        elif plan.match == "variant":
            reading_mn = f"{plan.phonetic}-series → {s.reading}. {plan.literal} is a close variant: {actual}."
        else:
            reading_mn = f"{plan.phonetic}-series usually → {s.reading}, but {plan.literal} is an exception: {actual}."
    elif entry.on:
        reading_mn = f"No phonetic component helps here. Learn {entry.on[0]} directly."
    else:
        reading_mn = f"Kun'yomi only: {entry.kun[0] if entry.kun else '—'}."
    return meaning_mn, reading_mn
