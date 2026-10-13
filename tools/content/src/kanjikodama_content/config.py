"""Paths and pinned source definitions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parents[2]  # tools/content
REPO_DIR = TOOL_DIR.parents[1]
CACHE_DIR = TOOL_DIR / ".cache"
OUT_DIR = TOOL_DIR / "out"
CONTENT_DIR = REPO_DIR / "content"
SEED_DIR = CONTENT_DIR / "seed_words"
LOCK_FILE = TOOL_DIR / "sources.lock.json"

KANJIVG_RELEASE = "20260714"

# Private snapshot mirror of the raw upstream files (GitHub releases, one tag per snapshot).
DATA_REPO = "luksgrin/KanjiKodamaData"


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    filename: str
    licence: str
    homepage: str
    note: str = ""


SOURCES: dict[str, Source] = {
    s.name: s
    for s in [
        Source(
            "kanjidic2",
            "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
            "kanjidic2.xml.gz",
            "CC BY-SA 4.0",
            "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
            "Electronic Dictionary Research and Development Group",
        ),
        Source(
            "jmdict",
            "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
            "JMdict_e.gz",
            "CC BY-SA 4.0",
            "https://www.edrdg.org/jmdict/j_jmdict.html",
            "English-only JMdict",
        ),
        Source(
            "kradfile",
            "http://ftp.edrdg.org/pub/Nihongo/kradfile.gz",
            "kradfile.gz",
            "CC BY-SA 4.0",
            "https://www.edrdg.org/krad/kradinf.html",
            "EUC-JP encoded",
        ),
        Source(
            "radkfile",
            "http://ftp.edrdg.org/pub/Nihongo/radkfile.gz",
            "radkfile.gz",
            "CC BY-SA 4.0",
            "https://www.edrdg.org/krad/kradinf.html",
            "EUC-JP encoded",
        ),
        Source(
            "kanjivg",
            f"https://github.com/KanjiVG/kanjivg/releases/download/r{KANJIVG_RELEASE}/kanjivg-{KANJIVG_RELEASE}.xml.gz",
            f"kanjivg-{KANJIVG_RELEASE}.xml.gz",
            "CC BY-SA 3.0",
            "https://kanjivg.tagaini.net",
            "Ulrich Apel; stroke order and decomposition",
        ),
        Source(
            "jlpt_kanji",
            "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json",
            "kanji-data.json",
            "MIT",
            "https://github.com/davidluzgouveia/kanji-data",
            "Only the jlpt_new field is used (Jonathan Waller's unofficial JLPT lists)",
        ),
        *[
            Source(
                f"jlpt_vocab_{lvl}",
                f"https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/{lvl}.csv",
                f"jlpt-vocab-{lvl}.csv",
                "MIT",
                "https://github.com/elzup/jlpt-word-list",
                "Unofficial JLPT vocabulary (from tanos.co.uk decks)",
            )
            for lvl in ("n5", "n4", "n3", "n2", "n1")
        ],
        Source(
            "tatoeba_ja",
            "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2",
            "jpn_sentences.tsv.bz2",
            "CC BY 2.0 FR",
            "https://tatoeba.org",
        ),
        Source(
            "tatoeba_en",
            "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2",
            "eng_sentences.tsv.bz2",
            "CC BY 2.0 FR",
            "https://tatoeba.org",
        ),
        Source(
            "tatoeba_links",
            "https://downloads.tatoeba.org/exports/per_language/jpn/jpn-eng_links.tsv.bz2",
            "jpn-eng_links.tsv.bz2",
            "CC BY 2.0 FR",
            "https://tatoeba.org",
        ),
    ]
}


def cache_path(name: str) -> Path:
    return CACHE_DIR / SOURCES[name].filename
