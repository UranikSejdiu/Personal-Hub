package com.uranik.reminders

import android.app.TimePickerDialog
import android.text.format.DateFormat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import android.app.AlarmManager
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReminderAccessModule : Module() {
  private var picker: TimePickerDialog? = null

  override fun definition() = ModuleDefinition {
    Name("ReminderAccess")

    Function("uses24HourClock") {
      DateFormat.is24HourFormat(requireNotNull(appContext.reactContext))
    }

    AsyncFunction("pickTime") { hour: Int, minute: Int, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || activity.isFinishing || picker != null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      var selected: String? = null
      val dialog = TimePickerDialog(activity, { _, h, m ->
        selected = "%02d:%02d".format(java.util.Locale.ROOT, h, m)
      }, hour, minute, DateFormat.is24HourFormat(activity))
      dialog.setOnDismissListener {
        picker = null
        promise.resolve(selected)
      }
      dialog.show()
      picker = dialog
    }.runOnQueue(Queues.MAIN)

    OnActivityDestroys { picker?.dismiss() }

    Function("getStatus") {
      val context = requireNotNull(appContext.reactContext)
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val backgroundRestricted = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
        context.getSystemService(ActivityManager::class.java)?.isBackgroundRestricted == true
      mapOf(
        "exactAlarms" to (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()),
        "batteryUnrestricted" to power.isIgnoringBatteryOptimizations(context.packageName),
        "backgroundRestricted" to backgroundRestricted
      )
    }
  }
}
