package com.bikerornot.app;

import android.os.Bundle;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final long DOUBLE_PRESS_WINDOW_MS = 2000L;
    private long lastBackPressMs = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor 8 wires back-button handling through the dispatcher rather
        // than the legacy onBackPressed override. Registering here (after
        // super.onCreate) gives this callback priority over BridgeActivity's
        // default, which would otherwise exit the app when WebView history is
        // empty. Paired with android:enableOnBackInvokedCallback="true" in
        // AndroidManifest to keep predictive back on API 34+ routed through
        // the dispatcher instead of bypassing it.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBack();
            }
        });
    }

    // Fallback for any code path that still calls through to the legacy
    // back-press method (older OEM skins, edge cases around predictive back
    // opt-in). Safe to keep alongside the dispatcher callback — only one
    // fires per press.
    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (bridge != null && bridge.getWebView() != null
                && bridge.getWebView().canGoBack()) {
            bridge.getWebView().goBack();
            return;
        }

        long now = System.currentTimeMillis();
        if (now - lastBackPressMs < DOUBLE_PRESS_WINDOW_MS) {
            finish();
            return;
        }
        lastBackPressMs = now;
        Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show();
    }
}
