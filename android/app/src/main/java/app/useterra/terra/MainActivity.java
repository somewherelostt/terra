package app.useterra.terra;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.WebViewListener;

/**
 * Terra's Android shell. On top of the stock Capacitor bridge it adds:
 * - wallet popups: near-connect opens web wallets with window.open and talks to them through
 *   window.opener, so popups open in an in-app WebView layer instead of the system browser;
 * - deep links: terra://open?dao=...#/join?role=... (and https App Links, when a host is set)
 *   load that query and hash in the app;
 * - the Android back button walks the app's hash history, then closes the app;
 * - the system bars follow the page's light or dark theme.
 */
public class MainActivity extends BridgeActivity {

    private static final int DARK_BG = 0xFF0B0B0C;
    private static final int LIGHT_BG = 0xFFFAFAFA;

    // Reports the page theme (data-theme on <html>) to the shell once per page and on every change.
    private static final String THEME_JS =
        "(function(){if(window.__terraTheme)return;window.__terraTheme=1;var r=document.documentElement;" +
        "function s(){try{TerraAndroid.theme(r.dataset.theme==='light'?'light':'dark')}catch(e){}}" +
        "new MutationObserver(s).observe(r,{attributes:true,attributeFilter:['data-theme']});s();})();";

    private FrameLayout popupLayer;
    private WebView popupView;
    private TextView popupTitle;
    private boolean lightTheme = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) return;

        WebView web = bridge.getWebView();
        web.getSettings().setSupportMultipleWindows(true);
        web.setWebChromeClient(
            new BridgeWebChromeClient(bridge) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    return openPopup(resultMsg);
                }

                @Override
                public void onCloseWindow(WebView window) {
                    closePopup();
                }
            }
        );
        web.addJavascriptInterface(new ThemeBridge(), "TerraAndroid");
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    webView.evaluateJavascript(THEME_JS, null);
                }
            }
        );
        applyTheme(false);

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (popupLayer != null) {
                            if (popupView != null && popupView.canGoBack()) popupView.goBack();
                            else closePopup();
                            return;
                        }
                        WebView w = bridge.getWebView();
                        if (w.canGoBack()) {
                            w.goBack();
                            return;
                        }
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                }
            );
    }

    // ---------- deep links ----------

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null || intent == null) return;
        setIntent(intent);
        Uri data = intent.getData();
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || data == null) return;
        String scheme = data.getScheme();
        boolean ours = "terra".equals(scheme) || ("https".equals(scheme) && (BuildConfig.TERRA_WEB_HOST.equals(data.getHost()) || "useterra.app".equals(data.getHost())));
        if (!ours) return;
        // Only the query (?dao=) and the hash (#/join?role=) are carried over; the app's own origin stays.
        String origin = bridge.getAppUrl().replaceAll("/+$", "");
        String query = data.getEncodedQuery();
        String fragment = data.getEncodedFragment();
        String target = origin + "/" + (query != null ? "?" + query : "") + (fragment != null ? "#" + fragment : "");
        closePopup();
        bridge.getWebView().loadUrl(target);
    }

    // ---------- wallet popups ----------

    private boolean openPopup(Message resultMsg) {
        closePopup();
        WebView pv = new WebView(this);
        WebSettings s = pv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(pv, true);
        pv.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri u = request.getUrl();
                    String scheme = u.getScheme();
                    if ("http".equals(scheme) || "https".equals(scheme)) return false;
                    openExternal(u);
                    return true;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    Uri u = Uri.parse(url);
                    if (popupTitle != null && u.getHost() != null) popupTitle.setText(u.getHost());
                }
            }
        );
        pv.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    closePopup();
                }
            }
        );

        int bg = lightTheme ? LIGHT_BG : DARK_BG;
        int fg = lightTheme ? 0xFF0B0B0C : 0xFFF5F5F4;
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(bg);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), 0, dp(4), 0);
        popupTitle = new TextView(this);
        popupTitle.setTextColor(fg);
        popupTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        popupTitle.setSingleLine(true);
        popupTitle.setText("Wallet");
        bar.addView(popupTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView close = new TextView(this);
        close.setText("Close");
        close.setTextColor(fg);
        close.setTypeface(Typeface.DEFAULT_BOLD);
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        close.setGravity(Gravity.CENTER);
        close.setPadding(dp(16), 0, dp(16), 0);
        close.setContentDescription("Close wallet");
        close.setOnClickListener(v -> closePopup());
        bar.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)));
        column.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        column.addView(pv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        FrameLayout layer = new FrameLayout(this);
        layer.setClickable(true);
        layer.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        addContentView(layer, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        popupLayer = layer;
        popupView = pv;

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(pv);
        resultMsg.sendToTarget();
        return true;
    }

    private void closePopup() {
        if (popupLayer == null) return;
        ViewGroup parent = (ViewGroup) popupLayer.getParent();
        if (parent != null) parent.removeView(popupLayer);
        if (popupView != null) {
            popupView.stopLoading();
            popupView.destroy();
        }
        popupLayer = null;
        popupView = null;
        popupTitle = null;
    }

    /** Wallet app links (intent:, tg:, near: ...) leave the app; everything else stays in the popup. */
    private void openExternal(Uri u) {
        try {
            Intent intent;
            if ("intent".equals(u.getScheme())) {
                intent = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, u);
            }
            startActivity(intent);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            // No app can open it; stay in the popup.
        }
    }

    // ---------- system bars ----------

    private void applyTheme(boolean light) {
        lightTheme = light;
        int bg = light ? LIGHT_BG : DARK_BG;
        getWindow().getDecorView().setBackgroundColor(bg);
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(light);
        c.setAppearanceLightNavigationBars(light);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private class ThemeBridge {

        @JavascriptInterface
        public void theme(String t) {
            final boolean light = "light".equals(t);
            runOnUiThread(() -> applyTheme(light));
        }
    }
}
