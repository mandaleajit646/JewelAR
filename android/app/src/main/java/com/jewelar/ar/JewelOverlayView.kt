package com.jewelar.ar

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import com.jewelar.ar3d.BandFrame
import kotlin.math.max

/** Where to draw one piece of jewellery, in camera-image pixel coordinates. */
data class Placement(
    val x: Float, // body attach point
    val y: Float,
    val width: Float, // jewellery width in image pixels
    val angleDeg: Float,
)

/**
 * Transparent view drawn on top of the camera preview.
 * Maps image coordinates to view coordinates the same way PreviewView FILL_CENTER does.
 */
class JewelOverlayView(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val rect = RectF()

  @Volatile var jewel: Bitmap? = null
  var anchorX = 0.5f
  var anchorY = 0f

  private var placements: List<Placement?> = emptyList()
  private var imageW = 1
  private var imageH = 1

  // 3D band rendered off-screen by BandRenderer, already in view coordinates.
  private var band: BandFrame? = null
  private val bandRect = RectF()

  fun update(newPlacements: List<Placement?>, imgW: Int, imgH: Int) {
    placements = newPlacements
    band = null
    imageW = imgW
    imageH = imgH
    invalidate()
  }

  fun updateBand(frame: BandFrame?) {
    band = frame
    placements = emptyList()
    invalidate()
  }

  fun clear() {
    placements = emptyList()
    band = null
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    band?.let {
      bandRect.set(it.left, it.top, it.left + it.width, it.top + it.height)
      canvas.drawBitmap(it.bitmap, null, bandRect, paint)
      return
    }
    val bmp = jewel ?: return
    if (placements.isEmpty() || width == 0 || height == 0) return

    val scale = max(width.toFloat() / imageW, height.toFloat() / imageH)
    val dx = (width - imageW * scale) / 2f
    val dy = (height - imageH * scale) / 2f
    val aspect = bmp.height.toFloat() / bmp.width.toFloat()

    for (p in placements) {
      if (p == null) continue
      val w = p.width * scale
      val h = w * aspect
      canvas.save()
      canvas.translate(dx + p.x * scale, dy + p.y * scale)
      canvas.rotate(p.angleDeg)
      rect.set(-anchorX * w, -anchorY * h, (1 - anchorX) * w, (1 - anchorY) * h)
      canvas.drawBitmap(bmp, null, rect, paint)
      canvas.restore()
    }
  }
}
