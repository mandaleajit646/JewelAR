package com.jewelar.ar3d

import android.graphics.Bitmap
import com.google.mediapipe.tasks.components.containers.Landmark
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** Turns the owner's photo + size into a 3D band, and hand landmarks into a 3D pose. */
object BandFit {

  /**
   * The owner photographs the piece lying flat, from the side, at table level, so the
   * trimmed cut-out shows the front half of the band as a strip that is squeezed near its edges.
   * A point at angle t on the band appears at x = centre + R*sin(t); sampling at even angles
   * "unwraps" it into an evenly spaced design strip that wraps around the 3D band.
   */
  /**
   * How much of the photo's bounding box is filled. A side-on strip photo is mostly solid (>0.55);
   * an angled photo (ring / arc shape) is mostly empty and cannot be used as a band texture.
   */
  fun coverage(src: Bitmap): Float {
    val w = src.width
    val h = src.height
    val px = IntArray(w * h)
    src.getPixels(px, 0, w, 0, 0, w, h)
    var n = 0
    for (p in px) if ((p ushr 24) > 128) n++
    return n.toFloat() / px.size.coerceAtLeast(1)
  }

  /**
   * True when the cut-out looks like a side-on strip: in the middle columns there is one solid run
   * of pixels, and that run stays at the same height (an arc or an angled hoop does not).
   */
  fun isStrip(src: Bitmap): Boolean {
    val w = src.width
    val h = src.height
    val aspect = h.toFloat() / w
    if (aspect !in 0.03f..0.5f || w < 40) return false
    val col = IntArray(h)
    var single = 0
    var total = 0
    val centres = ArrayList<Float>()
    var x = (w * 0.06f).toInt()
    val step = (w / 60).coerceAtLeast(1)
    while (x < w * 0.94f) {
      src.getPixels(col, 0, 1, x, 0, 1, h)
      var runs = 0
      var inRun = false
      var gap = 0
      var first = -1
      var last = -1
      for (y in 0 until h) {
        val solid = (col[y] ushr 24) > 128
        if (solid) {
          if (!inRun) runs++
          inRun = true
          gap = 0
          if (first < 0) first = y
          last = y
        } else if (inRun && ++gap > 2) {
          inRun = false
        }
      }
      total++
      if (runs == 1) {
        single++
        centres += (first + last) / 2f
      }
      x += step
    }
    if (total == 0 || single < total * 0.8f || centres.isEmpty()) return false
    val mean = centres.average()
    val sd = sqrt(centres.map { (it - mean) * (it - mean) }.average())
    return sd / h < 0.09
  }

