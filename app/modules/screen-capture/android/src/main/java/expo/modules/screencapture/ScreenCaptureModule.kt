package expo.modules.screencapture

import android.app.Activity
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.graphics.Bitmap
import android.media.Image
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Base64
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

private const val TAG = "ScreenCapture"
private const val JPEG_QUALITY = 45

class ScreenCaptureModule : Module() {

  companion object {
    // 授权弹窗结果回调（由 CaptureHelperActivity 触发）
    var consentCallback: ((Int, Intent?) -> Unit)? = null
  }

  override fun definition() = ModuleDefinition {
    Name("ScreenCapture")

    // 发起系统屏幕录制授权弹窗；用户允许后启动前台捕获服务
    AsyncFunction("startCapture") { promise: Promise ->
      if (ScreenCaptureService.isRunning()) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "没有可用的界面，请在 App 内重试", null)
        return@AsyncFunction
      }
      consentCallback = { code, data ->
        handleConsent(code, data, promise)
      }
      val intent = Intent(activity, CaptureHelperActivity::class.java)
      try {
        activity.startActivity(intent)
      } catch (e: Exception) {
        consentCallback = null
        promise.reject("ERR_LAUNCH", "无法启动屏幕授权页面: ${e.message}", e)
      }
    }

    // 停止屏幕捕获
    Function("stopCapture") {
      ScreenCaptureService.stopNow()
      Unit
    }

    // 是否正在捕获
    Function("isCapturing") {
      ScreenCaptureService.isRunning()
    }

    // 取最新一帧 -> JPEG base64
    AsyncFunction("captureFrame") { promise: Promise ->
      val b64 = FrameProvider.withLatest { img ->
        if (img == null) {
          null
        } else {
          try {
            Base64.encodeToString(imageToJpegBytes(img, JPEG_QUALITY), Base64.NO_WRAP)
          } catch (e: Exception) {
            Log.w(TAG, "captureFrame failed", e)
            null
          }
        }
      }
      promise.resolve(b64)
    }

    // 是否已开启“使用情况访问权限”
    Function("hasUsageAccess") {
      val context = appContext.reactContext
      if (context == null) {
        false
      } else {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
        if (ops == null) {
          false
        } else {
          val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(
              AppOpsManager.OPSTR_GET_USAGE_STATS,
              Process.myUid(),
              context.packageName
            )
          } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(
              AppOpsManager.OPSTR_GET_USAGE_STATS,
              Process.myUid(),
              context.packageName
            )
          }
          mode == AppOpsManager.MODE_ALLOWED
        }
      }
    }

    // 跳转系统“使用情况访问权限”设置页
    Function("openUsageAccessSettings") {
      val activity = appContext.currentActivity
      val context = appContext.reactContext
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context?.startActivity(intent)
      }
      Unit
    }

    // 读取当前前台应用
    AsyncFunction("getForegroundApp") { promise: Promise ->
      promise.resolve(queryForegroundApp())
    }
  }

  private fun handleConsent(code: Int, data: Intent?, promise: Promise) {
    val context = appContext.reactContext
    if (context == null) {
      promise.reject("ERR_NO_CONTEXT", "应用上下文不可用", null)
      return
    }
    if (code != Activity.RESULT_OK || data == null) {
      promise.reject("ERR_DENIED", "用户未授权屏幕录制", null)
      return
    }
    val intent = Intent(context, ScreenCaptureService::class.java).apply {
      putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, code)
      putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERR_START", "启动屏幕捕获服务失败: ${e.message}", e)
    }
  }

  private fun queryForegroundApp(): Map<String, String>? {
    val context = appContext.reactContext ?: return null
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return null
    val now = System.currentTimeMillis()

    // 1) 优先从最近 60s 事件里找最后一个“进入前台”的应用
    var pkg: String? = null
    try {
      val events = usm.queryEvents(now - 60_000L, now)
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        // ACTIVITY_RESUMED 即进入前台（值为1，编译期内联，低版本安全）
        if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
          pkg = event.packageName
        }
      }
    } catch (e: Exception) {
      return null
    }

    // 2) 事件窗口内没有则退回“今天最后使用的应用”
    if (pkg == null) {
      try {
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 86_400_000L, now)
        var best = 0L
        for (s in stats) {
          if (s.lastTimeUsed > best) {
            best = s.lastTimeUsed
            pkg = s.packageName
          }
        }
      } catch (e: Exception) {
        return null
      }
    }

    val p = pkg ?: return null
    val pm = context.packageManager
    return try {
      @Suppress("DEPRECATION")
      val ai = pm.getApplicationInfo(p, 0)
      val label = pm.getApplicationLabel(ai)?.toString() ?: p
      mapOf("packageName" to p, "appName" to label)
    } catch (e: Exception) {
      mapOf("packageName" to p, "appName" to p)
    }
  }

  /** RGBA_8888 Image -> JPEG bytes */
  private fun imageToJpegBytes(image: Image, quality: Int): ByteArray {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val width = image.width
    val height = image.height

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    try {
      if (pixelStride == 4 && rowStride == width * 4) {
        buffer.rewind()
        bitmap.copyPixelsFromBuffer(buffer)
      } else {
        val rowBytes = width * 4
        val row = ByteArray(rowBytes)
        val packed = ByteBuffer.allocate(rowBytes * height)
        for (y in 0 until height) {
          buffer.position(y * rowStride)
          buffer.get(row, 0, rowBytes)
          packed.put(row)
        }
        packed.rewind()
        bitmap.copyPixelsFromBuffer(packed)
      }
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
      return out.toByteArray()
    } finally {
      bitmap.recycle()
    }
  }
}
