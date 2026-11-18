package com.jewelar.ar

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import kotlin.math.atan2
import kotlin.math.hypot

/**
 * Turns MediaPipe landmarks into jewellery placements.
 * All tuning constants live here - adjust them while testing on a real phone.
 *
 * Face mesh indices: https://github.com/google-ai-edge/mediapipe (canonical_face_model_uv_visualization.png)
 * Hand indices: 0 wrist, 5/9/13/17 finger knuckles (MCP), 14 ring-finger middle joint (PIP)
 */
object JewelPlacer {

  private class P(val x: Float, val y: Float)

  private fun pt(lm: List<NormalizedLandmark>, i: Int, w: Int, h: Int) =
      P(lm[i].x() * w, lm[i].y() * h)

  private fun lerp(a: P, b: P, t: Float) = P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

  private fun dist(a: P, b: P) = hypot(b.x - a.x, b.y - a.y)

  private fun angleDeg(from: P, to: P) =
      Math.toDegrees(atan2((to.y - from.y).toDouble(), (to.x - from.x).toDouble())).toFloat()

  /** Returns a fixed-size list (one slot per possible piece); null = hidden. */
  fun face(
      part: String,
      lm: List<NormalizedLandmark>,
      w: Int,
      h: Int,
      sizeScale: Float,
  ): List<Placement?> {
    val left = pt(lm, 234, w, h) // face edge, one side
    val right = pt(lm, 454, w, h) // face edge, other side
    val top = pt(lm, 10, w, h) // top of forehead
    val chin = pt(lm, 152, w, h)
    val nose = pt(lm, 1, w, h)
    val faceW = dist(left, right)
    val faceH = dist(top, chin)
    val roll = angleDeg(left, right)

    // Unit vector across the face (left -> right) to push points outward.
    val ux = (right.x - left.x) / faceW
    val uy = (right.y - left.y) / faceW

    return when (part) {
      "ear" -> {
        // How far the nose sits between the two face edges: ~0.5 when looking straight.
        val vx = right.x - left.x
        val vy = right.y - left.y
        val r = ((nose.x - left.x) * vx + (nose.y - left.y) * vy) / (vx * vx + vy * vy)
        val earW = 0.16f * faceW * sizeScale
        val out = 0.04f * faceW

        val lobeL = lerp(pt(lm, 93, w, h), pt(lm, 132, w, h), 0.5f)
        val lobeR = lerp(pt(lm, 323, w, h), pt(lm, 361, w, h), 0.5f)
        // Earrings hang with gravity, so angle stays ~0.
        val l = if (r < 0.28f) null else Placement(lobeL.x - ux * out, lobeL.y - uy * out, earW, 0f)
        val rr = if (r > 0.72f) null else Placement(lobeR.x + ux * out, lobeR.y + uy * out, earW, 0f)
        listOf(l, rr)
      }
      "nose" -> {
        val wing = pt(lm, 294, w, h)
        listOf(Placement(wing.x, wing.y, 0.07f * faceW * sizeScale, roll), null)
      }
      "forehead" -> {
        val p = lerp(top, pt(lm, 151, w, h), 0.15f)
        listOf(Placement(p.x, p.y, 0.14f * faceW * sizeScale, roll), null)
      }
      "neck" -> {
        // Move down from the chin along the face's vertical axis.
        val dx = (chin.x - top.x) / faceH
        val dy = (chin.y - top.y) / faceH
        val d = 0.18f * faceH
        listOf(Placement(chin.x + dx * d, chin.y + dy * d, 1.05f * faceW * sizeScale, roll), null)
      }
      else -> listOf(null, null)
    }
  }

  fun hand(
      part: String,
      lm: List<NormalizedLandmark>,
      w: Int,
      h: Int,
      sizeScale: Float,
  ): List<Placement?> {
    return when (part) {
      "finger" -> {
        // Ring finger: 13 = knuckle (MCP), 14 = middle joint (PIP).
        val mcp = pt(lm, 13, w, h)
        val pip = pt(lm, 14, w, h)
        // Finger width ~ spacing between neighbouring knuckles (average both sides for stability).
        val fingerW = (dist(pt(lm, 9, w, h), mcp) + dist(mcp, pt(lm, 17, w, h))) / 2f
        // A ring sits on the lower part of the finger, a bit above the knuckle.
        val p = lerp(mcp, pip, 0.45f)
        // The ring's width goes ACROSS the finger: image x-axis perpendicular to the finger.
        listOf(Placement(p.x, p.y, fingerW * 1.0f * sizeScale, angleDeg(mcp, pip) + 90f), null)
      }
      "wrist" -> {
        val wrist = pt(lm, 0, w, h)
        // Arm direction ~ wrist -> middle knuckle.
        val mid = pt(lm, 9, w, h)
        val palmW = dist(pt(lm, 5, w, h), pt(lm, 17, w, h))
        // Step back from the wrist landmark onto the wrist itself.
        val p = lerp(wrist, mid, -0.18f)
        // Bangle width goes ACROSS the wrist: image x-axis perpendicular to the arm.
        listOf(Placement(p.x, p.y, palmW * 1.1f * sizeScale, angleDeg(wrist, mid) + 90f), null)
      }
      else -> listOf(null, null)
    }
  }

  fun isHandPart(part: String) = part == "finger" || part == "wrist"
}
