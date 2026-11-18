package com.jewelar.ar3d

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * Debug only: renders a few bands over fake "arms" and saves a PNG, so the 3D output can be checked
 * without a hand in front of the camera.
 *   adb shell am start -n com.jewelar/.MainActivity --ez bandSelfTest true
 *   adb pull /sdcard/Android/data/com.jewelar/files/selftest.png
 */
object BandSelfTest {
  private const val TAG = "BandSelfTest"

  fun run(ctx: Context) {
    Thread {
      try {
        render(ctx)
      } catch (e: Throwable) {
        Log.e(TAG, "self test failed", e)
        ctx.getExternalFilesDir(null)?.let { File(it, "selftest_error.txt").writeText(Log.getStackTraceString(e)) }
      }
    }.start()
  }

  private fun render(ctx: Context) {
    val dir = ctx.getExternalFilesDir(null) ?: return
    val report = StringBuilder()
    fun note(s: String) { Log.i(TAG, s); report.append(s).append('\n'); File(dir, "selftest.txt").writeText(report.toString()) }
    class T(val bmp: Bitmap?, val aspect: Float?, val full: Boolean)
    fun tex(name: String): T {
      val f = File(dir, name)
      val b: Bitmap = (if (f.exists()) BitmapFactory.decodeFile(f.path) else null) ?: return T(null, null, false)
      note("$name loaded ${b.width}x${b.height}")
      if (BandFit.isStrip(b)) return T(BandFit.unwrap(b), b.height.toFloat() / b.width, false)
      val u = BandFit.unrollEllipse(b)
      note("$name ${b.width}x${b.height} strip=false unrolled=${u?.let { "${it.width}x${it.height}" }}")
      u?.let { FileOutputStream(File(dir, "unrolled_$name")).use { o -> it.compress(Bitmap.CompressFormat.PNG, 100, o) } }
      return T(u, null, u != null)
    }
    val kada = tex("test_kada.png")
    val bangle = tex("test_bangle.png")
    val ring = tex("test_ring.png")

    val cellW = 540
    val cellH = 700
    val out = Bitmap.createBitmap(cellW * 2, cellH * 2, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.rgb(205, 205, 200))
    val skin = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(120, 80, 60) }

    val r = BandRenderer()
    if (!r.init()) {
      Log.e(TAG, "GL init failed")
      return
    }
    class Case(val axis: FloatArray, val inner: Float, val k: Float, val t: T, val prof: String, val limbMm: Float)
    val cases = listOf(
        Case(floatArrayOf(1f, 0f, 0f), 60.3f, 4f, kada, "kada", 54f),            // kada, arm across
        Case(floatArrayOf(0.8f, 0f, 0.6f), 60.3f, 4f, bangle, "dome", 54f),      // bangle, tilted into screen
        Case(floatArrayOf(0.7f, -0.7f, 0.15f), 60.3f, 4f, bangle, "dome", 54f),  // bangle, diagonal arm
        Case(floatArrayOf(0f, -1f, 0.25f), 17.8f, 12f, ring, "dome", 17f),      // ring, finger up
    )
    for ((i, c) in cases.withIndex()) {
      val ox = (i % 2) * cellW
      val oy = (i / 2) * cellH
      val cx = ox + cellW / 2f
      val cy = oy + cellH / 2f
      // Fake limb: a rectangle along the axis.
      val l = sqrt(c.axis[0] * c.axis[0] + c.axis[1] * c.axis[1])
      val ang = Math.toDegrees(atan2(c.axis[1].toDouble(), c.axis[0].toDouble())).toFloat()
      canvas.save()
      canvas.clipRect(ox.toFloat(), oy.toFloat(), (ox + cellW).toFloat(), (oy + cellH).toFloat())
      canvas.translate(cx, cy)
      canvas.rotate(ang)
      val half = c.limbMm / 2 * c.k
      if (l > 0.01f) canvas.drawRoundRect(RectF(-900f, -half, 900f, half), half, half, skin)
      canvas.restore()

      val pose = BandFit.pose(cx - ox, cy - oy, 0f, c.axis[0], c.axis[1], c.axis[2], c.k)
      val spec = BandFit.spec(c.inner, if (c.prof == "kada") 6f else 0f, c.prof, c.t.aspect)
      r.fullTexture = c.t.full
      val f = r.render(spec, c.t.bmp, pose, cellW, cellH) ?: continue
      canvas.drawBitmap(f.bitmap, null, RectF(ox + f.left, oy + f.top, ox + f.left + f.width, oy + f.top + f.height), null)
    }
    r.release()
    val file = File(dir, "selftest.png")
    FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
    Log.i(TAG, "saved ${file.path}")
  }
}
