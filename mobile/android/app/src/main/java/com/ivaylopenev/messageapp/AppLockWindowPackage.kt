package com.ivaylopenev.messageapp

import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Android keeps a picture of the app as it leaves and shows it in Recents and
 * while the app reopens, which puts the chats on screen ahead of anything
 * JavaScript can draw. While App lock is on that picture is turned off. Unlike
 * FLAG_SECURE this leaves the person free to take screenshots. Android 13 and
 * up only: older versions have no equivalent short of FLAG_SECURE.
 */
class AppLockWindowModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "AppLockWindow"

  @ReactMethod
  fun setHiddenFromRecents(hidden: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { activity.setRecentsScreenshotEnabled(!hidden) }
  }
}

class AppLockWindowPackage : ReactPackage {

  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
      listOf(AppLockWindowModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
      emptyList()
}
