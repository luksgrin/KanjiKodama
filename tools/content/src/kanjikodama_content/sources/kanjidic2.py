"""KANJIDIC2 parser."""

from __future__ import annotations

import gzip
import re
from pathlib import Path

from lxml import etree

from ..model import KanjiEntry

_RADICAL_GLOSS = re.compile(r"radical \(no\.? ?\d+\)", re.IGNORECASE)


def _int(text: str | None) -> int | None:
    return int(text) if text and text.isdigit() else None


def parse(path: Path) -> dict[str, KanjiEntry]:
    out: dict[str, KanjiEntry] = {}
    with gzip.open(path, "rb") as f:
        for _, el in etree.iterparse(f, tag="character"):
            literal = el.findtext("literal")
            cps = {c.get("cp_type"): c.text for c in el.iterfind("codepoint/cp_value")}
            misc = el.find("misc")
            rm = el.find("reading_meaning")
            on, kun, meanings = [], [], []
            if rm is not None:
                for g in rm.iterfind("rmgroup"):
                    for r in g.iterfind("reading"):
                        if r.get("r_type") == "ja_on":
                            on.append(r.text)
                        elif r.get("r_type") == "ja_kun":
                            kun.append(r.text)
                    for m in g.iterfind("meaning"):
                        if m.get("m_lang") in (None, "en"):
                            meanings.append(m.text)
            # KANJIDIC glosses such as "one radical (no.1)" describe the radical table, not the kanji
            cleaned = [m for m in meanings if not _RADICAL_GLOSS.search(m)]
            meanings = cleaned or meanings
            variants = []
            for v in el.iterfind("misc/variant"):
                if v.get("var_type") == "ucs" and v.text:
                    try:
                        variants.append(chr(int(v.text, 16)))
                    except ValueError:
                        pass
            rad = None
            for r in el.iterfind("radical/rad_value"):
                if r.get("rad_type") == "classical":
                    rad = _int(r.text)
            out[literal] = KanjiEntry(
                literal=literal,
                ucs=cps.get("ucs", ""),
                jis208=cps.get("jis208"),
                jis212=cps.get("jis212"),
                jis213=cps.get("jis213"),
                grade=_int(misc.findtext("grade")) if misc is not None else None,
                strokes=_int(misc.findtext("stroke_count")) if misc is not None else None,
                freq=_int(misc.findtext("freq")) if misc is not None else None,
                jlpt_old=_int(misc.findtext("jlpt")) if misc is not None else None,
                radical=rad,
                on=on,
                kun=kun,
                nanori=[n.text for n in el.iterfind("reading_meaning/nanori") if n.text],
                meanings=meanings,
                variants=variants,
            )
            el.clear()
    return out
