package com.uranik.reminders

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReminderAccessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReminderAccess")

    Function("getStatus") {
      val context = requireNotNull(appContext.reactContext)
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      mapOf(
        "exactAlarms" to (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()),
        "batteryUnrestricted" to power.isIgnoringBatteryOptimizations(context.packageName)
      )
    }
  }
}
