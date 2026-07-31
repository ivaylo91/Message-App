package com.ivaylopenev.messageapp

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Tapjacking protection: rejects touches that arrive while another
    // app's overlay is covering (fully or partially) this window - e.g. a
    // malicious SYSTEM_ALERT_WINDOW overlay tricking a tap on login/logout/
    // delete. React Native doesn't expose this as a JS prop on Touchables,
    // so it's set once here on the window's root view, which protects
    // every touch target app-wide (touch filtering propagates down the
    // view hierarchy from whichever view this flag is set on).
    window.decorView.filterTouchesWhenObscured = true
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MobileApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
