# Hand-written mnemonics

One YAML file per batch, keyed by kanji literal:

```yaml
江:
  meaning: Water (氵) shaped by a craftsman (工): an engineered river mouth, a creek.
  reading: 工-series → コウ. No mnemonic needed.
```

Missing keys fall back to the pipeline's structural scaffold.

## Extra kanji (`extra-*.yaml`)

Mnemonics for the JLPT kanji WaniKani does not teach, used by `mojimori-content export-extra`
for the app in `durtles/`. One entry per kanji:

```yaml
彦:
  meaning: Lad            # primary meaning
  primary_reading: ひこ   # one of its readings, kun'yomi without okurigana
  reading_type: kunyomi   # onyomi, kunyomi or nanori
  meaning_mnemonic: >-
    A young man likes to <radical>stand</radical> at the edge of a <radical>cliff</radical>...
  reading_mnemonic: >-
    The <kanji>lad</kanji> gets the <reading>hic</reading>cups...
```

Markup: `<radical>`, `<kanji>`, `<vocabulary>`, `<reading>`, `<ja>`. The export refuses to run
while any kanji is missing or an entry is invalid.
