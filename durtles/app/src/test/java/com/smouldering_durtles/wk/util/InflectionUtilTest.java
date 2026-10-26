package com.smouldering_durtles.wk.util;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * KanjiKodama: the negative (NAI) forms of する verbs. The stem used to be しな, so every NAI ending (which starts
 * with な) came out doubled: 運転しなない.
 */
public final class InflectionUtilTest {
    private static String suru(final String verb, final String form) {
        return InflectionUtil.getConjugatedVerb(verb, InflectionUtil.VerbType.SURU, form);
    }

    @Test
    public void suruVerbNegativeForms() {
        assertEquals("運転しない", suru("運転する", "negative"));
        assertEquals("運転しなくて", suru("運転する", "negative て-form"));
        assertEquals("運転しなかった", suru("運転する", "past negative"));
        assertEquals("運転しないでください", suru("運転する", "\"don't do please\""));
        assertEquals("運転しないで", suru("運転する", "\"without\""));
        assertEquals("運転しなきゃ", suru("運転する", "must (informal)"));
        assertEquals("運転しなくてはいけない", suru("運転する", "must (formal)"));
    }

    @Test
    public void bareSuruAndNounsWithoutSuru() {
        assertEquals("しない", suru("する", "negative"));
        assertEquals("サービスしなかった", suru("サービス", "past negative"));
    }

    @Test
    public void otherSuruFormsUnchanged() {
        assertEquals("運転します", suru("運転する", "polite non past"));
        assertEquals("運転しろ", suru("運転する", "imperative"));
        assertEquals("運転した", suru("運転する", "past"));
        assertEquals("運転している", suru("運転する", "continuing"));
        assertEquals("運転すること", suru("運転する", "nominalization"));
    }

    @Test
    public void godanAndIchidanNegativesUnchanged() {
        assertEquals("飲まない", InflectionUtil.getConjugatedVerb("飲む", InflectionUtil.VerbType.GODAN, "negative"));
        assertEquals("食べなかった",
                InflectionUtil.getConjugatedVerb("食べる", InflectionUtil.VerbType.ICHIDAN, "past negative"));
        assertEquals("出来ない", InflectionUtil.getConjugatedVerb("出来る", InflectionUtil.VerbType.ICHIDAN, "negative"));
    }
}
