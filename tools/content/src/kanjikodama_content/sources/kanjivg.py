"""KanjiVG single-file XML parser."""

from __future__ import annotations

import gzip
import re
from pathlib import Path

from lxml import etree

from ..model import KvgKanji, KvgNode

KVG = "{http://kanjivg.tagaini.net}"
_ID = re.compile(r"kvg:kanji_([0-9a-f]{4,5})$")


def _node(g) -> KvgNode:
    n = KvgNode(
        element=g.get(KVG + "element"),
        position=g.get(KVG + "position"),
        phon=g.get(KVG + "phon"),
        radical=g.get(KVG + "radical"),
        part=int(g.get(KVG + "part")) if g.get(KVG + "part") else None,
        original=g.get(KVG + "original"),
        variant=g.get(KVG + "variant") == "true",
    )
    for child in g:
        tag = etree.QName(child).localname
        if tag == "g":
            n.children.append(_node(child))
        elif tag == "path":
            n.strokes.append((child.get(KVG + "type"), child.get("d")))
    return n


def parse(path: Path) -> dict[str, KvgKanji]:
    """Main forms only (variant files such as -Kaisho are skipped)."""
    out: dict[str, KvgKanji] = {}
    with gzip.open(path, "rb") as f:
        for _, el in etree.iterparse(f, tag="kanji"):
            m = _ID.match(el.get("id", ""))
            if m:
                literal = chr(int(m.group(1), 16))
                g = next((c for c in el if etree.QName(c).localname == "g"), None)
                if g is not None:
                    out[literal] = KvgKanji(literal, _node(g))
            el.clear()
    return out
