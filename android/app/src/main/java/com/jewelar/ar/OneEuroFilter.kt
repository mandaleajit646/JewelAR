package com.jewelar.ar

import kotlin.math.PI
import kotlin.math.abs

/**
 * One Euro filter: removes jitter when still, stays responsive when moving.
 * https://gery.casiez.net/1euro/
 */
class OneEuroFilter(
    private val minCutoff: Double = 1.2,
    private val beta: Double = 0.02,
    private val dCutoff: Double = 1.0,
) {
  private var xPrev = 0.0
  private var dxPrev = 0.0
  private var tPrev = -1L

  fun reset() {
    tPrev = -1L
  }

  fun filter(x: Double, timeMs: Long): Double {
    if (tPrev < 0) {
      tPrev = timeMs
      xPrev = x
      dxPrev = 0.0
      return x
    }
    val dt = ((timeMs - tPrev).coerceAtLeast(1)) / 1000.0
    tPrev = timeMs
    val dx = (x - xPrev) / dt
    val dxHat = lerp(dxPrev, dx, alpha(dt, dCutoff))
    val cutoff = minCutoff + beta * abs(dxHat)
    val xHat = lerp(xPrev, x, alpha(dt, cutoff))
    xPrev = xHat
    dxPrev = dxHat
    return xHat
  }

  private fun alpha(dt: Double, cutoff: Double): Double {
    val tau = 1.0 / (2 * PI * cutoff)
    return 1.0 / (1.0 + tau / dt)
  }

  private fun lerp(a: Double, b: Double, t: Double) = a + (b - a) * t
}
