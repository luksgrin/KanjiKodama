from kanjikodama_content import series
from kanjikodama_content.decompose import RawUse
from kanjikodama_content.model import KanjiEntry


def _k(lit, on):
    return KanjiEntry(literal=lit, ucs="", on=list(on))


KD = {
    "工": _k("工", ["コウ", "ク"]),
    "江": _k("江", ["コウ"]),
    "功": _k("功", ["コウ", "ク"]),
    "空": _k("空", ["クウ"]),
    "左": _k("左", ["サ"]),
    "較": _k("較", ["カク"]),
    "交": _k("交", ["コウ"]),
    "校": _k("校", ["コウ"]),
}


def test_choose_phonetic_prefers_reading_agreement_and_kvg_phon():
    uses = [RawUse("氵", "left", True, False, "水"), RawUse("工", "right", False, True, None)]
    assert series.choose_phonetic("江", uses, KD, "工", None) == "工"
    uses_left = [RawUse("工", "bottom", False, False, None), RawUse("ナ", "top", False, False, None)]
    assert series.choose_phonetic("左", uses_left, KD, None, None) is None  # サ vs コウ: irregular
    assert series.choose_phonetic("江", uses, KD, "工", "none") is None


def test_build_series_classifies_members():
    phonetic_of = {"江": "工", "功": "工", "空": "工", "校": "交", "較": "交"}
    all_series, info = series.build_series(phonetic_of, KD, {})
    by_comp = {s.component: s for s in all_series}
    kou = by_comp["工"]
    assert kou.reading == "コウ"
    matches = {m.literal: m.match for m in kou.members}
    assert matches["江"] == "exact" and matches["功"] == "exact"
    assert matches["空"] == "irregular"
    assert info["較"][1] == "irregular"
    assert 0.6 < kou.reliability < 0.7
