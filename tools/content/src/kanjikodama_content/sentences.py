"""Attach up to two Tatoeba sentences per word, preferring sentences within the learner's kanji."""

from __future__ import annotations

from collections import defaultdict

from .model import SentencePair, VocabPick
from .select_vocab import kanji_in


def attach(picks: list[VocabPick], pairs: list[SentencePair], kanji_level: dict[str, int], *, per_word: int = 2) -> int:
    index: dict[str, list[int]] = defaultdict(list)
    for i, p in enumerate(pairs):
        for k in set(kanji_in(p.ja)):
            index[k].append(i)
    sentence_kanji = [set(kanji_in(p.ja)) for p in pairs]
    attached = 0
    all_ids = range(len(pairs))
    for v in picks:
        ks = set(v.kanji)
        if ks:
            cand = None
            for k in ks:
                s = set(index.get(k, []))
                cand = s if cand is None else cand & s
            cand_ids = sorted(cand or [])
        else:
            if len(v.word) < 3:
                continue
            cand_ids = [i for i in all_ids if v.word in pairs[i].ja]
        scored = []
        for i in cand_ids:
            p = pairs[i]
            if v.word not in p.ja:
                continue
            over = sum(1 for k in sentence_kanji[i] if kanji_level.get(k, 10**6) > v.level)
            scored.append((over, len(p.ja), i))
            if len(scored) > 400:
                break
        scored.sort()
        v.sentences = [pairs[i] for _, _, i in scored[:per_word]]
        attached += len(v.sentences)
    return attached
