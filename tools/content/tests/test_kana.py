from mojimori_content import kana


def test_romanize_basic():
    assert kana.romanize("コウ") == "kou"
    assert kana.romanize("キョウ") == "kyou"
    assert kana.romanize("ショク") == "syoku"


def test_core_collapses_voicing_and_length():
    assert kana.core("コウ") == kana.core("ゴウ") == kana.core("コ")
    assert kana.core("セイ") == kana.core("ゼイ")
    assert kana.core("コウ") != kana.core("クウ")


def test_classify():
    assert kana.classify("コウ", "コウ") == "exact"
    assert kana.classify("ゴウ", "コウ") == "variant"
    assert kana.classify("カク", "コウ") == "irregular"
