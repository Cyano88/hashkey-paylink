package com.hashpaylink.pocket;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = \u0022PocketInsets\u0022)
public class PocketInsetsPlugin extends Plugin {
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
