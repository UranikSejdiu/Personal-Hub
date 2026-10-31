package com.uranik.reminders

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.notifications.service.NotificationsService

// Restore persisted native alarms immediately after access is granted, even if
// the user does not return to the app. Expo handles reboot and APK replacement.
class AlarmPermissionReceiver : NotificationsService() {
  override fun handleIntent(context: Context, intent: Intent) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      intent.action == AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED &&
      alarms.canScheduleExactAlarms()) {
      onSetupScheduledNotifications(context, intent)
    }
  }
}
