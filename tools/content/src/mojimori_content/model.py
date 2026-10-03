"""Shared data types for the content pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field

BLOCKS: tuple[str, ...] = ("N5", "N4", "N3", "N2", "N1", "OBSCURE")
BLOCK_NICKNAMES = {
    "N5": "Sprout",
    "N4": "Sapling",
    "N3": "Grove",
    "N2": "Forest",
    "N1": "Canopy",
    "OBSCURE": "Deep Woods",
}
KANJI_PER_LEVEL = 25
MIN_WORDS_PER_KANJI = {"N5": 4, "N4": 4, "N3": 4, "N2": 4, "N1": 3, "OBSCURE": 0}
TARGET_WORDS_PER_LEVEL = 100  # priority fill stops here; JLPT/seed words are always kept
MAX_WORDS_PER_LEVEL = 200
WORDS_PER_LEVEL_BAND = (80, 180)


# ----------------------------------------------------------------------------- sources


@dataclass(slots=True)
class KanjiEntry:
    """One KANJIDIC2 character."""

    literal: str
    ucs: str
    jis208: str | None = None
    jis212: str | None = None
    jis213: str | None = None
    grade: int | None = None
    strokes: int | None = None
    freq: int | None = None
    jlpt_old: int | None = None
    radical: int | None = None
    on: list[str] = field(default_factory=list)
    kun: list[str] = field(default_factory=list)
    nanori: list[str] = field(default_factory=list)
    meanings: list[str] = field(default_factory=list)
    variants: list[str] = field(default_factory=list)  # literals of variant forms

    @property
    def is_joyo(self) -> bool:
        return self.grade is not None and 1 <= self.grade <= 8

    @property
    def is_jinmeiyo(self) -> bool:
        return self.grade in (9, 10)

    @property
    def jis208_row(self) -> int | None:
        if not self.jis208:
            return None
        parts = self.jis208.split("-")
        return int(parts[1]) if len(parts) == 3 else None


@dataclass(slots=True)
class KForm:
    text: str
    pri: list[str]
    info: list[str]


@dataclass(slots=True)
class RForm:
    text: str
    pri: list[str]
    restr: list[str]
    nokanji: bool


@dataclass(slots=True)
class Sense:
    glosses: list[str]
    pos: list[str]
    misc: list[str]
    stagk: list[str]
    stagr: list[str]


@dataclass(slots=True)
class JmEntry:
    seq: int
    kforms: list[KForm]
    rforms: list[RForm]
    senses: list[Sense]


@dataclass(slots=True)
class KvgNode:
    element: str | None = None
    position: str | None = None
    phon: str | None = None
    radical: str | None = None
    part: int | None = None
    original: str | None = None
    variant: bool = False
    children: list[KvgNode] = field(default_factory=list)
    strokes: list[tuple[str | None, str]] = field(default_factory=list)  # (type, path d)

    def all_strokes(self) -> list[tuple[str | None, str]]:
        out = list(self.strokes)
        for c in self.children:
            out.extend(c.all_strokes())
        return out

    def groups(self) -> list[KvgNode]:
        """All descendant groups, depth-first, including self."""
        out = [self]
        for c in self.children:
            out.extend(c.groups())
        return out


@dataclass(slots=True)
class KvgKanji:
    literal: str
    root: KvgNode


@dataclass(slots=True)
class JlptWord:
    expression: str
    reading: str
    level: str  # N5..N1


@dataclass(slots=True)
class SentencePair:
    ja_id: int
    ja: str
    en: str


# ----------------------------------------------------------------------------- derived


@dataclass(slots=True)
class Classified:
    literal: str
    block: str
    tier: int | None = None  # Obscure sub-tier 1..4


@dataclass(slots=True)
class ComponentUse:
    slug: str
    role: str  # semantic | phonetic | both | none
    position: str | None


@dataclass(slots=True)
class Component:
    slug: str  # the glyph itself
    glyph: str
    name: str
    meaning: str
    is_kanji: bool
    variant_of: str | None
    on: list[str]
    role_tendency: str  # semantic | phonetic | both | unknown
    strokes: list[tuple[str | None, str]]
    level: int | None = None
    kangxi: int | None = None
    named: bool = True


@dataclass(slots=True)
class SeriesMember:
    literal: str
    actual: str
    match: str  # exact | variant | irregular


@dataclass(slots=True)
class Series:
    id: int
    component: str
    reading: str
    members: list[SeriesMember]
    total_members: int = 0  # over the whole N5–N1 set, frozen before scope trimming
    reliability: float = 0.0

    def freeze(self) -> None:
        self.total_members = len(self.members)
        ok = sum(1 for m in self.members if m.match in ("exact", "variant"))
        self.reliability = ok / len(self.members) if self.members else 0.0


@dataclass(slots=True)
class KanjiPlan:
    literal: str
    block: str
    tier: int | None
    level: int
    components: list[ComponentUse]
    phonetic: str | None = None
    series_id: int | None = None
    match: str | None = None
    predicted_on: str | None = None
    category: str = "unknown"  # keisei | atomic | unknown
    old_form_of: str | None = None
    asked_reading_type: str = "on"
    meaning_mnemonic: str = ""
    reading_mnemonic: str = ""


@dataclass(slots=True)
class Level:
    number: int
    block: str
    ordinal: int  # within block
    tier: int | None
    kanji: list[str]


@dataclass(slots=True)
class VocabPick:
    seq: int
    word: str
    readings: list[str]
    meanings: list[str]
    pos: str
    priority: int
    level: int
    is_kana_only: bool
    source: str  # jlpt | seed | priority | fill
    kanji: list[str]
    sentences: list[SentencePair] = field(default_factory=list)
    notes: str = ""
