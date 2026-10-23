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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PocketStatement")
public class PocketStatementPlugin extends Plugin {
    @PluginMethod
    public void saveQr(PluginCall call) {
        String encoded = call.getString("base64", "");
        try {
            if (encoded.length() > 4_000_000) throw new IllegalArgumentException();
            byte[] png = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            if (png.length < 8 || png[0] != (byte) 137 || png[1] != 80 || png[2] != 78 || png[3] != 71) throw new IllegalArgumentException();
        } catch (Exception error) { call.reject("QR could not be prepared."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/png");
        intent.putExtra(Intent.EXTRA_TITLE, "pocket-pos-qr.png");
        startActivityForResult(call, intent, "qrSaved");
    }

    @ActivityCallback
    private void qrSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) { call.reject("QR could not be saved."); return; }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) throw new java.io.IOException();
            stream.write(android.util.Base64.decode(call.getString("base64", ""), android.util.Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) { call.reject("QR could not be saved."); }
    }

    @PluginMethod
    public void saveCsv(PluginCall call) {
        String name = call.getString("name", "pocket-statement.csv");
        String content = call.getString("content");
        if (content == null || content.length() > 10_000_000 || !name.matches("pocket-statement(?:-[0-9-]+)?\\.csv")) {
            call.reject("Statement could not be prepared.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/csv");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "statementSaved");
    }

    @ActivityCallback
    private void statementSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        String content = call.getString("content");
        if (uri == null || content == null) {
            call.reject("Statement could not be saved.");
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) throw new java.io.IOException();
            stream.write(content.getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception ignored) {
            call.reject("Statement could not be saved.");
        }
    }
}
