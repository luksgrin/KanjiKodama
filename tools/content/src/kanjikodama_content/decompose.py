"""Component extraction from KanjiVG trees."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .model import KanjiEntry, KvgKanji, KvgNode

# Default names for components that are not kanji in KANJIDIC2.
# Overridden by content/components.yaml.
DEFAULT_COMPONENT_NAMES: dict[str, tuple[str, str]] = {
    "亻": ("person", "person (left form)"),
    "⺅": ("person", "person (left form)"),
    "氵": ("water", "water (left form)"),
    "⺡": ("water", "water (left form)"),
    "忄": ("heart", "heart (left form)"),
    "⺖": ("heart", "heart (left form)"),
    "扌": ("hand", "hand (left form)"),
    "⺘": ("hand", "hand (left form)"),
    "艹": ("grass", "grass (top form)"),
    "⺾": ("grass", "grass (top form)"),
    "辶": ("road", "road, movement"),
    "⻌": ("road", "road, movement"),
    "阝": ("hill / village", "hill (left) or village (right)"),
    "⻖": ("hill", "hill (left form)"),
    "⻏": ("village", "village (right form)"),
    "宀": ("roof", "roof"),
    "冖": ("cover", "cover, cloth"),
    "亠": ("lid", "lid, top"),
    "丶": ("dot", "dot"),
    "丿": ("slash", "slash stroke"),
    "乀": ("stroke", "stroke"),
    "乚": ("hook", "hook stroke"),
    "亅": ("hook", "hook stroke"),
    "冂": ("box", "open box, enclosure"),
    "凵": ("container", "open container"),
    "匸": ("hiding", "hiding enclosure"),
    "匚": ("box", "right-open box"),
    "厂": ("cliff", "cliff"),
    "厶": ("private", "private, self"),
    "儿": ("legs", "legs, human below"),
    "勹": ("wrap", "wrapping"),
    "匕": ("spoon", "spoon, sitting person"),
    "卜": ("divination", "divination"),
    "卩": ("seal", "seal, kneeling person"),
    "又": ("hand (right)", "right hand, again"),
    "夂": ("go", "going, winter"),
    "夊": ("walk slowly", "walking slowly"),
    "夕": ("evening", "evening"),
    "寸": ("inch", "measurement, hand"),
    "尢": ("lame", "lame"),
    "尸": ("corpse", "body, corpse"),
    "屮": ("sprout", "sprout"),
    "巛": ("river", "river"),
    "巾": ("cloth", "cloth"),
    "幺": ("thread (short)", "short thread"),
    "广": ("building", "building, house on cliff"),
    "廴": ("stride", "long stride"),
    "廾": ("two hands", "two hands"),
    "弋": ("stake", "stake, shoot"),
    "彐": ("hand (broom)", "hand holding a broom"),
    "彑": ("snout", "snout"),
    "彡": ("hair", "hair, decoration"),
    "彳": ("step", "step (left form)"),
    "戈": ("halberd", "halberd"),
    "攵": ("strike", "strike, action"),
    "攴": ("strike", "strike"),
    "斤": ("axe", "axe"),
    "无": ("not", "not"),
    "日": ("sun", "sun, day"),
    "曰": ("say", "to say"),
    "欠": ("yawn", "lack, yawn"),
    "殳": ("weapon", "weapon in hand"),
    "氺": ("water (bottom)", "water (bottom form)"),
    "灬": ("fire (bottom)", "fire (bottom form)"),
    "⺣": ("fire (bottom)", "fire (bottom form)"),
    "爫": ("claw", "claw (top form)"),
    "⺤": ("claw", "claw (top form)"),
    "爪": ("claw", "claw"),
    "爿": ("split wood", "split wood (left)"),
    "犭": ("dog", "dog (left form)"),
    "⺨": ("dog", "dog (left form)"),
    "疒": ("sickness", "sickness"),
    "癶": ("footsteps", "footsteps"),
    "礻": ("altar", "altar, spirit (left form)"),
    "⺭": ("altar", "altar, spirit (left form)"),
    "禸": ("track", "animal track"),
    "罒": ("net", "net (top form)"),
    "⺲": ("net", "net (top form)"),
    "耂": ("old", "old (top form)"),
    "⺹": ("old", "old (top form)"),
    "肀": ("brush", "brush in hand"),
    "⺼": ("meat", "meat (left form)"),
    "艸": ("grass", "grass"),
    "虍": ("tiger", "tiger stripes"),
    "衤": ("clothes", "clothes (left form)"),
    "⻂": ("clothes", "clothes (left form)"),
    "襾": ("cover", "cover (top)"),
    "覀": ("cover", "cover (top form of 西)"),
    "辵": ("road", "road, movement"),
    "釒": ("metal", "metal (left form)"),
    "镸": ("long", "long (left form)"),
    "飠": ("food", "food (left form)"),
    "⻞": ("food", "food (left form)"),
    "髟": ("long hair", "long hair"),
    "鬥": ("fight", "fighting"),
    "鬲": ("cauldron", "cauldron"),
    "⺌": ("small (top)", "small (top form)"),
    "⺍": ("small (top)", "small (top form)"),
    "⺗": ("heart (bottom)", "heart (bottom form)"),
    "⺧": ("cow", "cow (left form)"),
    "⻊": ("foot", "foot (left form)"),
    "⻑": ("long", "long"),
    "㐅": ("cross", "cross stroke"),
    "𠂉": ("slanted stroke", "slanted top stroke"),
    "𠂇": ("left hand", "left hand (in 左 右 友 有)"),
    "丆": ("cliff stroke", "horizontal with a falling stroke"),
    "亍": ("step (right)", "small step (right half of 行)"),
    "吾": ("I", "I, myself"),
    "冋": ("enclosure", "wide enclosure"),
    "𠆢": ("roof (person)", "person as roof"),
    "⺈": ("knife (top)", "knife (top form)"),
    "𭕄": ("small (top)", "small (top form)"),
}

_POSITION_PREFERENCE = ["right", "bottom", "top", "left", "nyo", "tare", "kamae", "kamae1", "kamae2"]


@dataclass(slots=True)
class RawUse:
    element: str
    position: str | None
    is_radical: bool
    is_phon: bool
    original: str | None
    strokes: list[tuple[str | None, str]] | None = None  # set for synthetic (element-less) parts

    @property
    def synthetic(self) -> bool:
        return self.strokes is not None


def _leaf_elements(node: KvgNode, known: set[str], literal: str, depth: int = 0) -> list[RawUse]:
    """Walk a kanji's immediate structure and return the taught components."""
    uses: list[RawUse] = []
    seen_parts: set[tuple[str, int | None]] = set()
    for idx, child in enumerate(node.children):
        el = child.element
        if el is None:
            if any(c.element for c in child.groups()[1:]):
                uses.extend(_leaf_elements(child, known, literal, depth + 1))
            elif child.all_strokes():
                # stroke group with no named element (e.g. the right half of 行): synthetic part
                label = child.position or f"part{idx + 1}"
                uses.append(
                    RawUse(
                        element=f"{literal}:{label}",
                        position=child.position or node.position,
                        is_radical=child.radical is not None,
                        is_phon=child.phon is not None,
                        original=None,
                        strokes=child.all_strokes(),
                    )
                )
            continue
        if child.part is not None:
            key = (el, None)
            if key in seen_parts:
                continue
            seen_parts.add(key)
        has_subgroups = any(c.element for c in child.groups()[1:])
        if el in known or not has_subgroups or depth >= 2:
            uses.append(
                RawUse(
                    element=el,
                    position=child.position or node.position,
                    is_radical=child.radical is not None,
                    is_phon=child.phon is not None,
                    original=child.original,
                )
            )
        else:
            uses.extend(_leaf_elements(child, known, literal, depth + 1))
    return uses


