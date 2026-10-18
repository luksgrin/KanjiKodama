/*
 * Copyright 2019-2020 Ernst Jan Plugge <rmc@dds.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.smouldering_durtles.wk.model;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.NumberDeserializers;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import com.smouldering_durtles.wk.enums.SearchSortOrder;
import com.smouldering_durtles.wk.enums.SubjectType;

import java.io.IOException;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashSet;

import javax.annotation.Nullable;

/**
 * Presets for the advanced search form.
 *
 * <p>
 *     KanjiKodama: an explicit JSON null for the sort order or a collection (from a preset or an import) keeps the
 *     default instead of storing null, which made the search throw (and come back empty) or the results screen fail.
 * </p>
 *
 * <p>
 *     KanjiKodama: a whole number outside the int range in a number field or an int collection is clamped to
 *     Integer.MIN_VALUE or Integer.MAX_VALUE, like the form does (AdvancedSearchFormView.parseNumber). It used to fail
 *     the whole parse, so the preset found nothing. Anything else (decimals, strings) is read as before.
 * </p>
 */
public final class AdvancedSearchParameters {
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer minLevel = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer maxLevel = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer minFrequency = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer maxFrequency = null;
    public boolean leechesOnly = false;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer upcomingReviewLessThan = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer upcomingReviewMoreThan = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer incorrectAnswerWithin = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer burnedLessThan = null;
    @JsonDeserialize(using = ClampedInteger.class)
    public @Nullable Integer burnedMoreThan = null;
    @JsonSetter(nulls = Nulls.SKIP)
    public SearchSortOrder sortOrder = SearchSortOrder.TYPE;
    @JsonSetter(nulls = Nulls.SKIP)
    @JsonDeserialize(contentUsing = ClampedInteger.class)
    public final Collection<Integer> starRatings = new HashSet<>();
    @JsonSetter(nulls = Nulls.SKIP)
    public final Collection<String> srsStages = new HashSet<>();
    @JsonSetter(nulls = Nulls.SKIP)
    public final Collection<SubjectType> itemTypes = EnumSet.noneOf(SubjectType.class);
    @JsonSetter(nulls = Nulls.SKIP)
    @JsonDeserialize(contentUsing = ClampedInteger.class)
    public final Collection<Integer> jlptLevels = new HashSet<>();
    @JsonSetter(nulls = Nulls.SKIP)
    @JsonDeserialize(contentUsing = ClampedInteger.class)
    public final Collection<Integer> joyoGrades = new HashSet<>();

    /**
     * KanjiKodama: Jackson's Integer deserializer, except that a whole number outside the int range is clamped
     * instead of failing.
     */
    public static final class ClampedInteger extends StdDeserializer<Integer> {
        private static final long serialVersionUID = 1L;
        private static final JsonDeserializer<?> DEFAULT = NumberDeserializers.find(Integer.class, Integer.class.getName());

        /**
         * The constructor.
         */
        public ClampedInteger() {
            super(Integer.class);
        }

        @Override
        public Integer deserialize(final JsonParser p, final DeserializationContext ctxt) throws IOException {
            if (p.hasToken(JsonToken.VALUE_NUMBER_INT) && p.getNumberType() != JsonParser.NumberType.INT) {
                return p.getBigIntegerValue().signum() < 0 ? Integer.MIN_VALUE : Integer.MAX_VALUE;
            }
            return (Integer) DEFAULT.deserialize(p, ctxt);
        }
    }
}
