"""JMdict (English) parser. Entity references such as &n; are kept as their names."""

from __future__ import annotations

import gzip
import io
import re
from pathlib import Path

from lxml import etree

from ..model import JmEntry, KForm, RForm, Sense

_STD = {"amp", "lt", "gt", "quot", "apos"}
_ENTITY = re.compile(rb"&([A-Za-z0-9_-]+);")


def _keep_entity_names(data: bytes) -> bytes:
    def sub(m: re.Match[bytes]) -> bytes:
        name = m.group(1)
        return m.group(0) if name.decode() in _STD else b"{" + name + b"}"

    return _ENTITY.sub(sub, data)


def _texts(el, path: str) -> list[str]:
    return [x.text for x in el.iterfind(path) if x.text]


def parse(path: Path) -> dict[int, JmEntry]:
    with gzip.open(path, "rb") as f:
        data = _keep_entity_names(f.read())
    out: dict[int, JmEntry] = {}
    for _, el in etree.iterparse(io.BytesIO(data), tag="entry", resolve_entities=False, huge_tree=True):
        seq = int(el.findtext("ent_seq"))
        kforms = [
            KForm(k.findtext("keb"), _texts(k, "ke_pri"), _texts(k, "ke_inf"))
            for k in el.iterfind("k_ele")
        ]
        rforms = [
            RForm(
                r.findtext("reb"),
                _texts(r, "re_pri"),
                _texts(r, "re_restr"),
                r.find("re_nokanji") is not None,
            )
            for r in el.iterfind("r_ele")
        ]
        senses = [
            Sense(
                _texts(s, "gloss"),
                _texts(s, "pos"),
                _texts(s, "misc"),
                _texts(s, "stagk"),
                _texts(s, "stagr"),
            )
            for s in el.iterfind("sense")
        ]
        out[seq] = JmEntry(seq, kforms, rforms, senses)
        el.clear()
    return out


_PRI_SCORE = {"news1": 24, "ichi1": 20, "spec1": 20, "gai1": 30, "news2": 40, "ichi2": 40, "spec2": 40, "gai2": 45}


def priority_score(tags: list[str]) -> int:
    """Lower is more common. nfXX gives XX (1..48); named tags map to fixed scores; none -> 99."""
    best = 99
    for t in tags:
        if t.startswith("nf") and t[2:].isdigit():
            best = min(best, int(t[2:]))
        elif t in _PRI_SCORE:
            best = min(best, _PRI_SCORE[t])
    return best
