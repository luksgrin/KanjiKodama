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

package com.smouldering_durtles.wk.adapter.search;

import android.app.Activity;
import android.view.View;

import com.smouldering_durtles.wk.R;
import com.smouldering_durtles.wk.activities.BrowseActivity;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.fragments.AbstractFragment;
import com.smouldering_durtles.wk.fragments.SearchResultFragment;
import com.smouldering_durtles.wk.model.AdvancedSearchParameters;
import com.smouldering_durtles.wk.proxy.ViewProxy;
import com.smouldering_durtles.wk.util.WeakLcoRef;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.util.ObjectSupport.safe;

/**
 * View holder class for the search form.
 */
public final class SearchFormItemViewHolder extends ResultItemViewHolder {
    private final ViewProxy form = new ViewProxy();

    private final WeakLcoRef<SearchResultFragment> fragmentRef;

    /**
     * The view for this holder, inflated but not yet bound.
     *
     * @param adapter the adapter this holder was created for
     * @param view the view
     * @param parameters the search parameters for the form
     * @param fragment the fragment this view belongs to
     */
    public SearchFormItemViewHolder(final SearchResultAdapter adapter, final View view, final AdvancedSearchParameters parameters,
                                    final SearchResultFragment fragment) {
        super(adapter, view);
        fragmentRef = new WeakLcoRef<>(fragment);
        form.setDelegate(view, R.id.form);

        final View.OnClickListener listener = v -> safe(() -> {
            final @Nullable AbstractFragment theFragment = fragmentRef.getOrElse(null);
            if (theFragment == null) {
                return;
            }
            final @Nullable Activity activity = theFragment.getActivity();
            if (activity instanceof BrowseActivity) {
                ((BrowseActivity) activity).loadSearchResultFragment(fragmentRef.get().getPresetName(), 2,
                        Converters.getObjectMapper().writeValueAsString(form.extractParameters()));
            }
        });

        new ViewProxy(view, R.id.searchButton1).setOnClickListener(listener);
        new ViewProxy(view, R.id.searchButton2).setOnClickListener(listener);

        form.injectParameters(parameters);
    }

    @Override
    public void bind(final ResultItem newItem) {
        //
    }
}
