from mojimori_content.export_jlpt import merge


def test_new_lists_win_over_old_field() -> None:
    assert merge({"人": "N5"}, {"人": 2}, {}) == {"人": 5}


def test_old_field_fills_gaps() -> None:
    assert merge({}, {"分": 4, "身": 2, "里": 1, "x": None}, {}) == {"分": 5, "身": 3, "里": 1}


def test_overrides_have_the_last_word() -> None:
    assert merge({"誰": "N3"}, {"々": None}, {"々": "N5", "誰": "OBSCURE"}) == {"々": 5}
