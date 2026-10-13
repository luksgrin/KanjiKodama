from kanjikodama_content.select_vocab import normalise_expression


def test_normalise_expression():
    assert normalise_expression("いい; よい") == ["いい", "よい"]
    assert normalise_expression("(かさを～) さす") == ["さす"]
    assert normalise_expression("〜(日本) 式") == []
    assert normalise_expression("～社") == []
    assert normalise_expression("会う") == ["会う"]
