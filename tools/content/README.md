# KanjiKodama content pipeline

Builds `content.db` (N5–N1) and `obscure.db` from open sources (KANJIDIC2, JMdict,
KRADFILE/RADKFILE, KanjiVG, JLPT lists, Tatoeba). See `docs/spec.md` §6 and §8.

```sh
uv sync
uv run kanjikodama-content build --blocks N5      # phase 1
uv run pytest
```

Sources are downloaded from the dated snapshot release of the private repo
`luksgrin/KanjiKodamaData` named in `sources.lock.json` (via the authenticated `gh` CLI), and
verified against the pinned checksums. `fetch --refresh-upstream` pulls fresh upstream files and
re-pins; `snapshot` publishes the cache as a new release and points the lock at it.

Downloads are cached in `.cache/`, outputs land in `out/`. Both are git-ignored.
