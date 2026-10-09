package com.hashpaylink.pocket;

import android.graphics.Color;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = \u0022PocketInsets\u0022)
public class PocketInsetsPlugin extends Plugin {
    private Boolean requestedDarkIcons;
    private boolean requestedNavigationDarkIcons;
    private int requestedSurface;

    private void applySystemBarAppearance() {
        if (requestedDarkIcons == null) return;
        getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(requestedSurface));
        getActivity().getWindow().getDecorView().setBackgroundColor(requestedSurface);
        getBridge().getWebView().setBackgroundColor(requestedSurface);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getActivity().getWindow(), getActivity().getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(requestedDarkIcons);
        controller.setAppearanceLightNavigationBars(requestedNavigationDarkIcons);
    }

    // Android may reset system-bar contrast after application night-mode changes.
    // Reapply the current Pocket surface after configuration/resume callbacks finish.
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        getActivity().getWindow().getDecorView().post(this::applySystemBarAppearance);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        getActivity().getWindow().getDecorView().post(this::applySystemBarAppearance);
    }

    @PluginMethod
    public void setPocketTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getContext().getSharedPreferences("pocket-appearance", android.content.Context.MODE_PRIVATE).edit().putBoolean("dark", dark).apply();
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            getActivity().runOnUiThread(() -> {
                android.app.UiModeManager manager = (android.app.UiModeManager) getContext().getSystemService(android.content.Context.UI_MODE_SERVICE);
                manager.setApplicationNightMode(dark ? android.app.UiModeManager.MODE_NIGHT_YES : android.app.UiModeManager.MODE_NIGHT_NO);
                call.resolve();
            });
        } else { call.resolve(); }
    }

    @PluginMethod
    public void setSystemBarAppearance(PluginCall call) {
        boolean darkIcons = Boolean.TRUE.equals(call.getBoolean(\u0022darkIcons\u0022, true));
        boolean navigationDarkIcons = Boolean.TRUE.equals(call.getBoolean("navigationDarkIcons", darkIcons));
        String backgroundColor = call.getString("backgroundColor", darkIcons ? "#F5F5F7" : "#000000");
        getActivity().runOnUiThread(() -> {
            int surface;
            try { surface = Color.parseColor(backgroundColor); }
            catch (IllegalArgumentException ignored) { surface = darkIcons ? Color.rgb(245,245,247) : Color.BLACK; }
            requestedDarkIcons = darkIcons;
            requestedNavigationDarkIcons = navigationDarkIcons;
            requestedSurface = surface;
            applySystemBarAppearance();
            call.resolve();
        });
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            Insets status = windowInsets == null ? Insets.NONE : windowInsets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets navigation = windowInsets == null ? Insets.NONE : windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            float density = getActivity().getResources().getDisplayMetrics().density;
            JSObject result = new JSObject();
            result.put(\u0022top\u0022, Math.max(0, Math.round(status.top / density)));
            result.put(\u0022bottom\u0022, Math.max(0, Math.round(navigation.bottom / density)));
            result.put(\u0022topPx\u0022, Math.max(0, status.top));
            result.put(\u0022bottomPx\u0022, Math.max(0, navigation.bottom));
            result.put(\u0022density\u0022, density);
            call.resolve(result);
        });
    }
}
