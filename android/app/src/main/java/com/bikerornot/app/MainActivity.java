package com.bikerornot.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import com.google.firebase.messaging.FirebaseMessaging;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "BikerOrNot";
    private static final long DOUBLE_PRESS_WINDOW_MS = 2000L;
    private static final int POST_NOTIFICATIONS_REQUEST_CODE = 1001;
    private static final String DEVICE_TOKEN_ENDPOINT = "https://www.bikerornot.com/api/device-tokens";

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

        setupExternalLinkHandling();
        requestNotificationPermissionIfNeeded();
        registerFcmToken();
    }

    // Android 13+ (API 33) requires runtime permission to post notifications.
    // Older versions grant it implicitly. We ask on every launch until granted —
    // after the first user response the system caches and silently returns.
    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                POST_NOTIFICATIONS_REQUEST_CODE
        );
    }

    // Fetch the FCM token and POST it to bikerornot.com/api/device-tokens using
    // the WebView's session cookies — no JS shim needed, no coupling between
    // web code and the native shell. First-launch attempts before login will
    // 401 silently; the next app start after login retries and succeeds.
    // Tokens are stable per install, so one successful registration is enough.
    private void registerFcmToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Log.w(TAG, "FCM token fetch failed", task.getException());
                return;
            }
            String token = task.getResult();
            if (token == null || token.isEmpty()) return;
            postDeviceToken(token);
        });
    }

    // Fire-and-forget POST to the device-tokens endpoint. Runs on a background
    // thread because HttpURLConnection blocks, and uses CookieManager to read
    // the WebView's session cookies so the server recognises the logged-in user.
    private void postDeviceToken(String token) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(DEVICE_TOKEN_ENDPOINT);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("User-Agent", "BikerOrNotAndroid");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                String cookies = CookieManager.getInstance().getCookie("https://www.bikerornot.com");
                if (cookies != null && !cookies.isEmpty()) {
                    conn.setRequestProperty("Cookie", cookies);
                }

                conn.setDoOutput(true);
                // Token is an FCM registration string (base64ish, no quotes); still
                // JSON-escape it defensively in case FCM ever changes the format.
                String body = "{\"token\":\"" + token.replace("\\", "\\\\").replace("\"", "\\\"")
                        + "\",\"platform\":\"android\"}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }

                int code = conn.getResponseCode();
                if (code == 200) {
                    Log.i(TAG, "Device token registered");
                } else if (code == 401) {
                    // User isn't logged in yet — nothing to report; next launch
                    // after sign-in will pick it up.
                } else {
                    Log.w(TAG, "Device token registration HTTP " + code);
                }
            } catch (Exception e) {
                Log.w(TAG, "Device token registration failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "FcmTokenRegister").start();
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

    // External links (anything outside bikerornot.com / Supabase) open in a
    // Chrome Custom Tab rather than the full Chrome app, so users stay "in"
    // BikerOrNot — one tap dismisses the tab and returns to the feed.
    //
    // Two hooks needed:
    //   1. shouldOverrideUrlLoading handles plain anchor clicks.
    //   2. onCreateWindow handles target="_blank" and window.open(); Capacitor
    //      doesn't override this, so without it those links silently do
    //      nothing in the WebView.
    private void setupExternalLinkHandling() {
        if (bridge == null || bridge.getWebView() == null) return;
        WebView webView = bridge.getWebView();

        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);

        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isInternalUrl(url)) {
                    return super.shouldOverrideUrlLoading(view, request);
                }
                openInCustomTab(url);
                return true;
            }
        });

        webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                // The OS hasn't told us the target URL yet — it passes that
                // through a transient WebView whose first navigation attempt
                // surfaces the href. Intercept, capture, and send to Custom Tab.
                WebView sink = new WebView(view.getContext());
                sink.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        openInCustomTab(req.getUrl());
                        v.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(sink);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    // Hosts the WebView should load internally. Mirrors the allowNavigation
    // list in capacitor.config.ts — kept here in Java because the WebView
    // callback fires before the Bridge has a chance to consult its own config
    // through the path we want (launchIntent opens a plain ACTION_VIEW Intent,
    // not a Custom Tab).
    private boolean isInternalUrl(Uri url) {
        String scheme = url.getScheme();
        if ("data".equals(scheme) || "blob".equals(scheme) || "javascript".equals(scheme)) {
            return true;
        }
        // Non-http schemes (tel:, mailto:, sms:, intent:) should be handled by
        // the system as-is, not forced into a browser tab.
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) {
            return false;
        }
        String host = url.getHost();
        if (host == null) return true;
        return host.equals("bikerornot.com")
                || host.endsWith(".bikerornot.com")
                || host.endsWith(".supabase.co")
                || host.endsWith(".supabase.in");
    }

    private void openInCustomTab(Uri url) {
        String scheme = url.getScheme();
        if (scheme != null && !scheme.equals("http") && !scheme.equals("https")) {
            // tel:, mailto:, sms:, intent:, market: — hand to the system so
            // the right app (dialer, mail client, Play Store) takes over.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException e) {
                // no handler installed — nothing we can do, fail silently
            }
            return;
        }

        CustomTabColorSchemeParams colorParams = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(Color.parseColor("#09090b"))
                .setNavigationBarColor(Color.parseColor("#09090b"))
                .build();

        CustomTabsIntent intent = new CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(colorParams)
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                .setShowTitle(true)
                .setUrlBarHidingEnabled(true)
                .build();

        // Bind the intent to a browser package so URL-intercepting apps (the
        // Facebook/Instagram/YouTube apps all register as handlers for their
        // own domains via Android App Links) can't steal the tap and pull
        // the user out of BikerOrNot. Order of preference:
        //   1. CustomTabsClient.getPackageName — the user's default browser
        //      if it supports Custom Tabs. Returns null on Android 11+ if the
        //      <queries> entry in AndroidManifest is missing.
        //   2. Chrome stable/beta/dev by package name, checked with the
        //      PackageManager so we only pin a package that's actually
        //      installed (setPackage on a missing package = ActivityNotFound).
        //   3. Unfiltered launch — the one path where URL-grabbing apps can
        //      still win. Rare: it means no browser with Custom Tabs support
        //      is installed, and nothing we do will avoid an app intercept.
        String browserPackage = CustomTabsClient.getPackageName(this, null);
        if (browserPackage == null) {
            String[] chromePackages = {
                    "com.android.chrome",
                    "com.chrome.beta",
                    "com.chrome.dev",
                    "com.chrome.canary",
            };
            for (String pkg : chromePackages) {
                try {
                    getPackageManager().getPackageInfo(pkg, 0);
                    browserPackage = pkg;
                    break;
                } catch (PackageManager.NameNotFoundException ignored) {}
            }
        }
        if (browserPackage != null) {
            intent.intent.setPackage(browserPackage);
        }

        try {
            intent.launchUrl(this, url);
        } catch (ActivityNotFoundException e) {
            // Chrome and all Custom-Tabs-capable browsers are missing; fall back
            // to a plain Intent.ACTION_VIEW so something still opens.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignored) {}
        }
    }
}
