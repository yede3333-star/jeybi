package com.yede.jeybi;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * "Save to Downloads": writes a file (base64 from the web side) into the phone's Download/Jeybi folder.
 * Android 10+ uses MediaStore (no permission needed); older versions write the file directly and
 * ask for the storage permission once.
 */
@CapacitorPlugin(
    name = "JeybiDownloads",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class DownloadsPlugin extends Plugin {

    private static final String FOLDER = "Jeybi";

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            doSave(call);
        } else {
            call.reject("Storage permission denied", "PERMISSION_DENIED");
        }
    }

    private void doSave(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");
        if (filename == null || data == null) {
            call.reject("filename and data are required");
            return;
        }
        getBridge().execute(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                String name = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? saveMediaStore(filename, mime, bytes) : saveLegacy(filename, mime, bytes);
                JSObject ret = new JSObject();
                ret.put("path", Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER + "/" + name);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Save failed", e);
            }
        });
    }

    /** Returns the final file name (Android adds " (1)" when the name is already taken). */
    private String saveMediaStore(String filename, String mime, byte[] bytes) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Could not create the file in Downloads");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Could not open the file in Downloads");
            out.write(bytes);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        String name = filename;
        try (Cursor c = resolver.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        }
        return name;
    }

    private String saveLegacy(String filename, String mime, byte[] bytes) throws IOException {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create " + dir);
        File file = new File(dir, filename);
        int dot = filename.lastIndexOf('.');
        String base = dot > 0 ? filename.substring(0, dot) : filename;
        String ext = dot > 0 ? filename.substring(dot) : "";
        for (int i = 1; file.exists(); i++) file = new File(dir, base + " (" + i + ")" + ext);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
        return file.getName();
    }
}
