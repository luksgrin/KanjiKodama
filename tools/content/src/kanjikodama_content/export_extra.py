"""Export the JLPT kanji WaniKani does not teach, for the app (content/inputs/extra-kanji.db).

Kanji: meanings and readings from KANJIDIC2; the primary meaning, primary reading and the
mnemonics come from content/mnemonics/extra-*.yaml (hand-written). Vocabulary: up to three common
JMdict words per kanji whose other kanji the app also teaches, with Tatoeba example sentences.

The output, extra-kanji.db, stores subjects in the app's JSON formats. Components and the kanji
of each word are stored as characters; the app resolves them to subject ids when it imports, so
this file never depends on WaniKani's ids.

Inputs besides the open data: the WaniKani content asset (to know which kanji, words and
radicals the app already has) and assets/jlpt-kanji.tsv.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

import yaml

FORMAT_VERSION = 1
KANJI_ID_BASE = 100_000
VOCAB_ID_BASE = 200_000
WORDS_PER_KANJI = 3
COMMON = 40  # JMdict priority score at or below which a written form counts as common

_KANJI_RE = re.compile(r"[㐀-鿿豈-﫿々]")

POS = {
    "n": "noun", "n-adv": "adverbial noun", "n-t": "temporal noun", "n-suf": "suffix",
    "n-pref": "prefix", "adj-i": "い adjective", "adj-na": "な adjective", "adj-no": "の adjective",
    "adj-t": "たる adjective", "adj-f": "prenominal", "adj-pn": "pre-noun adjectival",
    "adv": "adverb", "adv-to": "adverb", "aux-v": "auxiliary verb", "conj": "conjunction",
    "ctr": "counter", "exp": "expression", "int": "interjection", "num": "numeral",
    "pn": "pronoun", "pref": "prefix", "suf": "suffix", "prt": "particle",
    "v1": "ichidan verb", "vs": "する verb", "vs-s": "する verb", "vs-i": "する verb",
    "vk": "irregular verb", "vz": "ichidan verb", "vt": "transitive verb", "vi": "intransitive verb",
}


def hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def kun_stem(reading: str) -> str:
    """ひろ.い -> ひろ, -ひこ -> ひこ."""
    return reading.split(".")[0].replace("-", "").strip()


def pos_labels(pos: list[str]) -> list[str]:
    out: list[str] = []
    for p in pos:
        key = p.strip("{}")
        label = POS.get(key) or ("godan verb" if key.startswith("v5") else None)
        if label and label not in out:
            out.append(label)
    return out


@dataclass
class WkIndex:
    kanji: dict[str, str]           # character -> primary meaning
    vocab: set[str]                 # vocabulary characters
    radicals: dict[str, str]        # character -> primary meaning (name)


def load_wk(path: Path) -> WkIndex:
    con = sqlite3.connect(path)
    kanji, vocab, radicals = {}, set(), {}
    for obj, chars, meanings in con.execute("SELECT object, characters, meanings FROM subject WHERE hiddenAt = 0"):
        if not chars:
            continue
        primary = next((m["meaning"] for m in json.loads(meanings or "[]") if m.get("primary")), "")
        if obj == "kanji":
            kanji[chars] = primary
        elif obj == "radical":
            radicals[chars] = primary
        elif obj in ("vocabulary", "kana_vocabulary"):
            vocab.add(chars)
    con.close()
    return WkIndex(kanji, vocab, radicals)


def load_jlpt(path: Path) -> dict[str, int]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            k, v = line.split("\t")
            out[k] = int(v)
    return out


@dataclass
class Word:
    keb: str
    reading: str
    glosses: list[str]
    pos: list[str]
    score: int
    sentences: list[dict[str, str]] = field(default_factory=list)


def missing_kanji(wk: WkIndex, jlpt: dict[str, int], kd: dict) -> list[str]:
    """JLPT kanji the WaniKani content lacks, most frequent first."""
    miss = [k for k in jlpt if k not in wk.kanji and k in kd]
    return sorted(miss, key=lambda k: (kd[k].freq or 9999, kd[k].grade or 99, k))


def pick_words(miss: list[str], wk: WkIndex, jm: dict) -> dict[str, list[Word]]:
    from .select_vocab import _EXCLUDE_POS, _glosses_for
    from .sources.jmdict import priority_score

    taught = set(wk.kanji) | set(miss)
    candidates: dict[str, list[Word]] = {k: [] for k in miss}
    for entry in jm.values():
        for kf in entry.kforms:
            score = priority_score(kf.pri)
            if score > COMMON or kf.text in wk.vocab or set(kf.info) & {"{iK}", "{oK}", "{rK}", "{sK}"}:
                continue
            chars = _KANJI_RE.findall(kf.text)
            targets = [c for c in set(chars) if c in candidates]
            if not targets or any(c not in taught for c in chars if c != "々"):
                continue
            rf = next((r for r in entry.rforms if not r.nokanji and (not r.restr or kf.text in r.restr)), None)
            if rf is None:
                continue
            glosses, _ = _glosses_for(entry, kf.text, rf.text)
            pos = [p for s in entry.senses for p in s.pos]
            if not glosses or set(pos) & _EXCLUDE_POS:
                continue
            word = Word(kf.text, rf.text, glosses, pos_labels(pos), score)
            for c in targets:
                candidates[c].append(word)
    out: dict[str, list[Word]] = {}
    used: set[str] = set()
    for k in miss:
        words = sorted(candidates[k], key=lambda w: (w.score, len(w.keb), w.keb))
        chosen = []
        for w in words:
            if w.keb not in used and len(chosen) < WORDS_PER_KANJI:
                chosen.append(w)
                used.add(w.keb)
        out[k] = chosen
    return out


def standalone(keb: str, text: str) -> bool:
    """True if the word appears in the text and not as part of a longer kanji run (磯 vs 磯田)."""
    start = text.find(keb)
    while start >= 0:
        before = text[start - 1] if start > 0 else ""
        after = text[start + len(keb)] if start + len(keb) < len(text) else ""
        if not _KANJI_RE.fullmatch(before or "a") and not _KANJI_RE.fullmatch(after or "a"):
            return True
        start = text.find(keb, start + 1)
    return False


def clean_gloss(gloss: str) -> str:
    """Drop parenthetical notes: "Japanese chestnut (Castanea crenata)" -> "Japanese chestnut"."""
    out = re.sub(r"\s*\([^)]*\)\s*", " ", gloss).strip()
    return out or gloss


def attach_sentences(words: list[Word], pairs: list, per_word: int = 2) -> None:
    by_keb = {w.keb: w for w in words}
    hits: dict[str, list] = {k: [] for k in by_keb}
    for p in pairs:
        for keb in by_keb:
            if keb in p.ja and standalone(keb, p.ja):
                hits[keb].append(p)
    for keb, ps in hits.items():
        ps.sort(key=lambda p: (len(p.ja), p.ja_id))
        by_keb[keb].sentences = [{"en": p.en, "ja": p.ja} for p in ps[:per_word]]


def parts_of(sound_db: Path) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    con = sqlite3.connect(sound_db)
    parts: dict[str, list[dict]] = {}
    for lit, glyph, role, name in con.execute("SELECT literal, glyph, role, name FROM kanji_part ORDER BY literal, ordinal"):
        parts.setdefault(lit, []).append({"glyph": glyph, "role": role, "name": name})
    sound = {}
    for lit, phon, sreading, actual, match in con.execute(
            "SELECT literal, phonetic, series_reading, actual_reading, match FROM kanji_sound"):
        sound[lit] = {"phonetic": phon, "series_reading": sreading, "reading": actual, "match": match}
    con.close()
    return parts, sound


def _inputs(log=print):
    from .config import REPO_DIR, cache_path
    from .fetch import fetch_all
    from .sources import jmdict, kanjidic2

    fetch_all(["kanjidic2", "jmdict"])
    assets = REPO_DIR / "content/inputs"
    wk_db = REPO_DIR / "content/private/wk-content.db"
    if not wk_db.exists():
        raise SystemExit("export-extra needs content/private/wk-content.db (run tools/build_wk_asset.py first)")
    wk = load_wk(wk_db)
    jlpt = load_jlpt(assets / "jlpt-kanji.tsv")
    kd = kanjidic2.parse(cache_path("kanjidic2"))
    miss = missing_kanji(wk, jlpt, kd)
    log(f"export-extra: {len(miss)} JLPT kanji are not in the WaniKani content")
    jm = jmdict.parse(cache_path("jmdict"))
    words = pick_words(miss, wk, jm)
    return assets, wk, jlpt, kd, miss, words


def brief(out: Path, *, log=print) -> Path:
    """Everything a mnemonic writer needs, one object per kanji (JSON)."""
    assets, wk, jlpt, kd, miss, words = _inputs(log)
    parts, sound = parts_of(assets / "sound-components.db")
    items = []
    for k in miss:
        e = kd[k]
        items.append({
            "kanji": k,
            "meanings": e.meanings,
            "onyomi": [hira(r) for r in e.on],
            "kunyomi": e.kun,
            "nanori": e.nanori,
            "grade": e.grade,
            "parts": [dict(p, wanikani_radical=wk.radicals.get(p["glyph"]) or (wk.kanji.get(p["glyph"]) and f"(kanji) {wk.kanji[p['glyph']]}"))
                      for p in parts.get(k, [])],
            "sound": sound.get(k),
            "words": [{"word": w.keb, "reading": w.reading, "meaning": "; ".join(w.glosses[:3])} for w in words[k]],
        })
    out.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"export-extra: brief for {len(items)} kanji written to {out}")
    return out


def load_mnemonics(mnemonic_dir: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in sorted(mnemonic_dir.glob("extra-*.yaml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        for k, v in data.items():
            out[str(k)] = v
    return out


def kanji_readings(e, primary: str, primary_type: str) -> list[dict]:
    on = [hira(r) for r in e.on]
    kun = [kun_stem(r) for r in e.kun]
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(reading: str, rtype: str) -> None:
        if (reading, rtype) in seen or not reading:
            return
        seen.add((reading, rtype))
        out.append({"reading": reading, "primary": reading == primary and rtype == primary_type,
                    "accepted_answer": rtype == primary_type, "type": rtype})

    add(primary, primary_type)
    for r in on:
        add(r, "onyomi")
    for r in kun:
        add(r, "kunyomi")
    for r in e.nanori:
        add(hira(r), "nanori")
    return out


def check_entry(k: str, e, m: dict) -> list[str]:
    problems = []
    for key in ("meaning", "primary_reading", "reading_type", "meaning_mnemonic", "reading_mnemonic"):
        if not m.get(key):
            problems.append(f"{k}: missing {key}")
    rtype = m.get("reading_type")
    reading = m.get("primary_reading", "")
    pool = {"onyomi": [hira(r) for r in e.on], "kunyomi": [kun_stem(r) for r in e.kun], "nanori": [hira(r) for r in e.nanori]}
    if rtype not in pool:
        problems.append(f"{k}: reading_type must be onyomi, kunyomi or nanori")
    elif reading not in pool[rtype]:
        problems.append(f"{k}: {reading} is not one of its {rtype} readings {pool[rtype]}")
    for key in ("meaning_mnemonic", "reading_mnemonic"):
        text = m.get(key) or ""
        for tag in re.findall(r"</?([a-z]+)>", text):
            if tag not in ("radical", "kanji", "vocabulary", "reading", "ja", "meaning"):
                problems.append(f"{k}: unknown tag <{tag}> in {key}")
        if text.count("<") != text.count(">"):
            problems.append(f"{k}: unbalanced markup in {key}")
    return problems


SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE extra_subject (
  id INTEGER PRIMARY KEY, object TEXT NOT NULL, characters TEXT NOT NULL, position INTEGER NOT NULL,
  meanings TEXT NOT NULL, auxiliary_meanings TEXT NOT NULL, readings TEXT NOT NULL,
  meaning_mnemonic TEXT NOT NULL, meaning_hint TEXT, reading_mnemonic TEXT NOT NULL, reading_hint TEXT,
  component_chars TEXT NOT NULL,   -- JSON array of characters (radicals for kanji, kanji for words)
  parts_of_speech TEXT NOT NULL, context_sentences TEXT NOT NULL, jlpt INTEGER NOT NULL
);
"""


