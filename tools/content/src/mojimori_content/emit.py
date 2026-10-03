"""Write content.db (schema: docs/spec.md §9)."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from .config import SOURCES
from .model import (
    BLOCK_NICKNAMES,
    BLOCKS,
    Component,
    KanjiEntry,
    KanjiPlan,
    Level,
    Series,
    VocabPick,
)

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE block (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, nickname TEXT NOT NULL);
CREATE TABLE level (
  id INTEGER PRIMARY KEY, block_id TEXT NOT NULL REFERENCES block(id),
  ordinal INTEGER NOT NULL, obscure_tier INTEGER
);
CREATE TABLE component (
  slug TEXT PRIMARY KEY, glyph TEXT NOT NULL, svg TEXT, name TEXT NOT NULL, meaning TEXT NOT NULL,
  role_tendency TEXT NOT NULL, kangxi_no INTEGER, on_readings TEXT NOT NULL, is_kanji INTEGER NOT NULL,
  variant_of TEXT, level_id INTEGER REFERENCES level(id), notes TEXT
);
CREATE TABLE component_variant (component_slug TEXT NOT NULL REFERENCES component(slug), glyph TEXT NOT NULL, position_hint TEXT);
CREATE TABLE kanji (
  literal TEXT PRIMARY KEY, block_id TEXT NOT NULL REFERENCES block(id), level_id INTEGER NOT NULL REFERENCES level(id),
  grade INTEGER, freq INTEGER, strokes INTEGER, jis_level INTEGER, svg TEXT, category TEXT NOT NULL,
  asked_reading_type TEXT NOT NULL, old_form_of TEXT, meaning_mnemonic TEXT NOT NULL, reading_mnemonic TEXT NOT NULL
);
CREATE TABLE kanji_reading (literal TEXT NOT NULL REFERENCES kanji(literal), kana TEXT NOT NULL, type TEXT NOT NULL, is_primary INTEGER NOT NULL);
CREATE TABLE kanji_meaning (literal TEXT NOT NULL REFERENCES kanji(literal), text TEXT NOT NULL, is_primary INTEGER NOT NULL);
CREATE TABLE kanji_component (
  literal TEXT NOT NULL REFERENCES kanji(literal), component_slug TEXT NOT NULL REFERENCES component(slug),
  role TEXT NOT NULL, position TEXT, ordinal INTEGER NOT NULL
);
CREATE TABLE phonetic_series (id INTEGER PRIMARY KEY, component_slug TEXT NOT NULL, reading TEXT NOT NULL, reliability REAL NOT NULL, total_members INTEGER NOT NULL);
CREATE TABLE series_member (series_id INTEGER NOT NULL REFERENCES phonetic_series(id), literal TEXT NOT NULL, actual_reading TEXT NOT NULL, match TEXT NOT NULL);
CREATE TABLE vocab (
  id INTEGER PRIMARY KEY, word TEXT NOT NULL, level_id INTEGER NOT NULL REFERENCES level(id), pos TEXT NOT NULL,
  priority INTEGER NOT NULL, is_kana_only INTEGER NOT NULL, selection_source TEXT NOT NULL, notes TEXT
);
CREATE TABLE vocab_reading (vocab_id INTEGER NOT NULL REFERENCES vocab(id), kana TEXT NOT NULL, is_primary INTEGER NOT NULL);
CREATE TABLE vocab_meaning (vocab_id INTEGER NOT NULL REFERENCES vocab(id), text TEXT NOT NULL, is_primary INTEGER NOT NULL);
CREATE TABLE vocab_kanji (vocab_id INTEGER NOT NULL REFERENCES vocab(id), literal TEXT NOT NULL);
CREATE TABLE sentence (id INTEGER PRIMARY KEY AUTOINCREMENT, vocab_id INTEGER NOT NULL REFERENCES vocab(id), ja TEXT NOT NULL, en TEXT NOT NULL, source_id TEXT NOT NULL);
CREATE TABLE source (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, licence TEXT NOT NULL);
CREATE INDEX idx_kanji_level ON kanji(level_id);
CREATE INDEX idx_vocab_level ON vocab(level_id);
CREATE INDEX idx_vocab_kanji_literal ON vocab_kanji(literal);
CREATE INDEX idx_kanji_component_slug ON kanji_component(component_slug);
CREATE INDEX idx_series_member_literal ON series_member(literal);
CREATE INDEX idx_sentence_vocab ON sentence(vocab_id);
"""


