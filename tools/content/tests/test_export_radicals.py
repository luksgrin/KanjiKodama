import pytest

from kanjikodama_content.export_radicals import rows


def test_stand_ins_become_the_drawn_part() -> None:
    assert rows({"化": (2, "休体"), "込": (3, "近道"), "口": (3, "語")}) == [
        ("亻", 2, "休体"),
        ("辶", 3, "近道"),
        ("口", 3, "語"),
    ]


def test_kanji_are_listed_once() -> None:
    assert rows({"口": (3, "品語品")}) == [("口", 3, "品語")]


def test_a_part_twice_is_an_error() -> None:
    with pytest.raises(ValueError):
        rows({"化": (2, "休"), "亻": (2, "体")})