def export(out: Path, *, log=print) -> Path:
    from .config import CONTENT_DIR, cache_path
    from .fetch import fetch_all
    from .sources import tatoeba

    assets, wk, jlpt, kd, miss, words = _inputs(log)
    parts, _ = parts_of(assets / "sound-components.db")
    mnem = load_mnemonics(CONTENT_DIR / "mnemonics")
    problems = [p for k in miss for p in (check_entry(k, kd[k], mnem[k]) if k in mnem else [f"{k}: no mnemonics"])]
    if problems:
        raise SystemExit("export-extra: fix content/mnemonics first:\n  " + "\n  ".join(problems[:40])
                         + (f"\n  ... {len(problems) - 40} more" if len(problems) > 40 else ""))

    fetch_all(["tatoeba_ja", "tatoeba_en", "tatoeba_links"])
    all_words = [w for k in miss for w in words[k]]
    attach_sentences(all_words, tatoeba.parse(cache_path("tatoeba_ja"), cache_path("tatoeba_en"), cache_path("tatoeba_links")))

    primary_meaning = dict(wk.kanji)
    primary_reading: dict[str, str] = {}
    for k in miss:
        primary_meaning[k] = mnem[k]["meaning"]
        primary_reading[k] = mnem[k]["primary_reading"]

    if out.exists():
        out.unlink()
    con = sqlite3.connect(out)
    con.executescript(SCHEMA)
    con.execute("INSERT INTO meta VALUES ('format_version', ?)", (str(FORMAT_VERSION),))
    rows = []
    for i, k in enumerate(miss):
        e, m = kd[k], mnem[k]
        meanings = [m["meaning"]] + [x for x in e.meanings if x.lower() != m["meaning"].lower()][:3]
        mjson = [{"meaning": x[:1].upper() + x[1:], "primary": j == 0, "accepted_answer": True} for j, x in enumerate(meanings)]
        comps = [p["glyph"] for p in parts.get(k, []) if p["glyph"] in wk.radicals]
        rows.append((KANJI_ID_BASE + i + 1, "kanji", k, i + 1, json.dumps(mjson, ensure_ascii=False), "[]",
                     json.dumps(kanji_readings(e, m["primary_reading"], m["reading_type"]), ensure_ascii=False),
                     m["meaning_mnemonic"].strip(), (m.get("meaning_hint") or "").strip() or None,
                     m["reading_mnemonic"].strip(), (m.get("reading_hint") or "").strip() or None,
                     json.dumps(comps, ensure_ascii=False), "[]", "[]", jlpt.get(k, 1)))
    for i, w in enumerate(all_words):
        kanji = [c for c in dict.fromkeys(_KANJI_RE.findall(w.keb)) if c != "々"]
        glosses = list(dict.fromkeys(clean_gloss(g) for g in w.glosses))[:3]
        mjson = [{"meaning": g[:1].upper() + g[1:], "primary": j == 0, "accepted_answer": True} for j, g in enumerate(glosses)]
        rows.append((VOCAB_ID_BASE + i + 1, "vocabulary", w.keb, i + 1, json.dumps(mjson, ensure_ascii=False), "[]",
                     json.dumps([{"reading": w.reading, "primary": True, "accepted_answer": True}], ensure_ascii=False),
                     vocab_meaning_mnemonic(w, kanji, primary_meaning), None,
                     vocab_reading_mnemonic(w, kanji, primary_reading), None,
                     json.dumps(kanji, ensure_ascii=False), json.dumps(w.pos, ensure_ascii=False),
                     json.dumps(w.sentences, ensure_ascii=False), 1))
    con.executemany("INSERT INTO extra_subject VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]
    con.execute("INSERT INTO meta VALUES ('content_version', ?)", (digest,))
    con.commit()
    con.close()
    log(f"export-extra: {out} with {len(miss)} kanji and {len(all_words)} words "
        f"({sum(1 for k in miss if words[k])} kanji have words)")
    return out


def vocab_meaning_mnemonic(w: Word, kanji: list[str], meaning: dict[str, str]) -> str:
    meaning_text = clean_gloss(w.glosses[0])
    if len(kanji) == 1 and w.keb == kanji[0]:
        return (f"The word is just the kanji on its own, so it keeps the kanji's meaning: "
                f"<vocabulary>{meaning_text}</vocabulary>.")
    parts = " and ".join(f"<kanji>{meaning.get(k, k)}</kanji> ({k})" for k in kanji)
    return f"This word combines {parts}. Put together, they mean <vocabulary>{meaning_text}</vocabulary>."


def vocab_reading_mnemonic(w: Word, kanji: list[str], reading: dict[str, str]) -> str:
    known = [k for k in kanji if reading.get(k) and reading[k] in w.reading]
    if known:
        used = ", ".join(f"<reading>{reading[k]}</reading> for {k}" for k in known)
        return f"It uses the readings you learned with the kanji: {used}. The whole word reads <reading>{w.reading}</reading>."
    return f"This word reads <reading>{w.reading}</reading>. It is not the reading you learned with the kanji, so give it some extra attention."
