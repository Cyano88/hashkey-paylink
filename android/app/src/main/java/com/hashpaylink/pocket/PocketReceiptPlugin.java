package com.hashpaylink.pocket;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "PocketReceipt")
public class PocketReceiptPlugin extends Plugin {
    private boolean presenting = false;

    @PluginMethod
    public void share(PluginCall call) {
        if (presenting) { call.reject("A receipt is already being shared."); return; }
        String name = call.getString("name", "");
        String mime = call.getString("mimeType", "");
        String content = call.getString("base64", "");
        boolean jpeg = "image/jpeg".equals(mime) && name.endsWith(".jpg");
        boolean pdf = "application/pdf".equals(mime) && name.endsWith(".pdf");
        if ((!jpeg && !pdf) || !name.matches("[A-Za-z0-9._-]{1,180}") || content.isEmpty() || content.length() > 12_000_000) {
            call.reject("Receipt could not be prepared."); return;
        }
        try {
            byte[] bytes = Base64.decode(content, Base64.DEFAULT);
            boolean validJpeg = bytes.length > 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
            boolean validPdf = bytes.length > 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F';
            if ((jpeg && !validJpeg) || (pdf && !validPdf)) { call.reject("Receipt file is invalid."); return; }
            File directory = new File(getContext().getCacheDir(), "pocket-receipts");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException();
            File[] oldFiles = directory.listFiles();
            if (oldFiles != null) for (File old : oldFiles) {
                if (old.isFile() && old.getName().startsWith("receipt-") && System.currentTimeMillis() - old.lastModified() > 86_400_000L) old.delete();
            }
            File file = new File(directory, "receipt-" + UUID.randomUUID() + (jpeg ? ".jpg" : ".pdf"));
            try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file, name);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.putExtra(Intent.EXTRA_TITLE, name);
            intent.setClipData(ClipData.newRawUri(name, uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            presenting = true;
            startActivityForResult(call, Intent.createChooser(intent, "Share receipt"), "receiptShared");
        } catch (Exception ignored) {
            presenting = false;
            call.reject("Receipt could not be shared. Please try again.");
        }
    }

    @ActivityCallback
    private void receiptShared(PluginCall call, ActivityResult result) {
        presenting = false;
        // Dismissing the chooser is not a failed receipt and does not prove delivery.
        if (call != null) call.resolve(new JSObject());
    }
}
