package com.hashpaylink.pocket;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PocketEsim")
public class PocketEsimPlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        String code = call.getString("activationCode", "");
        if (code.length() > 2048 || !code.matches("^LPA:1\\$[^$\\s]+\\$[^$\\s]+(?:\\$[^\\s]*)?$")) {
            call.reject("Installation details are unavailable."); return;
        }
        // Hand off to Android's installer; never treat opening it as activation.
        Uri uri = new Uri.Builder().scheme("https").authority("esimsetup.android.com")
            .path("/esim_qrcode_provisioning").appendQueryParameter("carddata", code).build();
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (Exception ignored) { call.reject("Use the QR code or manual installation."); }
    }

    @PluginMethod
    public void settings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
            call.resolve();
        } catch (Exception ignored) { call.reject("Open mobile network settings on your phone."); }
    }
}