  /**
   * For normal product photos (angled / 3-4 view, open cuffs): the band looks like an ellipse.
   * 1. Fit an ellipse to the outline.  2. Walk all the way round it; at each angle take the band's
   * pixels along the ray from its outer to its inner edge.  3. Rotate so the most visible part
   * (e.g. the flower or stone) is in the middle, which ends up facing the camera.
   * Returns a 360-degree design strip, or null if no ellipse fits.
   */
  fun unrollEllipse(input: Bitmap): Bitmap? {
    val sc = 700f / maxOf(input.width, input.height)
    val src = if (sc < 1f)
      Bitmap.createScaledBitmap(input, (input.width * sc).toInt(), (input.height * sc).toInt(), true)
    else input
    val w = src.width
    val h = src.height
    val px = IntArray(w * h)
    src.getPixels(px, 0, w, 0, 0, w, h)
    fun solid(x: Int, y: Int) = x in 0 until w && y in 0 until h && (px[y * w + x] ushr 24) > 128

    // Outline points: top-most per column, left/right-most per row.
    val ptsX = ArrayList<Double>()
    val ptsY = ArrayList<Double>()
    for (x in 0 until w step 2) {
      for (y in 0 until h) if (solid(x, y)) { ptsX += x.toDouble(); ptsY += y.toDouble(); break }
    }
    for (y in 0 until h step 2) {
      var l = -1
      var r = -1
      for (x in 0 until w) if (solid(x, y)) { if (l < 0) l = x; r = x }
      if (l >= 0) { ptsX += l.toDouble(); ptsY += y.toDouble(); ptsX += r.toDouble(); ptsY += y.toDouble() }
    }
    if (ptsX.size < 20) return null
    // Least squares for a*x^2 + c*y^2 + d*x + e*y = 1 (axis-aligned ellipse), in normalised
    // coordinates (about -1..1) so the sums stay numerically well-behaved.
    val ox = w / 2.0
    val oy = h / 2.0
    val s = maxOf(w, h) / 2.0
    val m = Array(4) { DoubleArray(5) }
    for (i in ptsX.indices) {
      val x = (ptsX[i] - ox) / s; val y = (ptsY[i] - oy) / s
      val row = doubleArrayOf(x * x, y * y, x, y)
      for (r in 0..3) {
        for (c in 0..3) m[r][c] += row[r] * row[c]
        m[r][4] += row[r]
      }
    }
    val sol = solve4(m) ?: return null
    val (a, c, d, e) = sol.toList()
    if (a <= 0 || c <= 0) return null
    val ncx = -d / (2 * a)
    val ncy = -e / (2 * c)
    val k = 1 + a * ncx * ncx + c * ncy * ncy
    if (k <= 0) return null
    // Back to pixels.
    val cx = ox + ncx * s
    val cy = oy + ncy * s
    val ra = sqrt(k / a) * s
    val rb = sqrt(k / c) * s
    if (ra < 10 || rb < 5) return null

    val n = 1024
    val hh = 128
    val steps = 400
    val out = IntArray(n * hh)
    val thick = DoubleArray(n)
    for (i in 0 until n) {
      val phi = 2 * PI * i / n
      val cp = kotlin.math.cos(phi)
      val sp = sin(phi)
      // Ray from outside (t = 1.25) inward (t = 0.3), in ellipse units.
      fun at(j: Int) = 1.25 - 0.95 * j / (steps - 1)
      fun hit(j: Int) = solid((cx + at(j) * ra * cp).toInt(), (cy + at(j) * rb * sp).toInt())
      var j0 = -1
      for (j in 0 until steps) if (hit(j)) { j0 = j; break }
      if (j0 < 0) continue
      var j1 = j0
      while (j1 + 1 < steps && (hit(j1 + 1) || (j1 + 3 < steps && (hit(j1 + 2) || hit(j1 + 3))))) j1++
      val t0 = at(j0)
      val t1 = at(j1)
      thick[i] = t0 - t1
      for (r in 0 until hh) {
        val t = t0 + (t1 - t0) * (r + 0.5) / hh
        val x = (cx + t * ra * cp).toInt()
        val y = (cy + t * rb * sp).toInt()
        if (x in 0 until w && y in 0 until h) out[r * n + i] = px[y * w + x]
      }
    }
    val covered = thick.count { it > 0 }
    if (covered < n * 0.25) return null
    // Most visible part (thickness-weighted mean angle) goes to the middle of the strip.
    var sx = 0.0
    var sy = 0.0
    for (i in 0 until n) {
      sx += thick[i] * kotlin.math.cos(2 * PI * i / n)
      sy += thick[i] * sin(2 * PI * i / n)
    }
    val centre = kotlin.math.atan2(sy, sx)
    val shift = ((centre / (2 * PI)) * n).roundToInt() - n / 2
    val rolled = IntArray(n * hh)
    for (r in 0 until hh) for (i in 0 until n) {
      rolled[r * n + i] = out[r * n + Math.floorMod(i + shift, n)]
    }
    return Bitmap.createBitmap(rolled, n, hh, Bitmap.Config.ARGB_8888)
  }

  /** Gaussian elimination for a 4x4 system stored as an augmented 4x5 matrix. */
  private fun solve4(m: Array<DoubleArray>): DoubleArray? {
    for (col in 0..3) {
      var piv = col
      for (r in col + 1..3) if (kotlin.math.abs(m[r][col]) > kotlin.math.abs(m[piv][col])) piv = r
      if (kotlin.math.abs(m[piv][col]) < 1e-12) return null
      val tmp = m[col]; m[col] = m[piv]; m[piv] = tmp
      for (r in 0..3) {
        if (r == col) continue
        val f = m[r][col] / m[col][col]
        for (c in col..4) m[r][c] -= f * m[col][c]
      }
    }
    return DoubleArray(4) { m[it][4] / m[it][it] }
  }

  fun unwrap(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    val outW = min(2048, (PI * w / 2).roundToInt()).coerceAtLeast(2)
    val inPx = IntArray(w * h)
    src.getPixels(inPx, 0, w, 0, 0, w, h)
    val outPx = IntArray(outW * h)
    val r = (w - 1) / 2f
    for (col in 0 until outW) {
      val t = -PI / 2 + PI * col / (outW - 1)
      val sx = (r + r * sin(t)).roundToInt().coerceIn(0, w - 1)
      var o = col
      var i = sx
      for (row in 0 until h) {
        outPx[o] = inPx[i]
        o += outW
        i += w
      }
    }
    return Bitmap.createBitmap(outPx, outW, h, Bitmap.Config.ARGB_8888)
  }

