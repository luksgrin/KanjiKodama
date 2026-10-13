from kanjikodama_content import order
from kanjikodama_content.model import KanjiEntry


def _kd(freqs: dict[str, int]) -> dict[str, KanjiEntry]:
    return {k: KanjiEntry(literal=k, ucs="", freq=f) for k, f in freqs.items()}


def test_components_come_before_kanji_that_use_them():
    kd = _kd({"工": 1000, "江": 10, "水": 5})
    deps = {"江": {"工", "水"}, "工": set(), "水": set()}
    levels = order.order_block(["江", "工", "水"], kd, deps, {}, {})
    flat = [k for lv in levels for k in lv]
    assert flat.index("工") < flat.index("江")
    assert flat.index("水") < flat.index("江")


def test_level_count_and_chunking():
    assert order.level_count(79) == 4
    assert order.level_count(1232) == 50
    assert [len(c) for c in order.chunk(list("abcdefg"), 3)] == [3, 3, 1]


def test_pins_move_kanji():
    kd = _kd({str(i): i for i in range(60)})
    lits = [str(i) for i in range(60)]
    levels = order.order_block(lits, kd, {}, {}, {"59": 1})
    assert "59" in levels[0]
