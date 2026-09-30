package com.hashpaylink.pocket;

import android.os.Bundle;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.webkit.JavascriptInterface;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private volatile boolean keepLaunchSplash = true;

    @Override
    protected void attachBaseContext(Context base) {
        android.content.SharedPreferences prefs = base.getSharedPreferences("pocket-appearance", MODE_PRIVATE);
        if (prefs.contains("dark")) {
            Configuration config = new Configuration(base.getResources().getConfiguration());
            config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (prefs.getBoolean("dark", false) ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
            base = base.createConfigurationContext(config);
        }
        super.attachBaseContext(base);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen launchSplash = SplashScreen.installSplashScreen(this);
        launchSplash.setKeepOnScreenCondition(() -> keepLaunchSplash);
        registerPlugin(PocketInsetsPlugin.class);
        registerPlugin(PocketStatementPlugin.class);
        registerPlugin(PocketReceiptPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new PocketLaunchBridge(), "PocketLaunch");
        getBridge().getWebView().postDelayed(() -> keepLaunchSplash = false, 15_000);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        boolean lightBars = getResources().getBoolean(R.bool.pocket_light_system_bars);
        controller.setAppearanceLightStatusBars(lightBars);
        controller.setAppearanceLightNavigationBars(lightBars);
        int surface = androidx.core.content.ContextCompat.getColor(this, R.color.pocket_launch_background);
        getWindow().setBackgroundDrawable(new ColorDrawable(surface));
        getBridge().getWebView().setBackgroundColor(surface);
    }

    private final class PocketLaunchBridge {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> keepLaunchSplash = false);
        }
    }
}
