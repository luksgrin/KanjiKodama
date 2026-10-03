"""Katakana on'yomi normalisation for phonetic-series matching."""

from __future__ import annotations

_BASE = {
    "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o",
    "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
    "ガ": "ga", "ギ": "gi", "グ": "gu", "ゲ": "ge", "ゴ": "go",
    "サ": "sa", "シ": "si", "ス": "su", "セ": "se", "ソ": "so",
    "ザ": "za", "ジ": "zi", "ズ": "zu", "ゼ": "ze", "ゾ": "zo",
    "タ": "ta", "チ": "ti", "ツ": "tu", "テ": "te", "ト": "to",
    "ダ": "da", "ヂ": "di", "ヅ": "du", "デ": "de", "ド": "do",
    "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
    "ハ": "ha", "ヒ": "hi", "フ": "hu", "ヘ": "he", "ホ": "ho",
    "バ": "ba", "ビ": "bi", "ブ": "bu", "ベ": "be", "ボ": "bo",
    "パ": "pa", "ピ": "pi", "プ": "pu", "ペ": "pe", "ポ": "po",
    "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
    "ヤ": "ya", "ユ": "yu", "ヨ": "yo",
    "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro",
    "ワ": "wa", "ヲ": "wo", "ン": "n", "ッ": "Q", "ー": "-",
}
_SMALL = {"ャ": "ya", "ュ": "yu", "ョ": "yo", "ァ": "a", "ィ": "i", "ゥ": "u", "ェ": "e", "ォ": "o"}
_DEVOICE = {"g": "k", "z": "s", "d": "t", "b": "h", "p": "h"}


def romanize(kana: str) -> str:
    out = []
    for ch in kana:
        if ch in _SMALL and out:
            prev = out.pop()
            out.append(prev[:-1] + _SMALL[ch])  # ki + ya -> kya
        else:
            out.append(_BASE.get(ch, ch))
    return "".join(out)


def core(kana: str) -> str:
    """Collapse voicing and vowel length so コウ/ゴウ/コ compare equal."""
    r = romanize(kana.split(".")[0].replace("-", ""))
    if r and r[0] in _DEVOICE:
        r = _DEVOICE[r[0]] + r[1:]
    r = r.replace("ou", "o").replace("uu", "u").replace("ei", "e").replace("aa", "a")
    return r


def classify(actual: str, series_reading: str) -> str:
    if actual == series_reading:
        return "exact"
    if core(actual) == core(series_reading):
        return "variant"
    return "irregular"
