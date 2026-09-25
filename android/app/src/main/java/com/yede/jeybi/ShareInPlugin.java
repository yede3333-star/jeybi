package com.yede.jeybi;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * "Share to Jeybi": text shared from WhatsApp or any app (ACTION_SEND, text/plain) opens the app
 * on "اكتب يومك" with that text. The web side asks for it with getPending() at start-up and when
 * the "sharedText" event says a new one arrived while the app was running.
 */
@CapacitorPlugin(name = "JeybiShareIn")
public class ShareInPlugin extends Plugin {

    private String pending;

    @Override
    public void load() {
        take(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (take(intent)) notifyListeners("sharedText", new JSObject(), true);
    }

    private boolean take(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return false;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.length() == 0) return false;
        pending = text.toString();
        // Consumed: a configuration change (rotation, dark mode) must not deliver it again.
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.setAction(Intent.ACTION_MAIN);
        return true;
    }

    /** The shared text not yet taken (null if none); taking it clears it. */
    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", pending);
        pending = null;
        call.resolve(ret);
    }
}
