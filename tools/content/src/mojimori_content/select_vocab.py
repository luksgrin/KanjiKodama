"""Vocabulary selection (spec §4.2)."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

from .model import (
    MAX_WORDS_PER_LEVEL,
    MIN_WORDS_PER_KANJI,
    TARGET_WORDS_PER_LEVEL,
    JlptWord,
    JmEntry,
    VocabPick,
)
from .sources.jmdict import priority_score

_KANJI = re.compile(r"[㐀-鿿豈-﫿]")
_KANA_ONLY = re.compile(r"^[぀-ヿー・ー]+$")
_EXCLUDE_MISC = {"{arch}", "{obsc}", "{rare}", "{obs}", "{vulg}", "{X}", "{derog}", "{sl}", "{m-sl}", "{net-sl}"}
_EXCLUDE_POS = {"{n-pr}", "{unc}"}
_BAD_KINF = {"{iK}", "{oK}", "{rK}", "{sK}"}
_JAPANESE_FORM = re.compile(r"^[\u3040-\u30ff\u30fc\u3005\u3400-\u9fff\uf900-\ufaff・ー]+$")
_SOURCE_RANK = {"jlpt": 0, "seed": 1, "priority": 2, "fill": 3}


def kanji_in(text: str) -> list[str]:
    return _KANJI.findall(text)


_PAREN = re.compile(r"[（(][^）)]*[）)]")


def normalise_expression(expr: str) -> list[str]:
    """Split noisy list entries ('いい; よい', '(かさを～) さす') into clean surface forms.

    Entries that are affix patterns ('～社', '〜式') are dropped: they are not words.
    """
    expr = _PAREN.sub("", expr).strip()
    if expr.startswith(("～", "〜")) or expr.endswith(("～", "〜")):
        return []
    out = []
    for part in re.split(r"[;；、,/]", expr):
        part = part.replace("～", "").replace("〜", "").replace("×", "").replace("…", "").strip()
        if part and " " not in part:
            out.append(part)
    return out


def load_seed_words(seed_dir: Path) -> dict[str, set[str]]:
    """surface form -> set of readings ('' = any). Empty dict when no seed files exist."""
    out: dict[str, set[str]] = defaultdict(set)
    if not seed_dir.exists():
        return {}
    for f in sorted(seed_dir.glob("*.csv")):
        with f.open(encoding="utf-8", newline="") as fh:
            for row in csv.reader(fh):
                if not row or row[0].startswith("#"):
                    continue
                word = row[0].strip()
                if word.lower() in ("word", "expression", "surface"):
                    continue
                reading = row[1].strip() if len(row) > 1 else ""
                out[word].add(reading)
    return dict(out)


def _pos_label(pos: list[str]) -> str:
    return ", ".join(p.strip("{}") for p in pos[:3])


def _glosses_for(entry: JmEntry, kform: str | None, reading: str) -> tuple[list[str], str]:
    glosses: list[str] = []
    pos = ""
    for s in entry.senses:
        if s.stagk and kform and kform not in s.stagk:
            continue
        if s.stagr and reading not in s.stagr:
            continue
        if _EXCLUDE_MISC & set(s.misc):
            continue
        if not pos and s.pos:
            pos = _pos_label(s.pos)
        glosses.extend(g for g in s.glosses if g not in glosses)
        if len(glosses) >= 8:
            break
    return glosses[:8], pos


def select(
    jmdict: dict[int, JmEntry],
    kanji_level: dict[str, int],  # every taught kanji -> global level number
    levels_in_scope: list[int],  # levels being built, ascending
    level_block: dict[int, str],
    jlpt_words: list[JlptWord],
    block_levels: dict[str, list[int]],
    seed: dict[str, set[str]],
) -> tuple[list[VocabPick], dict]:
    """Return picks and a stats dict (coverage of JLPT and seed lists, per-level counts)."""
    jlpt_index: dict[str, set[str]] = defaultdict(set)
    jlpt_level_of: dict[str, str] = {}
    for w in jlpt_words:
        for form in normalise_expression(w.expression):
            jlpt_index[form].update(normalise_expression(w.reading) or [""])
            jlpt_level_of.setdefault(form, w.level)

    scope = set(levels_in_scope)
    max_level = max(levels_in_scope)
    candidates: dict[int, list[VocabPick]] = defaultdict(list)
    kana_pending: dict[str, list[VocabPick]] = {}

    best_by_word: dict[str, VocabPick] = {}
    kana_block_of: dict[str, str] = {}

    def rank(v: VocabPick, exact: bool) -> tuple:
        return (_SOURCE_RANK[v.source], 0 if exact else 1, v.priority, len(v.word))

    for entry in jmdict.values():
        if any(_EXCLUDE_POS & set(s.pos) for s in entry.senses[:1]):
            continue
        usually_kana = any("{uk}" in s.misc for s in entry.senses[:3])
        good_kforms = [kf for kf in entry.kforms if not (_BAD_KINF & set(kf.info)) and _JAPANESE_FORM.match(kf.text)]
        if entry.kforms and not good_kforms:
            usually_kana = True  # every kanji spelling is rare or irregular
        # choose a kanji form whose kanji are all taught: listed forms first, then dictionary order
        teachable = [
            kf for kf in good_kforms
            if kanji_in(kf.text) and all(k in kanji_level and kanji_level[k] <= max_level for k in kanji_in(kf.text))
        ]
        teachable.sort(key=lambda kf: 0 if (kf.text in jlpt_index or kf.text in seed) else 1)
        picked_form: str | None = teachable[0].text if teachable else None
        form_pri: list[str] = teachable[0].pri if teachable else []
        if picked_form is None and entry.kforms and not usually_kana:
            continue  # written with kanji we cannot teach yet
        if picked_form is not None and usually_kana and picked_form not in jlpt_index and picked_form not in seed:
            picked_form, form_pri = None, []  # teach the kana form, as dictionaries do
        readings = [r for r in entry.rforms if not r.restr or (picked_form and picked_form in r.restr)]
        if not readings:
            continue
        if picked_form is None:
            # kana word: prefer the spelling the JLPT/seed lists use, then the most common one
            readings.sort(key=lambda r: (0 if (r.text in jlpt_index or r.text in seed) else 1, priority_score(r.pri)))
        reading_text = readings[0].text
        word = picked_form or reading_text
        if picked_form is None and not _KANA_ONLY.match(word):
            continue
        ks = kanji_in(word)
        pri = priority_score(list(form_pri) + list(readings[0].pri))
        in_jlpt = word in jlpt_index
        jlpt_exact = in_jlpt and (reading_text in jlpt_index[word] or "" in jlpt_index[word])
        in_seed = word in seed and ("" in seed[word] or reading_text in seed[word])
        kana_block: str | None = None
        if ks:
            level = max(kanji_level[k] for k in ks)
        else:
            if in_jlpt:
                kana_block = jlpt_level_of[word]
            elif in_seed or pri <= 12:
                kana_block = "N5" if pri <= 12 else "N4"
            else:
                continue
            lv_list = block_levels.get(kana_block, [])
            if not lv_list or not any(lv in scope for lv in lv_list):
                continue
            level = lv_list[0]
        if level not in scope:
            continue
        if in_jlpt:
            source = "jlpt"
        elif in_seed:
            source = "seed"
        elif pri == 99:
            source = "fill"
        else:
            source = "priority"
        glosses, pos = _glosses_for(entry, picked_form, reading_text)
        if not glosses:
            continue
        pick = VocabPick(
            seq=entry.seq, word=word, readings=[r.text for r in readings[:3]], meanings=glosses, pos=pos,
            priority=pri, level=level, is_kana_only=not ks, source=source, kanji=ks,
        )
        prev = best_by_word.get(word)
        if prev is None or rank(pick, jlpt_exact) < rank(prev, prev.readings[0] in jlpt_index.get(word, set())):
            best_by_word[word] = pick
            if kana_block is not None:
                kana_block_of[word] = kana_block

    for word, pick in best_by_word.items():
        if word in kana_block_of:
            kana_pending.setdefault(kana_block_of[word], []).append(pick)
        else:
            candidates[pick.level].append(pick)

    for block_name, words in kana_pending.items():
        lv_list = block_levels[block_name]
        words.sort(key=lambda v: (_SOURCE_RANK[v.source], v.priority, v.word))
        for i, v in enumerate(words):
            v.level = lv_list[i % len(lv_list)]
            if v.level in scope:
                candidates[v.level].append(v)

    picks: list[VocabPick] = []
    per_level: dict[int, int] = {}
    kanji_counts: dict[str, int] = defaultdict(int)
    for level in levels_in_scope:
        block = level_block[level]
        min_per_kanji = MIN_WORDS_PER_KANJI.get(block, 3)
        cands = sorted(candidates.get(level, []), key=lambda v: (_SOURCE_RANK[v.source], v.priority, len(v.word)))
        chosen: list[VocabPick] = []
        # 1) everything from the JLPT/seed lists, then by priority until target
        for v in cands:
            if len(chosen) >= TARGET_WORDS_PER_LEVEL and v.source not in ("jlpt", "seed"):
                break
            if len(chosen) >= MAX_WORDS_PER_LEVEL:
                break
            chosen.append(v)
        # 2) make sure each kanji taught at this level has enough words
        level_kanji = [k for k, lv in kanji_level.items() if lv == level]
        chosen_ids = {v.seq for v in chosen}
        for v in chosen:
            for k in v.kanji:
                kanji_counts[k] += 1
        for k in level_kanji:
            need = min_per_kanji - kanji_counts[k]
            if need <= 0:
                continue
            for v in cands:
                if need <= 0:
                    break
                if v.seq in chosen_ids or k not in v.kanji:
                    continue
                chosen.append(v)
                chosen_ids.add(v.seq)
                for kk in v.kanji:
                    kanji_counts[kk] += 1
                need -= 1
        picks.extend(chosen)
        per_level[level] = len(chosen)

    picked_words = {p.word for p in picks}
    scope_blocks = {level_block[lv] for lv in levels_in_scope}
    jlpt_in_scope = set()
    for form, lvl in jlpt_level_of.items():
        ks = kanji_in(form)
        if ks:
            if all(k in kanji_level and kanji_level[k] in scope for k in ks):
                jlpt_in_scope.add(form)
        elif lvl in scope_blocks:
            jlpt_in_scope.add(form)
    stats = {
        "per_level": per_level,
        "jlpt_words_total": len(jlpt_index),
        "jlpt_words_placed": len(picked_words & set(jlpt_index)),
        "jlpt_words_eligible": len(jlpt_in_scope),
        "jlpt_missing_eligible": sorted(jlpt_in_scope - picked_words)[:200],
        "seed_words_total": len(seed),
        "seed_words_placed": len(picked_words & set(seed)),
        "kanji_without_words": sorted(k for k, lv in kanji_level.items() if lv in scope and kanji_counts[k] == 0),
    }
    return picks, stats
