package com.bikerornot.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

// FCM delivery path depending on app state:
//   - App backgrounded + payload has `notification` field → Android OS draws
//     the notification itself. This method is NOT called. Tapping the
//     notification launches MainActivity with the `data` payload copied into
//     the intent extras — our onNewIntent handler deep-links to the chat.
//   - App foregrounded → Android skips the system UI and calls this method
//     instead, expecting us to decide whether to surface anything. By default
//     the user would just see the message appear silently in the chat (or
//     not at all if they're elsewhere in the app). Building a local
//     notification here so the user gets the same audible + visible cue
//     whether the app is open or not, and tapping it routes through the
//     same deep-link plumbing as background notifications.
//
// Capacitor's push-notifications plugin ships its own FirebaseMessagingService
// that forwards messages to the JS bridge — useless in remote mode where JS
// lives on bikerornot.com. We override it via AndroidManifest so this service
// is the one FCM hands messages to.
public class BikerOrNotMessagingService extends FirebaseMessagingService {
    private static final String TAG = "BikerOrNot";
    private static final String CHANNEL_ID = "bikerornot_messages";
    private static final String CHANNEL_NAME = "Messages";
    private static final String CHANNEL_DESC = "Direct messages, replies, and mentions";

    // System-wide unique ID counter so concurrent notifications don't
    // overwrite each other. Wraps on overflow which is harmless.
    private static final AtomicInteger notificationIdGen = new AtomicInteger(1);

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        RemoteMessage.Notification notif = remoteMessage.getNotification();
        String title = notif != null ? notif.getTitle() : null;
        String body = notif != null ? notif.getBody() : null;
        Map<String, String> data = remoteMessage.getData();

        // Some data-only messages put title/body inside the data payload.
        // Support both shapes.
        if (title == null && data != null) title = data.get("title");
        if (body == null && data != null) body = data.get("body");

        if (title == null && body == null) {
            Log.w(TAG, "FCM message with no title or body — ignoring");
            return;
        }

        showLocalNotification(title, body, data);
    }

    private void showLocalNotification(String title, String body, Map<String, String> data) {
        ensureChannelExists();

        // Build the tap intent with the same extras FCM would have set on a
        // system-drawn notification — that way MainActivity's onNewIntent
        // deep-link handler works the same whether the notification came
        // from here or from the Android system UI.
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }

        int requestCode = notificationIdGen.incrementAndGet();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(0xFFF97316) // orange-500 to tint the monochrome icon on recent Androids
            .setContentTitle(title != null ? title : "BikerOrNot")
            .setContentText(body != null ? body : "")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(requestCode, builder.build());
        }
    }

    private void ensureChannelExists() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(CHANNEL_DESC);
        channel.enableVibration(true);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onNewToken(String token) {
        // Token rotations get picked up on the next MainActivity.onCreate
        // where we read getToken() and POST to /api/device-tokens. That
        // happens often enough (every cold/warm launch) that adding a
        // dedicated POST here with cookie-copying logic isn't worth the
        // duplication. Just log so we know when rotations happen.
        Log.d(TAG, "FCM token refreshed; will re-register on next app launch");
    }
}
