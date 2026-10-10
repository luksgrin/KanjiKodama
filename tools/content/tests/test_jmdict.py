import gzip

from mojimori_content.sources import jmdict

SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE JMdict [<!ENTITY n "noun (common) (futsuumeishi)"><!ENTITY uk "word usually written using kana alone">]>
<JMdict>
<entry><ent_seq>1000001</ent_seq>
<k_ele><keb>江</keb><ke_pri>news1</ke_pri><ke_pri>nf12</ke_pri></k_ele>
<r_ele><reb>え</reb><re_pri>news1</re_pri></r_ele>
<sense><pos>&n;</pos><gloss>inlet</gloss><gloss>bay</gloss></sense>
</entry>
</JMdict>"""


def test_parse_keeps_entity_names(tmp_path):
    p = tmp_path / "jm.gz"
    p.write_bytes(gzip.compress(SAMPLE.encode()))
    d = jmdict.parse(p)
    e = d[1000001]
    assert e.kforms[0].text == "江" and e.kforms[0].pri == ["news1", "nf12"]
    assert e.senses[0].pos == ["{n}"]
    assert e.senses[0].glosses == ["inlet", "bay"]
    assert jmdict.priority_score(e.kforms[0].pri) == 12
    assert jmdict.priority_score([]) == 99


def test_kanjidic_drops_radical_table_glosses(tmp_path):
    from mojimori_content.sources import kanjidic2

    xml = b"""<?xml version="1.0" encoding="UTF-8"?><kanjidic2><character><literal>\xe4\xb8\x80</literal>
<codepoint><cp_value cp_type="ucs">4e00</cp_value></codepoint><misc><grade>1</grade></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">\xe3\x82\xa4\xe3\x83\x81</reading>
<meaning>one</meaning><meaning>one radical (no.1)</meaning></rmgroup></reading_meaning></character></kanjidic2>"""
    p = tmp_path / "kd.xml.gz"
    p.write_bytes(gzip.compress(xml))
    assert kanjidic2.parse(p)["一"].meanings == ["one"]