def _svg(strokes: list[tuple[str | None, str]]) -> str:
    return json.dumps([d for _, d in strokes], ensure_ascii=False)


def write(
    path: Path,
    *,
    blocks_built: list[str],
    levels: list[Level],
    components: dict[str, Component],
    plans: dict[str, KanjiPlan],
    kanjidic: dict[str, KanjiEntry],
    kvg_strokes: dict[str, list[tuple[str | None, str]]],
    series: list[Series],
    vocab: list[VocabPick],
    content_version: str,
) -> None:
    if path.exists():
        path.unlink()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    con.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("schema_version", "1"),
            ("content_version", content_version),
            ("built_at", datetime.now(UTC).isoformat(timespec="seconds")),
            ("blocks", ",".join(blocks_built)),
        ],
    )
    con.executemany("INSERT INTO block VALUES (?,?,?)", [(b, i, BLOCK_NICKNAMES[b]) for i, b in enumerate(BLOCKS)])
    con.executemany("INSERT INTO level VALUES (?,?,?,?)", [(lv.number, lv.block, lv.ordinal, lv.tier) for lv in levels])
    for c in components.values():
        con.execute(
            "INSERT INTO component VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                c.slug, c.glyph, _svg(c.strokes), c.name, c.meaning, c.role_tendency, c.kangxi,
                json.dumps(c.on, ensure_ascii=False), int(c.is_kanji), c.variant_of, c.level,
                None if c.named else "unnamed",
            ),
        )
    level_ids = {lv.number for lv in levels}
    for lit, p in plans.items():
        if p.level not in level_ids:
            continue
        k = kanjidic[lit]
        jis_level = None
        if k.jis208_row is not None:
            jis_level = 1 if k.jis208_row <= 47 else 2
        con.execute(
            "INSERT INTO kanji VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                lit, p.block, p.level, k.grade, k.freq, k.strokes, jis_level,
                _svg(kvg_strokes.get(lit, [])), p.category, p.asked_reading_type, p.old_form_of,
                p.meaning_mnemonic, p.reading_mnemonic,
            ),
        )
        rows = [(lit, r, "on", int(i == 0)) for i, r in enumerate(k.on)]
        rows += [(lit, r, "kun", int(i == 0 and not k.on)) for i, r in enumerate(k.kun)]
        rows += [(lit, r, "nanori", 0) for r in k.nanori]
        con.executemany("INSERT INTO kanji_reading VALUES (?,?,?,?)", rows)
        con.executemany("INSERT INTO kanji_meaning VALUES (?,?,?)", [(lit, m, int(i == 0)) for i, m in enumerate(k.meanings)])
        con.executemany(
            "INSERT INTO kanji_component VALUES (?,?,?,?,?)",
            [(lit, u.slug, u.role, u.position, i) for i, u in enumerate(p.components)],
        )
    for s in series:
        con.execute("INSERT INTO phonetic_series VALUES (?,?,?,?,?)", (s.id, s.component, s.reading, s.reliability, s.total_members))
        con.executemany("INSERT INTO series_member VALUES (?,?,?,?)", [(s.id, m.literal, m.actual, m.match) for m in s.members])
    for v in vocab:
        con.execute(
            "INSERT INTO vocab VALUES (?,?,?,?,?,?,?,?)",
            (v.seq, v.word, v.level, v.pos, v.priority, int(v.is_kana_only), v.source, v.notes or None),
        )
        con.executemany("INSERT INTO vocab_reading VALUES (?,?,?)", [(v.seq, r, int(i == 0)) for i, r in enumerate(v.readings)])
        con.executemany("INSERT INTO vocab_meaning VALUES (?,?,?)", [(v.seq, m, int(i == 0)) for i, m in enumerate(v.meanings)])
        con.executemany("INSERT INTO vocab_kanji VALUES (?,?)", [(v.seq, k) for k in dict.fromkeys(v.kanji)])
        con.executemany(
            "INSERT INTO sentence (vocab_id, ja, en, source_id) VALUES (?,?,?,?)",
            [(v.seq, s.ja, s.en, "tatoeba") for s in v.sentences],
        )
    con.executemany(
        "INSERT INTO source VALUES (?,?,?,?)",
        [(s.name, s.note or s.name, s.homepage, s.licence) for s in SOURCES.values()],
    )
    con.commit()
    con.execute("VACUUM")
    con.close()
