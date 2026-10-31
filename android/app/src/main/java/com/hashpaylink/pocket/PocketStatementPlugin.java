package com.hashpaylink.pocket;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@CapacitorPlugin(name = "PocketStatement")
public class PocketStatementPlugin extends Plugin {
    private File directory() { return new File(getContext().getCacheDir(), "pocket-exports"); }

    @Override public void load() {
        File[] files = directory().listFiles();
        if (files != null) for (File file : files) {
            if (file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
        }
    }

    // Capacitor saves call options twice when the picker backgrounds this Activity.
    // Store bytes privately first; only the small file reference may enter saved state.
    private void chooseDestination(PluginCall call, byte[] bytes, String name, String mime) throws Exception {
        File dir = directory();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException();
        File file = new File(dir, UUID.randomUUID().toString() + ".tmp");
        try {
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
            call.getData().remove("base64");
            call.getData().remove("content");
            call.getData().put("exportFile", file.getName());
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(call, intent, "documentSaved");
        } catch (Exception error) { file.delete(); throw error; }
    }

    @PluginMethod public void savePdf(PluginCall call) {
        try {
            String encoded = call.getString("base64", "");
            String name = call.getString("name", "pocket-statement.pdf");
            if (encoded.length() > 20_000_000 || !name.matches("pocket-statement(?:-[a-z0-9-]+)?\\.pdf")) throw new IllegalArgumentException();
            byte[] pdf = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            if (pdf.length < 5 || pdf[0] != 37 || pdf[1] != 80 || pdf[2] != 68 || pdf[3] != 70 || pdf[4] != 45) throw new IllegalArgumentException();
            chooseDestination(call, pdf, name, "application/pdf");
        } catch (Exception error) { call.reject("Statement could not be prepared."); }
    }

    @PluginMethod public void saveCsv(PluginCall call) {
        try {
            String content = call.getString("content");
            String name = call.getString("name", "pocket-statement.csv");
            if (content == null || content.length() > 10_000_000 || !name.matches("pocket-statement(?:-[a-z0-9-]+)?\\.csv")) throw new IllegalArgumentException();
            chooseDestination(call, content.getBytes(StandardCharsets.UTF_8), name, "text/csv");
        } catch (Exception error) { call.reject("Statement could not be prepared."); }
    }

    @PluginMethod public void saveQr(PluginCall call) {
        try {
            String encoded = call.getString("base64", "");
            if (encoded.length() > 4_000_000) throw new IllegalArgumentException();
            byte[] png = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            if (png.length < 8 || png[0] != (byte)137 || png[1] != 80 || png[2] != 78 || png[3] != 71) throw new IllegalArgumentException();
            chooseDestination(call, png, "pocket-pos-qr.png", "image/png");
        } catch (Exception error) { call.reject("QR could not be prepared."); }
    }

    @ActivityCallback private void documentSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String filename = call.getString("exportFile", "");
        if (!filename.matches("[a-f0-9-]{36}\\.tmp")) { call.reject("Download could not be restored. Try again."); return; }
        File file = new File(directory(), filename);
        if (result.getResultCode() != Activity.RESULT_OK) {
            file.delete();
            JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) { file.delete(); call.reject("Download could not be saved."); return; }
        getBridge().execute(() -> {
            try (FileInputStream input = new FileInputStream(file);
                 OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new java.io.IOException();
                byte[] buffer = new byte[16384]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                output.flush();
                call.resolve();
            } catch (Exception error) { call.reject("Download could not be saved. Try again."); }
            finally { file.delete(); }
        });
    }
}
