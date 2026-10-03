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
