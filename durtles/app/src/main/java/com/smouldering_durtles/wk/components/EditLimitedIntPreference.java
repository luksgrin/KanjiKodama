
package com.smouldering_durtles.wk.components;

import com.smouldering_durtles.wk.R;

import android.content.Context;
import android.content.res.TypedArray;
import android.util.AttributeSet;
import android.widget.Toast;
import android.text.InputType;
import android.text.TextUtils;

import androidx.preference.EditTextPreference;

/**
 * An EditTextPreference that validates input such that only integers within a minimum and maximum value are used as input
 */
public final class EditLimitedIntPreference extends EditTextPreference {
    private int minValue;
    private int maxValue;

    public void setMinValue(int min) { minValue = min; }
    public int getMinValue() { return minValue; }

    public void setMaxValue(int max) { maxValue = max; }
    public int getMaxValue() { return maxValue; }


    /**
     * The constructor.
     *
     * @param context Android context
     * @param attrs attributes from XML
     */
    public EditLimitedIntPreference(final Context context, AttributeSet attrs) {
        super(context, attrs);
        init();

        TypedArray styledAttrs = context.obtainStyledAttributes(attrs, R.styleable.EditLimitedIntPreference, 0, 0);

        try {
            // Defaults set to minimum and maximum integer
            minValue = styledAttrs.getInteger(R.styleable.EditLimitedIntPreference_minValue, Integer.MIN_VALUE);
            maxValue = styledAttrs.getInteger(R.styleable.EditLimitedIntPreference_maxValue, Integer.MAX_VALUE);
        } finally {
            styledAttrs.recycle();
        }
    }

    private void init() {
        setSummaryProvider((SummaryProvider<EditLimitedIntPreference>) preference -> {
            return preference.getPersistedString("-");
        });
        setOnBindEditTextListener(inputText -> {
            inputText.setInputType(InputType.TYPE_CLASS_NUMBER);
        });
    }

    @Override
    protected boolean persistString(String value) {
        try {
            int intVal = Integer.parseInt(value);
            if (intVal >= minValue && intVal <= maxValue) {
                return super.persistString(value);
            } else {
                Toast.makeText(getContext(), "Please use a number between " + minValue + " and " + maxValue, Toast.LENGTH_LONG).show();
                return false;
            }
        } catch (NumberFormatException e) {
            Toast.makeText(getContext(), "Invalid Number", Toast.LENGTH_SHORT).show();
            return false;
        }
    }
}
