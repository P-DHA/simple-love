package expo.modules.screencapture

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log

private const val TAG = "ScreenCaptureService"

/**
 * 屏幕捕获前台服务：
 *  - Android 10+ 必须以 mediaProjection 类型前台服务运行
 *  - Android 14+ 要求先 startForeground(FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) 再获取 MediaProjection
 *  - 通过 ImageReader 持续获取 RGBA 帧，供 JS 定时取 JPEG
 */
class ScreenCaptureService : Service() {

  companion object {
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    private const val NOTIFICATION_ID = 5210
    private const val CHANNEL_ID = "screen_capture_channel"

    @Volatile
    private var instance: ScreenCaptureService? = null

    fun isRunning(): Boolean = instance != null

    fun stopNow() {
      instance?.stopCaptureInternal()
    }
  }

  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var handlerThread: HandlerThread? = null
  private var handler: Handler? = null
  private var cleaningUp = false

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // 必须先进入前台服务（mediaProjection 类型），再获取 MediaProjection
    startAsForeground()

    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
      ?: Activity.RESULT_CANCELED
    @Suppress("DEPRECATION")
    val resultData = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)

    if (resultCode != Activity.RESULT_OK || resultData == null) {
      stopCaptureInternal()
      return START_NOT_STICKY
    }

    try {
      startCapture(resultCode, resultData)
    } catch (e: Exception) {
      Log.e(TAG, "startCapture failed", e)
      stopCaptureInternal()
    }
    return START_NOT_STICKY
  }

  private fun startAsForeground() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "屏幕共享", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val title = "简爱正在共享屏幕"
    val text = "被观察者的屏幕捕获运行中，可随时在 App 内停止"
    val smallIcon = applicationInfo.icon
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(smallIcon)
        .setOngoing(true)
        .build()
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(smallIcon)
        .setOngoing(true)
        .build()
    }
  }

  private fun startCapture(resultCode: Int, resultData: Intent) {
    if (projection != null) return // 已在捕获

    // 缩放到短边 720，控制流量
    val metrics = resources.displayMetrics
    val screenW = metrics.widthPixels
    val screenH = metrics.heightPixels
    val scale = 720f / minOf(screenW, screenH)
    var targetW = ((screenW * scale).toInt() / 2) * 2
    var targetH = ((screenH * scale).toInt() / 2) * 2
    if (targetW < 2) targetW = 2
    if (targetH < 2) targetH = 2
    val dpi = (metrics.densityDpi * scale).toInt().coerceIn(120, 640)

    cleaningUp = false

    handlerThread = HandlerThread("ScreenCaptureThread").also { it.start() }
    handler = Handler(handlerThread!!.looper)

    imageReader = ImageReader.newInstance(targetW, targetH, PixelFormat.RGBA_8888, 3).apply {
      setOnImageAvailableListener({ reader ->
        val img = try {
          reader.acquireLatestImage()
        } catch (e: Exception) {
          null
        }
        if (img != null) {
          FrameProvider.set(img)
        }
      }, handler)
    }

    val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val mp = mpm.getMediaProjection(resultCode, resultData)
    projection = mp
    mp.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() {
        // 用户从系统投屏/状态栏停止共享
        stopCaptureInternal()
      }
    }, handler)

    virtualDisplay = mp.createVirtualDisplay(
      "SimpleLoveCapture",
      targetW, targetH, dpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      imageReader!!.surface,
      null,
      handler
    )
    Log.i(TAG, "屏幕捕获已启动 ${targetW}x$targetH @${dpi}dpi")
  }

  private fun stopCaptureInternal() {
    if (cleaningUp) return
    cleaningUp = true

    FrameProvider.clear()
    try {
      virtualDisplay?.release()
    } catch (e: Exception) {
      /* ignore */
    }
    virtualDisplay = null
    try {
      imageReader?.close()
    } catch (e: Exception) {
      /* ignore */
    }
    imageReader = null
    try {
      projection?.stop()
    } catch (e: Exception) {
      /* ignore */
    }
    projection = null
    handlerThread?.quitSafely()
    handlerThread = null
    handler = null

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    Log.i(TAG, "屏幕捕获已停止")
  }

  override fun onDestroy() {
    if (instance === this) {
      instance = null
    }
    stopCaptureInternal()
    super.onDestroy()
  }
}
