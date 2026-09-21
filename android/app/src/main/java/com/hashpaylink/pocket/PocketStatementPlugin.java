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
