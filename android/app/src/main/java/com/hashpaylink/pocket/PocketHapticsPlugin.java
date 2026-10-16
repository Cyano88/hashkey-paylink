package com.hashpaylink.pocket;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** A single quiet success pulse shared by Pocket's transaction surfaces. */
@CapacitorPlugin(name = "PocketHaptics")
public class PocketHapticsPlugin extends Plugin {
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void success(PluginCall call) {
        if (Settings.System.getInt(getContext().getContentResolver(), Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0) {
            call.resolve();
            return;
        }
        Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                vibrator.vibrate(VibrationEffect.createOneShot(20, 60), attributes);
            } else {
                vibrator.vibrate(20);
            }
        }
        call.resolve();
    }
}
