package com.hashpaylink.pocket;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private volatile boolean keepLaunchSplash = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen launchSplash = SplashScreen.installSplashScreen(this);
        launchSplash.setKeepOnScreenCondition(() -> keepLaunchSplash);
        registerPlugin(PocketInsetsPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new PocketLaunchBridge(), "PocketLaunch");
        getBridge().getWebView().postDelayed(() -> keepLaunchSplash = false, 15_000);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
    }

    private final class PocketLaunchBridge {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> keepLaunchSplash = false);
        }
    }
}
