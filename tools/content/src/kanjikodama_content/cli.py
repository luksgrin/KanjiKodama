"""Command-line entry point."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from .model import BLOCKS

app = typer.Typer(no_args_is_help=True, help="Build KanjiKodama content databases.")


@app.callback()
def main() -> None:
    """KanjiKodama content pipeline."""


def _blocks(blocks: list[str] | None) -> list[str]:
    selected = [b.upper() for b in (blocks or ["N5"])]
    unknown = [b for b in selected if b not in BLOCKS]
    if unknown:
        raise typer.BadParameter(f"unknown block(s): {', '.join(unknown)}")
    return selected


@app.command()
def fetch(
    refresh_upstream: Annotated[bool, typer.Option(help="Download from upstream and re-pin checksums.")] = False,
) -> None:
    """Download all sources into .cache (snapshot mirror first) and verify checksums."""
    from .fetch import fetch_all

    fetch_all(refresh_upstream=refresh_upstream)


@app.command()
def snapshot(
    tag: Annotated[str | None, typer.Option(help="Release tag (default: today's date).")] = None,
) -> None:
    """Publish the cached, lock-verified sources as a new release of the data repository."""
    from datetime import UTC, datetime

    from .fetch import snapshot as make_snapshot

    make_snapshot(tag or datetime.now(UTC).strftime("%Y-%m-%d"))


@app.command()
def classify() -> None:
    """Print block sizes for the whole KANJIDIC2 set."""
    from . import classify as classify_mod
    from .config import cache_path
    from .fetch import fetch_all
    from .sources import jlpt, kanjidic2

    fetch_all(["kanjidic2", "jlpt_kanji"])
    kd = kanjidic2.parse(cache_path("kanjidic2"))
    c = classify_mod.classify_all(kd, jlpt.parse_kanji_levels(cache_path("jlpt_kanji")))
    for k, v in sorted(classify_mod.counts(c).items()):
        typer.echo(f"{k:10} {v}")


@app.command()
def build(
    blocks: Annotated[list[str] | None, typer.Option("--blocks", "-b", help="Blocks to build (default: N5).")] = None,
    out: Annotated[Path | None, typer.Option(help="Output directory (default: tools/content/out).")] = None,
    refresh_upstream: Annotated[bool, typer.Option(help="Re-download sources from upstream and re-pin.")] = False,
) -> None:
    """Run the full pipeline for the given blocks."""
    from .build import run
    from .config import OUT_DIR

    run(_blocks(blocks), out_dir=out or OUT_DIR, refresh_upstream=refresh_upstream)


@app.command("export-sound")
def export_sound(
    out: Annotated[Path | None, typer.Option(help="Output file.")] = None,
) -> None:
    """Export component roles and phonetic series for the offline app."""
    from .config import REPO_DIR
    from .export_sound import export

    export(out or REPO_DIR / "content/inputs/sound-components.db")


@app.command("export-jlpt")
def export_jlpt(
    out: Annotated[Path | None, typer.Option(help="Output file.")] = None,
) -> None:
    """Export the JLPT kanji list for the offline app's JLPT curriculum."""
    from .config import REPO_DIR
    from .export_jlpt import export

    export(out or REPO_DIR / "content/inputs/jlpt-kanji.tsv")


@app.command("export-extra")
def export_extra(
    brief: Annotated[Path | None, typer.Option(help="Write a JSON brief for mnemonic writers here instead.")] = None,
    out: Annotated[Path | None, typer.Option(help="Output file.")] = None,
) -> None:
    """Export the JLPT kanji WaniKani lacks (with words and mnemonics) for the offline app."""
    from .config import REPO_DIR
    from .export_extra import brief as write_brief
    from .export_extra import export

    if brief:
        write_brief(brief)
    else:
        export(out or REPO_DIR / "content/inputs/extra-kanji.db")


if __name__ == "__main__":
    app()
