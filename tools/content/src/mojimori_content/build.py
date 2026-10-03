"""Pipeline orchestration: fetch → parse → classify → decompose → series → order → vocab → emit."""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import yaml

from . import classify as classify_mod
from . import decompose, emit, mnemonics, order, report, select_vocab, sentences, series, validate
from .config import CONTENT_DIR, OUT_DIR, SEED_DIR, cache_path
from .fetch import fetch_all
from .model import BLOCKS, Component, ComponentUse, KanjiPlan, Level
from .sources import jlpt, jmdict, kanjidic2, kanjivg, tatoeba


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def run(blocks: list[str], *, out_dir: Path = OUT_DIR, refresh_upstream: bool = False, log=print) -> Path:
    t0 = time.time()
    blocks = [b.upper() for b in blocks]
    for b in blocks:
        if b not in BLOCKS:
            raise ValueError(f"unknown block {b}")
    fetch_all(refresh_upstream=refresh_upstream, log=log)

    log("parsing KANJIDIC2…")
    kd = kanjidic2.parse(cache_path("kanjidic2"))
    log(f"  {len(kd)} kanji")
    log("parsing KanjiVG…")
    kvg = kanjivg.parse(cache_path("kanjivg"))
    log(f"  {len(kvg)} glyphs")
    jlpt_levels = jlpt.parse_kanji_levels(cache_path("jlpt_kanji"))
    jlpt_words = []
    for lvl in ("n5", "n4", "n3", "n2", "n1"):
        jlpt_words += jlpt.parse_vocab(cache_path(f"jlpt_vocab_{lvl}"), lvl.upper())

    # ---- classification of everything (level numbering must be stable across builds)
    classified = classify_mod.classify_all(kd, jlpt_levels)
    counts = classify_mod.counts(classified)
    log(f"classification: {counts}")

    # ---- component decomposition for all classified kanji (needed for deps and series)
    overrides = _load_yaml(CONTENT_DIR / "series_overrides.yaml")
    comp_names = _load_yaml(CONTENT_DIR / "components.yaml")
    pins_all = _load_yaml(CONTENT_DIR / "level_pins.yaml")

    known_kanji = set(classified)
    raw_uses: dict[str, list[decompose.RawUse]] = {}
    phon_kvg: dict[str, str | None] = {}
    radical_kvg: dict[str, str | None] = {}
    for lit in classified:
        g = kvg.get(lit)
        if g is None:
            raw_uses[lit] = []
            phon_kvg[lit] = None
            radical_kvg[lit] = None
            continue
        raw_uses[lit] = decompose.components_of(g, known_kanji | set(decompose.DEFAULT_COMPONENT_NAMES))
        phon_kvg[lit] = decompose.phon_from_kvg(g)
        radical_kvg[lit] = decompose.radical_from_kvg(g)

    # ---- phonetic choice and series over the whole N5–N1 set (+ Obscure for completeness)
    phonetic_of: dict[str, str] = {}
    for lit, uses in raw_uses.items():
        ov = overrides.get(lit)
        p = series.choose_phonetic(lit, uses, kd, phon_kvg[lit], str(ov) if ov is not None else None)
        if p:
            phonetic_of[lit] = p
    original_of = {u.element: u.original for uses in raw_uses.values() for u in uses if u.original}
    all_series, series_info = series.build_series(phonetic_of, kd, original_of)
    jlpt_set = {lit for lit, c in classified.items() if c.block != "OBSCURE"}
    for s_ in all_series:
        # reliability is a statement about the N5–N1 curriculum, not about Obscure rarities
        core_members = [m for m in s_.members if m.literal in jlpt_set]
        if core_members:
            saved = s_.members
            s_.members = core_members
            s_.freeze()
            s_.members = saved
        else:
            s_.freeze()
    series_by_id = {s.id: s for s in all_series}
    log(f"phonetic series: {len(all_series)} covering {len(series_info)} kanji")

    # ---- order every block so global level numbers are stable
    block_literals: dict[str, list[str]] = defaultdict(list)
    for lit, c in classified.items():
        block_literals[c.block].append(lit)
    levels: list[Level] = []
    plans: dict[str, KanjiPlan] = {}
    number = 0
    block_level_numbers: dict[str, list[int]] = defaultdict(list)
    for block in BLOCKS:
        lits = block_literals.get(block, [])
        if block == "OBSCURE":
            tiers = defaultdict(list)
            for lit in lits:
                tiers[classified[lit].tier].append(lit)
            groups = [(t, tiers[t]) for t in sorted(tiers)]
        else:
            groups = [(None, lits)]
        ordinal = 0
        for tier, group in groups:
            deps = {lit: {u.element for u in raw_uses[lit] if u.element in set(group)} for lit in group}
            series_of = {lit: series_info[lit][0] if lit in series_info else None for lit in group}
            pins = {k: int(v) for k, v in pins_all.get(block, {}).items()} if isinstance(pins_all.get(block), dict) else {}
            for lv in order.order_block(group, kd, deps, series_of, pins):
                number += 1
                ordinal += 1
                levels.append(Level(number, block, ordinal, tier, lv))
                block_level_numbers[block].append(number)
                for lit in lv:
                    plans[lit] = KanjiPlan(lit, block, tier, number, [])
    log(f"levels: {number} total; " + ", ".join(f"{b}={len(block_level_numbers[b])}" for b in BLOCKS))

    # ---- components: introduce each at the first level that needs it
    kanji_level = {lit: p.level for lit, p in plans.items()}
    components: dict[str, Component] = {}
    for lit in sorted(plans, key=lambda x: plans[x].level):
        p = plans[lit]
        k = kd[lit]
        uses = raw_uses[lit]
        for u in uses:
            slug = u.element
            if slug not in components:
                name, meaning, named = decompose.default_name(slug, kd)
                cfg = comp_names.get(slug) if isinstance(comp_names, dict) else None
                if isinstance(cfg, dict):
                    name = str(cfg.get("name", name))
                    meaning = str(cfg.get("meaning", meaning))
                    named = True
                ce = kd.get(slug)
                if u.synthetic:
                    strokes = list(u.strokes or [])
                else:
                    strokes = kvg[slug].root.all_strokes() if slug in kvg else []
                variant_of = u.original if u.original and u.original != slug else None
                if isinstance(cfg, dict) and cfg.get("variant_of"):
                    variant_of = str(cfg["variant_of"])
                components[slug] = Component(
                    slug=slug, glyph="" if u.synthetic else slug, name=name, meaning=meaning, is_kanji=slug in plans,
                    variant_of=variant_of,
                    on=ce.on if ce else [], role_tendency="unknown", strokes=strokes,
                    level=p.level, kangxi=None, named=named,
                )
            c = components[slug]
            if c.level is None or p.level < c.level:
                c.level = p.level
            is_sem = u.is_radical or (radical_kvg[lit] == slug)
            is_phon = phonetic_of.get(lit) == slug
            role = "both" if is_sem and is_phon else "phonetic" if is_phon else "semantic" if is_sem else "none"
            p.components.append(ComponentUse(slug, role, u.position))
        if lit in series_info:
            sid, match, predicted = series_info[lit]
            p.phonetic = phonetic_of.get(lit)
            p.series_id, p.match, p.predicted_on = sid, match, predicted
            p.category = "keisei"
        elif not uses:
            p.category = "atomic"
        p.asked_reading_type = "on" if k.on else "kun"
        if k.variants:
            modern = [v for v in k.variants if v in kd and kd[v].is_joyo and not k.is_joyo]
            if modern:
                p.old_form_of = modern[0]
    # a component that is also a taught kanji is introduced together with that kanji
    for slug, c in components.items():
        if slug in kanji_level and c.level is not None and kanji_level[slug] < c.level:
            c.level = kanji_level[slug]
    # role tendency per component
    tally: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for p in plans.values():
        for u in p.components:
            tally[u.slug][u.role] += 1
    for slug, c in components.items():
        t = tally[slug]
        sem, pho = t["semantic"] + t["both"], t["phonetic"] + t["both"]
        total = sum(t.values()) or 1
        c.role_tendency = "both" if sem / total > 0.3 and pho / total > 0.3 else "phonetic" if pho / total > 0.3 else "semantic" if sem / total > 0.3 else "unknown"

    # ---- mnemonics
    hand = mnemonics.load_handwritten(CONTENT_DIR / "mnemonics")
    for lit, p in plans.items():
        mm, rm = mnemonics.scaffold(p, kd[lit], components, series_by_id)
        h = hand.get(lit, {})
        p.meaning_mnemonic = h.get("meaning", mm)
        p.reading_mnemonic = h.get("reading", rm)

    # ---- scope: levels of the requested blocks
    built_levels = [lv for lv in levels if lv.block in blocks]
    built_numbers = [lv.number for lv in built_levels]
    scope_plans = {lit: p for lit, p in plans.items() if p.block in blocks}
    scope_components = {s: c for s, c in components.items() if c.level in set(built_numbers)}
    # components introduced earlier than the first built level must still exist for later blocks
    for p in scope_plans.values():
        for u in p.components:
            scope_components.setdefault(u.slug, components[u.slug])
    scope_series = [
        s for s in all_series if any(m.literal in scope_plans for m in s.members)
    ]
    # series members outside the built scope are dropped from the emitted DB
    for s in scope_series:
        s.members = [m for m in s.members if m.literal in scope_plans]

    # ---- vocabulary
    log("parsing JMdict…")
    jm = jmdict.parse(cache_path("jmdict"))
    log(f"  {len(jm)} entries")
    seed = select_vocab.load_seed_words(SEED_DIR)
    level_block = {lv.number: lv.block for lv in levels}
    picks, vstats = select_vocab.select(
        jm, kanji_level, built_numbers, level_block, jlpt_words, dict(block_level_numbers), seed
    )
    log(f"vocabulary: {len(picks)} words")
    log("parsing Tatoeba…")
    pairs = tatoeba.parse(cache_path("tatoeba_ja"), cache_path("tatoeba_en"), cache_path("tatoeba_links"))
    attached = sentences.attach(picks, pairs, kanji_level)
    log(f"  {len(pairs)} sentence pairs, {attached} attached")

    # ---- validate, emit, report
    v = validate.run(built_levels, scope_plans, scope_components, scope_series, picks, {lit: c.block for lit, c in classified.items()})
    content_version = datetime.now(UTC).strftime("%Y.%m.%d")
    db_path = out_dir / ("obscure.db" if blocks == ["OBSCURE"] else "content.db")
    kvg_strokes = {lit: kvg[lit].root.all_strokes() for lit in scope_plans if lit in kvg}
    emit.write(
        db_path, blocks_built=blocks, levels=built_levels, components=scope_components, plans=scope_plans,
        kanjidic=kd, kvg_strokes=kvg_strokes, series=scope_series, vocab=picks, content_version=content_version,
    )
    words_per_level = defaultdict(int)
    src_per_level = defaultdict(lambda: defaultdict(int))
    for w in picks:
        words_per_level[w.level] += 1
        src_per_level[w.level][w.source] += 1
        if w.is_kana_only:
            src_per_level[w.level]["kana"] += 1
    level_rows = []
    for lv in built_levels:
        krows = []
        for lit in lv.kanji:
            p, k = plans[lit], kd[lit]
            krows.append(
                dict(
                    literal=lit, title=", ".join(k.meanings[:3]),
                    components=" ".join(f"{u.slug}{'·' + u.role[0] if u.role != 'none' else ''}" for u in p.components),
                    phonetic=p.phonetic, predicted=p.predicted_on, actual=" ".join(k.on) or "—", match=p.match,
                    meaning=k.meanings[0] if k.meanings else "",
                )
            )
        level_rows.append(
            dict(
                number=lv.number, block=lv.block, kanji=krows,
                components=[c for c in components.values() if c.level == lv.number],
                words=words_per_level[lv.number],
            )
        )
    block_rows = []
    start = 1
    for b in BLOCKS:
        n = len(block_literals.get(b, []))
        nl = len(block_level_numbers[b])
        block_rows.append(dict(block=b, kanji=n, levels=nl, range=f"{start}–{start + nl - 1}" if nl else "—"))
        start += nl
    report.render(
        out_dir / "report.html",
        built_at=datetime.now(UTC).isoformat(timespec="seconds"), blocks_built=blocks, content_version=content_version,
        block_rows=block_rows, validation=v, vocab_stats=vstats, sentences_attached=attached,
        vocab_rows=[dict(level=n, total=words_per_level[n], **{k: src_per_level[n][k] for k in ("jlpt", "seed", "priority", "fill", "kana")}) for n in built_numbers],
        level_rows=level_rows,
        series_rows=sorted(scope_series, key=lambda s: (-len(s.members), s.component)),
        unnamed=[c.slug for c in scope_components.values() if not c.named],
    )
    log(f"wrote {db_path} and report.html in {time.time() - t0:.0f}s; {len(v.errors)} errors, {len(v.warnings)} warnings")
    if not v.ok:
        for e in v.errors[:30]:
            log(f"  ERROR {e}")
        raise SystemExit(1)
    return db_path
