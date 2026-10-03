import gzip

from mojimori_content import decompose
from mojimori_content.sources import kanjivg

SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<kanjivg xmlns:kvg='http://kanjivg.tagaini.net'>
<kanji id="kvg:kanji_06c5f">
<g id="kvg:06c5f" kvg:element="\xe6\xb1\x9f">
  <g id="kvg:06c5f-g1" kvg:element="\xe6\xb0\xb5" kvg:original="\xe6\xb0\xb4" kvg:position="left" kvg:radical="general">
    <path id="kvg:06c5f-s1" kvg:type="\xe3\x87\x94" d="M1,1"/>
  </g>
  <g id="kvg:06c5f-g2" kvg:element="\xe5\xb7\xa5" kvg:position="right" kvg:phon="\xe5\xb7\xa5">
    <path id="kvg:06c5f-s4" d="M2,2"/>
  </g>
</g>
</kanji>
<kanji id="kvg:kanji_06c5f-Kaisho"><g id="x" kvg:element="\xe6\xb1\x9f"/></kanji>
</kanjivg>"""


def test_parse_and_components(tmp_path):
    p = tmp_path / "kvg.xml.gz"
    p.write_bytes(gzip.compress(SAMPLE))
    data = kanjivg.parse(p)
    assert list(data) == ["江"]
    k = data["江"]
    uses = decompose.components_of(k, {"工", "氵"})
    assert [u.element for u in uses] == ["氵", "工"]
    assert uses[0].is_radical and uses[0].original == "水"
    assert uses[1].is_phon and uses[1].position == "right"
    assert decompose.phon_from_kvg(k) == "工"
    assert decompose.radical_from_kvg(k) == "氵"
    assert len(k.root.all_strokes()) == 2


SAMPLE_SYNTHETIC = b"""<?xml version="1.0" encoding="UTF-8"?>
<kanjivg xmlns:kvg='http://kanjivg.tagaini.net'>
<kanji id="kvg:kanji_0884c">
<g id="kvg:0884c" kvg:element="\xe8\xa1\x8c" kvg:radical="general">
  <g id="kvg:0884c-g1" kvg:element="\xe5\xbd\xb3" kvg:position="left"><path d="M1,1"/></g>
  <g id="kvg:0884c-g2" kvg:position="right"><path d="M2,2"/><path d="M3,3"/></g>
</g>
</kanji>
</kanjivg>"""


def test_element_less_group_becomes_synthetic_component(tmp_path):
    p = tmp_path / "kvg.xml.gz"
    p.write_bytes(gzip.compress(SAMPLE_SYNTHETIC))
    k = kanjivg.parse(p)["行"]
    uses = decompose.components_of(k, {"彳"})
    assert [u.element for u in uses] == ["彳", "行:right"]
    assert uses[1].synthetic and len(uses[1].strokes) == 2
    name, _, named = decompose.default_name("行:right", {})
    assert "行" in name and not named


def test_clean_phon_strips_markers():
    assert decompose.clean_phon("或V") == "或"
    assert decompose.clean_phon(None) is None
