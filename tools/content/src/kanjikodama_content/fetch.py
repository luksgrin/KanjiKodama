"""Fetch sources: snapshot mirror first, upstream as fallback; checksums pinned in sources.lock.json.

The lock file records one sha256 per source plus the snapshot tag they were taken from. A fresh
clone downloads exactly those bytes from the KanjiKodamaData release, so builds are reproducible even
though JMdict and Tatoeba are regenerated upstream every day or week.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import httpx

from .config import CACHE_DIR, DATA_REPO, LOCK_FILE, SOURCES, cache_path

SNAPSHOT_KEY = "_snapshot"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_lock() -> dict:
    if LOCK_FILE.exists():
        return json.loads(LOCK_FILE.read_text())
    return {}


def save_lock(lock: dict) -> None:
    LOCK_FILE.write_text(json.dumps(lock, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def snapshot_tag(lock: dict | None = None) -> str | None:
    return (lock if lock is not None else load_lock()).get(SNAPSHOT_KEY, {}).get("tag")


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with httpx.stream("GET", url, follow_redirects=True, timeout=600) as r:
        r.raise_for_status()
        with tmp.open("wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
    tmp.replace(dest)


def gh_available() -> bool:
    return shutil.which("gh") is not None


def mirror_download(filename: str, tag: str, dest_dir: Path, log=print) -> bool:
    """Download one asset of the snapshot release with the authenticated gh CLI."""
    if not gh_available():
        return False
    dest_dir.mkdir(parents=True, exist_ok=True)
    cmd = ["gh", "release", "download", tag, "--repo", DATA_REPO, "--pattern", filename, "--dir", str(dest_dir), "--clobber"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"  mirror miss for {filename}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.returncode}")
        return False
    return (dest_dir / filename).exists()


class ChecksumMismatch(RuntimeError):
    pass


def fetch(name: str, *, refresh_upstream: bool = False, log=print) -> Path:
    """Return the cached file for `name`.

    Missing files come from the snapshot mirror named in the lock, else from upstream.
    With refresh_upstream=True the upstream file is downloaded and re-pinned.
    """
    src = SOURCES[name]
    path = cache_path(name)
    lock = load_lock()
    tag = snapshot_tag(lock)
    if refresh_upstream or not path.exists():
        got = False
        if not refresh_upstream and tag:
            log(f"fetching {name} <- snapshot {tag}")
            got = mirror_download(src.filename, tag, CACHE_DIR, log=log)
        if not got:
            log(f"fetching {name} <- {src.url}")
            download(src.url, path)
    digest = sha256_of(path)
    pinned = lock.get(name, {}).get("sha256")
    if pinned and pinned != digest and not refresh_upstream:
        raise ChecksumMismatch(
            f"{name}: cached file {path.name} has sha256 {digest[:12]}… but lock pins "
            f"{pinned[:12]}…; delete the file to re-fetch from the snapshot, or run "
            f"`kanjikodama-content fetch --refresh-upstream` to re-pin"
        )
    if pinned != digest:
        lock[name] = {"sha256": digest, "url": src.url, "fetched": datetime.now(UTC).date().isoformat()}
        save_lock(lock)
        log(f"pinned {name} sha256 {digest[:12]}…")
    return path


def fetch_all(names=None, *, refresh_upstream: bool = False, log=print) -> dict[str, Path]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return {n: fetch(n, refresh_upstream=refresh_upstream, log=log) for n in (names or SOURCES)}


def attribution(lock: dict) -> str:
    lines = [
        "# Attribution",
        "",
        "Raw upstream files frozen for the KanjiKodama content pipeline. Each file is redistributed",
        "unchanged under its own licence; the pipeline that consumes them lives in the KanjiKodama repo.",
        "",
        "| File | Source | Licence | Fetched | sha256 |",
        "|------|--------|---------|---------|--------|",
    ]
    for name, src in SOURCES.items():
        info = lock.get(name, {})
        lines.append(
            f"| `{src.filename}` | [{src.note or src.name}]({src.homepage}) | {src.licence} | "
            f"{info.get('fetched', '')} | `{info.get('sha256', '')[:16]}…` |"
        )
    lines += [
        "",
        "Licences: EDRDG files (KANJIDIC2, JMdict, KRADFILE, RADKFILE) are CC BY-SA 4.0, see",
        "https://www.edrdg.org/edrdg/licence.html. KanjiVG is CC BY-SA 3.0 (Ulrich Apel). The JLPT",
        "lists are Jonathan Waller's unofficial lists via MIT-licensed mirrors. Tatoeba sentences are",
        "CC BY 2.0 FR.",
    ]
    return "\n".join(lines) + "\n"


def snapshot(tag: str, *, log=print) -> None:
    """Upload the cached files as a new release of the data repo and record the tag in the lock."""
    if not gh_available():
        raise RuntimeError("gh CLI is required to publish a snapshot")
    lock = load_lock()
    files = []
    for name in SOURCES:
        path = cache_path(name)
        if not path.exists():
            raise RuntimeError(f"{name} is not cached; run fetch first")
        digest = sha256_of(path)
        if lock.get(name, {}).get("sha256") != digest:
            raise RuntimeError(f"{name} does not match the lock; run fetch --refresh-upstream first")
        files.append(str(path))
    notes = CACHE_DIR / f"ATTRIBUTION-{tag}.md"
    notes.write_text(attribution(lock), encoding="utf-8")
    cmd = ["gh", "release", "create", tag, "--repo", DATA_REPO, "--title", f"Snapshot {tag}", "--notes-file", str(notes), *files]
    log(f"creating release {tag} on {DATA_REPO} with {len(files)} assets…")
    subprocess.run(cmd, check=True)
    lock[SNAPSHOT_KEY] = {"repo": DATA_REPO, "tag": tag, "created": datetime.now(UTC).date().isoformat()}
    save_lock(lock)
    log(f"lock now points at snapshot {tag}")