def components_of(kvg: KvgKanji, known: set[str]) -> list[RawUse]:
    root = kvg.root
    if not any(c.element for c in root.groups()[1:]):
        return []  # atomic
    uses = _leaf_elements(root, known, kvg.literal)
    # dedupe keeping first occurrence
    out, seen = [], set()
    for u in uses:
        if u.element == kvg.literal:
            continue
        if u.element not in seen:
            seen.add(u.element)
            out.append(u)
    return out


_CJK = re.compile(r"[\u2e80-\u2fdf\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U0002ffff]")


def clean_phon(value: str | None) -> str | None:
    """KanjiVG phon values may carry markers such as a trailing V; keep the glyph only."""
    if not value:
        return None
    m = _CJK.search(value)
    return m.group(0) if m else None


def phon_from_kvg(kvg: KvgKanji) -> str | None:
    for g in kvg.root.groups()[1:]:
        if g.phon:
            return clean_phon(g.phon)
    return None


def radical_from_kvg(kvg: KvgKanji) -> str | None:
    for g in kvg.root.groups()[1:]:
        if g.radical in ("general", "tradit", "nelson") and g.element:
            return g.element
    return None


def default_name(glyph: str, kanjidic: dict[str, KanjiEntry]) -> tuple[str, str, bool]:
    """(name, meaning, named?)"""
    if ":" in glyph:
        kanji, _, label = glyph.partition(":")
        return f"{label} part of {kanji}", f"unnamed {label} part of {kanji}", False
    if glyph in DEFAULT_COMPONENT_NAMES:
        n, m = DEFAULT_COMPONENT_NAMES[glyph]
        return n, m, True
    k = kanjidic.get(glyph)
    if k and k.meanings:
        return k.meanings[0], ", ".join(k.meanings[:3]), True
    return f"component {glyph}", f"unnamed component {glyph}", False
