package com.jewelar.ar3d

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Builds 3D meshes in millimetres, in a local frame:
 *   x/y = the circle the band goes around, z = along the arm/finger.
 * Vertex layout: position(3) normal(3) uv(2) outer(1) = 9 floats.
 */
class Mesh(val vertices: FloatBuffer, val indices: ShortBuffer, val indexCount: Int)

object BandGeometry {
  const val STRIDE = 9

  /**
   * A bangle / kada / ring band: a cross-section profile swept around a circle.
   * @param innerR inner radius (mm), @param width along the arm (mm), @param thick radial (mm)
   */
  fun band(innerR: Float, width: Float, thick: Float, profile: String, segments: Int = 160): Mesh {
    val prof = profilePoints(width, thick, profile)
    val n = prof.size
    val verts = FloatArray((segments + 1) * n * STRIDE)
    var k = 0
    for (i in 0..segments) {
      // phi from -PI..PI; texture s = (phi + PI/2) / PI -> the photo covers the front half,
      // GL_MIRRORED_REPEAT reuses it (mirrored) on the back half.
      val phi = -PI + 2 * PI * i / segments
      val c = cos(phi).toFloat()
      val s = sin(phi).toFloat()
      val texS = ((phi + PI / 2) / PI).toFloat()
      for (p in prof) {
        val r = innerR + p.r
        verts[k++] = r * c
        verts[k++] = r * s
        verts[k++] = p.a
        verts[k++] = p.nr * c
        verts[k++] = p.nr * s
        verts[k++] = p.na
        verts[k++] = texS
        verts[k++] = (p.a + width / 2) / width
        verts[k++] = if (p.outer) 1f else 0f
      }
    }
    val idx = ShortArray(segments * n * 6)
    var q = 0
    for (i in 0 until segments) {
      for (j in 0 until n) {
        val a = (i * n + j).toShort()
        val b = (i * n + (j + 1) % n).toShort()
        val c = ((i + 1) * n + j).toShort()
        val d = ((i + 1) * n + (j + 1) % n).toShort()
        idx[q++] = a; idx[q++] = c; idx[q++] = b
        idx[q++] = b; idx[q++] = c; idx[q++] = d
      }
    }
    return Mesh(floatBuffer(verts), shortBuffer(idx), idx.size)
  }

  /** Capped cylinder used only to hide the back of the band (depth only, never visible). */
  fun cylinder(radius: Float, zFrom: Float, zTo: Float, segments: Int = 48): Mesh {
    val verts = ArrayList<Float>()
    fun v(x: Float, y: Float, z: Float) {
      verts += listOf(x, y, z, 0f, 0f, 1f, 0f, 0f, 0f)
    }
    for (i in 0..segments) {
      val a = 2 * PI * i / segments
      val x = (radius * cos(a)).toFloat()
      val y = (radius * sin(a)).toFloat()
      v(x, y, zFrom)
      v(x, y, zTo)
    }
    val ringCount = (segments + 1) * 2
    v(0f, 0f, zFrom) // cap centres
    v(0f, 0f, zTo)
    val idx = ArrayList<Short>()
    for (i in 0 until segments) {
      val a = i * 2
      idx += listOf(a, a + 1, a + 2, a + 1, a + 3, a + 2).map { it.toShort() }
      idx += listOf(ringCount, a, a + 2).map { it.toShort() }
      idx += listOf(ringCount + 1, a + 3, a + 1).map { it.toShort() }
    }
    return Mesh(floatBuffer(verts.toFloatArray()), shortBuffer(idx.toShortArray()), idx.size)
  }

  // ---- cross-section profiles ----

  /** One point of the cross-section: r = radial offset from the inner radius, a = along the arm. */
  private class PP(val r: Float, val a: Float, var nr: Float = 0f, var na: Float = 0f, val outer: Boolean)

  private fun profilePoints(w: Float, t: Float, profile: String): List<PP> {
    val pts = ArrayList<PP>()
    val m = 24
    if (profile == "round") {
      // Elliptical tube.
      for (i in 0 until m * 2) {
        val ang = 2 * PI * i / (m * 2)
        val cr = cos(ang).toFloat()
        pts += PP(t / 2 + t / 2 * cr, (w / 2 * sin(ang)).toFloat(), outer = cr > -0.2f)
      }
    } else {
      // Outer face from one edge to the other (a: -w/2 -> +w/2) ...
      for (i in 0..m) {
        val u = -1f + 2f * i / m
        val f = when (profile) {
          "flat" -> 1f - 0.55f * abs(u).pow(10f)
          "kada" -> 1f - 0.4f * abs(u).pow(5f)
          else -> 0.3f + 0.7f * sqrt((1f - u * u).coerceAtLeast(0f)) // dome
        }
        pts += PP(t * f, u * w / 2, outer = true)
      }
      // ... then the inner (skin side) face back again, slightly rounded at the edges.
      for (i in m - 1 downTo 1) {
        val u = -1f + 2f * i / m
        pts += PP(0.12f * t * abs(u).pow(6f), u * w / 2, outer = false)
      }
    }
    // Normals: perpendicular to the neighbours, pointing away from the profile centre.
    val cr = pts.map { it.r }.average().toFloat()
    val ca = pts.map { it.a }.average().toFloat()
    for (i in pts.indices) {
      val p0 = pts[(i - 1 + pts.size) % pts.size]
      val p1 = pts[(i + 1) % pts.size]
      var nr = p1.a - p0.a
      var na = -(p1.r - p0.r)
      val len = hypot(nr, na).coerceAtLeast(1e-6f)
      nr /= len
      na /= len
      if (nr * (pts[i].r - cr) + na * (pts[i].a - ca) < 0) {
        nr = -nr
        na = -na
      }
      pts[i].nr = nr
      pts[i].na = na
    }
    return pts
  }

  private fun floatBuffer(a: FloatArray): FloatBuffer =
      ByteBuffer.allocateDirect(a.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
        put(a)
        position(0)
      }

  private fun shortBuffer(a: ShortArray): ShortBuffer =
      ByteBuffer.allocateDirect(a.size * 2).order(ByteOrder.nativeOrder()).asShortBuffer().apply {
        put(a)
        position(0)
      }
}
