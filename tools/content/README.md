# MojiMori content pipeline

Builds `content.db` (N5–N1) and `obscure.db` from open sources (KANJIDIC2, JMdict,
KRADFILE/RADKFILE, KanjiVG, JLPT lists, Tatoeba). See `docs/spec.md` §6 and §8.

```sh
uv sync
uv run mojimori-content build --blocks N5      # phase 1
uv run pytest
```

Downloads are cached in `.cache/`, outputs land in `out/`. Both are git-ignored.