  /**
   * Band dimensions in mm. The band's width along the arm comes from the photo itself:
   * the strip's width is the outer diameter, so height/width gives the real band width.
   */
  fun spec(innerMm: Float, thickMm: Float, profile: String, photoAspect: Float?): BandSpec {
    val inner = innerMm.coerceIn(10f, 90f)
    val isRing = inner < 30f
    val thick = if (thickMm > 0f) thickMm else if (isRing) 1.8f else 2.5f
    val maxW = if (isRing) 14f else 40f
    val width: Float
    val t: Float
    if (photoAspect == null) {
      // No usable strip photo: typical widths for the type.
      width = when {
        isRing -> if (profile == "round") 2.2f else 3.5f
        profile == "kada" -> 10f
        profile == "round" -> 4f
        profile == "flat" -> 6f
        else -> 7f
      }
      t = if (profile == "round") width else thick
    } else if (profile == "round") {
      // Round wire: thickness == width, outer diameter = inner + 2 * width.
      val a = photoAspect.coerceIn(0.02f, 0.4f)
      width = (inner * a / (1f - 2f * a)).coerceIn(1.5f, maxW)
      t = width
    } else {
      width = ((inner + 2 * thick) * photoAspect).coerceIn(1.5f, maxW)
      t = thick
    }
    return BandSpec(inner / 2f, width, t, profile)
  }

  class Raw(
      val cx: Float, val cy: Float, val cz: Float,
      val ax: Float, val ay: Float, val az: Float,
      val pxPerMm: Float,
  )

  /**
   * Raw pose in *frame* pixels (x right, y down, z away from the camera).
   * MediaPipe image z is relative to the wrist and roughly on the same scale as x.
   * World landmarks are in metres, which gives the real-world scale.
   */
  fun raw(part: String, lm: List<NormalizedLandmark>, world: List<Landmark>?, w: Int, h: Int): Raw? {
    fun p(i: Int) = floatArrayOf(lm[i].x() * w, lm[i].y() * h, lm[i].z() * w)
    fun len(a: FloatArray, b: FloatArray): Float {
      val x = a[0] - b[0]; val y = a[1] - b[1]; val z = a[2] - b[2]
      return sqrt(x * x + y * y + z * z)
    }
    val pairs = listOf(0 to 5, 0 to 9, 0 to 17, 5 to 17)
    var img = 0f
    var real = 0f
    for ((a, b) in pairs) {
      img += len(p(a), p(b))
      if (world != null) {
        val wa = world[a]; val wb = world[b]
        val x = wa.x() - wb.x(); val y = wa.y() - wb.y(); val z = wa.z() - wb.z()
        real += sqrt(x * x + y * y + z * z) * 1000f
      }
    }
    // No world landmarks: assume an average adult hand (~ 285 mm summed over the pairs above).
    if (real < 1f) real = 285f
    val pxPerMm = img / real
    if (pxPerMm <= 0f) return null

    val from: FloatArray
    val to: FloatArray
    val c: FloatArray
    if (part == "finger") {
      // Ring finger: knuckle (13) -> middle joint (14); the ring sits 40% up.
      from = p(13); to = p(14)
      c = FloatArray(3) { from[it] + (to[it] - from[it]) * 0.4f }
    } else {
      // Arm direction ~ wrist (0) -> middle knuckle (9); bangle sits ~12 mm back from the wrist point.
      from = p(0); to = p(9)
      val l = len(from, to).coerceAtLeast(1e-3f)
      c = FloatArray(3) { from[it] - (to[it] - from[it]) / l * 12f * pxPerMm }
    }
    val l = len(from, to)
    if (l < 1f) return null
    return Raw(c[0], c[1], c[2],
        (to[0] - from[0]) / l, (to[1] - from[1]) / l, (to[2] - from[2]) / l, pxPerMm)
  }

  /** Builds the final pose (in view pixels) from smoothed values. */
  fun pose(cx: Float, cy: Float, cz: Float, ax0: Float, ay0: Float, az0: Float, pxPerMm: Float): BandPose {
    var al = sqrt(ax0 * ax0 + ay0 * ay0 + az0 * az0)
    if (al < 1e-4f) al = 1f
    val ax = ax0 / al; val ay = ay0 / al; val az = az0 / al
    // Direction toward the camera (0,0,-1), made perpendicular to the axis: the design faces you.
    var ex = -ax * -az
    var ey = -ay * -az
    var ez = -1f - az * -az
    var el = sqrt(ex * ex + ey * ey + ez * ez)
    if (el < 0.15f) {
      // Arm points straight at the camera: use screen-up instead.
      ex = -ax * -ay; ey = -1f - ay * -ay; ez = -az * -ay
      el = sqrt(ex * ex + ey * ey + ez * ez).coerceAtLeast(1e-4f)
    }
    return BandPose(cx, cy, cz, ax, ay, az, ex / el, ey / el, ez / el, pxPerMm)
  }

  /** Small helper for logs: how much the axis tilts out of the screen, in degrees. */
  fun tiltDeg(az: Float) = Math.toDegrees(asin(az.coerceIn(-1f, 1f).toDouble())).toFloat()
}
