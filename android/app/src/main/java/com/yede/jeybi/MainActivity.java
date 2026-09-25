package com.yede.jeybi;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin must be registered before the bridge starts.
        registerPlugin(DownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
