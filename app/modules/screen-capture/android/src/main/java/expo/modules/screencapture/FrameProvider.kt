package expo.modules.screencapture

import android.media.Image

/**
 * 保存最新一帧屏幕图像。
 *  - 捕获线程 set() 替换新帧并关闭旧帧
 *  - JS 轮询 captureFrame() 时在锁内读取（不关闭，屏幕静止无新帧时也能取到上一帧）
 */
object FrameProvider {
  private var latest: Image? = null
  private val lock = Any()

  fun set(image: Image) {
    synchronized(lock) {
      val old = latest
      latest = image
      old?.close()
    }
  }

  fun <T> withLatest(block: (Image?) -> T): T {
    synchronized(lock) {
      return block(latest)
    }
  }

  fun clear() {
    synchronized(lock) {
      latest?.close()
      latest = null
    }
  }
}
