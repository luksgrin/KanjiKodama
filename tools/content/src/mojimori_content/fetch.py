"""Download sources into the cache and pin their checksums in sources.lock.json."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx

from .config import CACHE_DIR, LOCK_FILE, SOURCES, cache_path


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_lock() -> dict[str, dict[str, str]]:
    if LOCK_FILE.exists():
        return json.loads(LOCK_FILE.read_text())
    return {}


def save_lock(lock: dict[str, dict[str, str]]) -> None:
    LOCK_FILE.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n")


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with httpx.stream("GET", url, follow_redirects=True, timeout=600) as r:
        r.raise_for_status()
        with tmp.open("wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
    tmp.replace(dest)


class ChecksumMismatch(RuntimeError):
    pass


def fetch(name: str, *, refresh: bool = False, log=print) -> Path:
    """Return the cached file for `name`, downloading it if needed and verifying the lock."""
    src = SOURCES[name]
    path = cache_path(name)
    lock = load_lock()
    if refresh or not path.exists():
        log(f"fetching {name} <- {src.url}")
        download(src.url, path)
    digest = sha256_of(path)
    pinned = lock.get(name, {}).get("sha256")
    if pinned and pinned != digest and not refresh:
        raise ChecksumMismatch(
            f"{name}: cached file {path.name} has sha256 {digest[:12]}… but lock pins "
            f"{pinned[:12]}…; delete the file or run with --refresh to re-pin"
        )
    if pinned != digest:
        lock[name] = {
            "sha256": digest,
            "url": src.url,
            "fetched": datetime.now(UTC).date().isoformat(),
        }
        save_lock(lock)
        log(f"pinned {name} sha256 {digest[:12]}…")
    return path


def fetch_all(names=None, *, refresh: bool = False, log=print) -> dict[str, Path]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return {n: fetch(n, refresh=refresh, log=log) for n in (names or SOURCES)}
