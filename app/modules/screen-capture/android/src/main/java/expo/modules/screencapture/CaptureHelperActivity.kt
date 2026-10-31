package expo.modules.screencapture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.util.Log

private const val TAG = "CaptureHelper"

/**
 * 透明中转 Activity：
 * 负责拉起系统“屏幕录制”授权弹窗（MediaProjection 弹窗），
 * 并把用户的选择结果交给 ScreenCaptureModule。
 */
class CaptureHelperActivity : Activity() {

  companion object {
    private const val REQUEST_MEDIA_PROJECTION = 4711
  }

  private var resultDelivered = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION)
    } catch (e: Exception) {
      Log.e(TAG, "无法发起屏幕授权", e)
      deliver(RESULT_CANCELED, null)
      finish()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == REQUEST_MEDIA_PROJECTION) {
      deliver(resultCode, data)
      finish()
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    // 用户按返回键取消等场景：兜底回调，避免 JS Promise 悬挂
    if (!resultDelivered) {
      deliver(RESULT_CANCELED, null)
    }
  }

  private fun deliver(resultCode: Int, data: Intent?) {
    if (resultDelivered) return
    resultDelivered = true
    val cb = ScreenCaptureModule.consentCallback
    ScreenCaptureModule.consentCallback = null
    cb?.invoke(resultCode, data)
  }
}
