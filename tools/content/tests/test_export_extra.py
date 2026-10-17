from types import SimpleNamespace

from kanjikodama_content.export_extra import clean_gloss, kanji_readings, kun_stem, pos_labels, standalone


def test_kun_stem_drops_okurigana_and_affix_marks() -> None:
    assert kun_stem("ひろ.い") == "ひろ"
    assert kun_stem("-ひこ") == "ひこ"


def test_only_the_primary_reading_type_is_accepted() -> None:
    e = SimpleNamespace(on=["リツ"], kun=["くり", "おのの.く"], nanori=["くる"])
    out = kanji_readings(e, "くり", "kunyomi")
    assert out[0] == {"reading": "くり", "primary": True, "accepted_answer": True, "type": "kunyomi"}
    assert {"reading": "りつ", "primary": False, "accepted_answer": False, "type": "onyomi"} in out
    assert {"reading": "おのの", "primary": False, "accepted_answer": True, "type": "kunyomi"} in out
    assert all(not r["accepted_answer"] for r in out if r["type"] == "nanori")


def test_standalone_ignores_longer_kanji_runs() -> None:
    assert standalone("磯", "磯に行った。")
    assert not standalone("磯", "磯田さんが来た。")
    assert standalone("磯", "磯田さんと磯に行った。")


def test_clean_gloss() -> None:
    assert clean_gloss("Japanese chestnut (Castanea crenata)") == "Japanese chestnut"
    assert clean_gloss("(rocky) beach") == "beach"
    assert clean_gloss("(only parens)") == "(only parens)"


def test_pos_labels() -> None:
    assert pos_labels(["{n}", "{vs}", "{v5r}", "{zz}"]) == ["noun", "する verb", "godan verb"]
