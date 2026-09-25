package com.yede.jeybi;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Privacy mode: while amounts are hidden (and the user chose it), FLAG_SECURE keeps the app out of
 * the recent-apps preview (shown blank). Screenshots are also blocked while it is on.
 */
@CapacitorPlugin(name = "JeybiPrivacy")
public class PrivacyPlugin extends Plugin {

    @PluginMethod
    public void setSecure(PluginCall call) {
        boolean secure = Boolean.TRUE.equals(call.getBoolean("secure", false));
        getActivity().runOnUiThread(() -> {
            if (secure) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }
}
