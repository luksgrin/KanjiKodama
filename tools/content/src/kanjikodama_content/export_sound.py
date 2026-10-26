"""Export component roles and phonetic series for the app (content/inputs/sound-components.db).

The output, sound-components.db, is built from open data only (KANJIDIC2, KanjiVG, JLPT lists)
and covers every kanji the pipeline classifies, so the app can look up any WaniKani kanji.
Readings are stored in hiragana to match how WaniKani shows on'yomi.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from . import decompose
from .build import analyse

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE kanji_part (
  literal TEXT NOT NULL, ordinal INTEGER NOT NULL, glyph TEXT NOT NULL,
  role TEXT NOT NULL,       -- semantic | phonetic | both | shape
  position TEXT, name TEXT NOT NULL,
  PRIMARY KEY (literal, ordinal)
);
CREATE TABLE kanji_sound (
  literal TEXT PRIMARY KEY, phonetic TEXT NOT NULL, series_id INTEGER NOT NULL,
  series_reading TEXT NOT NULL, actual_reading TEXT NOT NULL,
  match TEXT NOT NULL       -- exact | variant | irregular
);
CREATE TABLE series (
  id INTEGER PRIMARY KEY, phonetic TEXT NOT NULL, reading TEXT NOT NULL,
  reliability REAL NOT NULL, core_members INTEGER NOT NULL
);
CREATE TABLE series_member (
  series_id INTEGER NOT NULL, literal TEXT NOT NULL, reading TEXT NOT NULL, match TEXT NOT NULL,
  is_core INTEGER NOT NULL  -- on a JLPT list (counts toward reliability)
);
CREATE INDEX idx_member_series ON series_member(series_id);
"""


def hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def export(out: Path, *, log=print) -> Path:
    a = analyse(log=log)
    jlpt_set = {lit for lit, c in a.classified.items() if c.block != "OBSCURE"}
    if out.exists():
        out.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(out)
    con.executescript(SCHEMA)

    def name_of(glyph: str) -> str:
        cfg = a.comp_names.get(glyph) if isinstance(a.comp_names, dict) else None
        if isinstance(cfg, dict) and cfg.get("name"):
            return str(cfg["name"])
        return decompose.default_name(glyph, a.kd)[0]

    parts = []
    for lit, uses in a.raw_uses.items():
        phon = a.phonetic_of.get(lit)
        for i, u in enumerate(u for u in uses if not u.synthetic):
            sem = u.is_radical or a.radical_kvg.get(lit) == u.element
            is_phon = phon == u.element
            role = "both" if sem and is_phon else "phonetic" if is_phon else "semantic" if sem else "shape"
            parts.append((lit, i, u.element, role, u.position, name_of(u.element)))
    con.executemany("INSERT INTO kanji_part VALUES (?,?,?,?,?,?)", parts)

    sounds = []
    for lit, (sid, match, predicted) in a.series_info.items():
        s = a.series_by_id[sid]
        member = next(m for m in s.members if m.literal == lit)
        sounds.append((lit, s.component, sid, hira(predicted), hira(member.actual), match))
    con.executemany("INSERT INTO kanji_sound VALUES (?,?,?,?,?,?)", sounds)
    con.executemany(
        "INSERT INTO series VALUES (?,?,?,?,?)",
        [(s.id, s.component, hira(s.reading), s.reliability, s.total_members) for s in a.all_series],
    )
    con.executemany(
        "INSERT INTO series_member VALUES (?,?,?,?,?)",
        [(s.id, m.literal, hira(m.actual), m.match, int(m.literal in jlpt_set)) for s in a.all_series for m in s.members],
    )
    con.execute("INSERT INTO meta VALUES ('schema_version', '1')")
    con.execute("INSERT INTO meta VALUES ('source', 'KanjiKodama tools/content: KANJIDIC2, KanjiVG (CC BY-SA)')")
    con.commit()
    con.execute("VACUUM")
    con.close()
    log(f"wrote {out}: {len(parts)} parts, {len(sounds)} kanji with a sound component, {len(a.all_series)} series")
    return out
