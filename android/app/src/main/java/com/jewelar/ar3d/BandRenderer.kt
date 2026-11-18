package com.jewelar.ar3d

import android.graphics.Bitmap
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES30
import android.opengl.GLUtils
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/** Where the band is, in overlay-view pixels (x right, y down, z away from the camera). */
class BandPose(
    val cx: Float, val cy: Float, val cz: Float,
    val ax: Float, val ay: Float, val az: Float, // band axis (along arm / finger), unit
    val ex: Float, val ey: Float, val ez: Float, // unit, perpendicular to axis, faces the camera
    val pxPerMm: Float,
)

class BandSpec(val innerR: Float, val width: Float, val thick: Float, val profile: String) {
  override fun equals(other: Any?) =
      other is BandSpec && other.innerR == innerR && other.width == width &&
          other.thick == thick && other.profile == profile

  override fun hashCode() = listOf(innerR, width, thick, profile).hashCode()
}

class BandFrame(val bitmap: Bitmap, val left: Float, val top: Float, val width: Float, val height: Float)

/**
 * Off-screen OpenGL ES 3 renderer for 3D bands (bangles, kadas, rings).
 * Renders into a small MSAA framebuffer around the band and reads it back as a Bitmap,
 * which the normal 2D overlay draws - so photo capture keeps working unchanged.
 * Must be created, used and released on one thread.
 */
class BandRenderer {
  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var context: EGLContext = EGL14.EGL_NO_CONTEXT
  private var surface: EGLSurface = EGL14.EGL_NO_SURFACE

  private var program = 0
  private var msFbo = 0
  private var msColor = 0
  private var msDepth = 0
  private var outFbo = 0
  private var outColor = 0
  private var fbW = 0
  private var fbH = 0
  private var pixels: ByteBuffer? = null

  private var bandVbo = 0
  private var bandIbo = 0
  private var bandCount = 0
  private var occVbo = 0
  private var occIbo = 0
  private var occCount = 0
  private var builtSpec: BandSpec? = null

  private var texture = 0
  private var textureSource: Bitmap? = null

  /** Brightness multiplier matched to the room (1 = studio light). */
  var exposure = 1f

  /** true = texture covers the full 360 degrees (unrolled photo); false = front half, mirrored. */
  var fullTexture = false

  private val model = FloatArray(16)
  private val proj = FloatArray(16)
  private val nrm = FloatArray(9)

  fun init(): Boolean {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    val ver = IntArray(2)
    if (!EGL14.eglInitialize(display, ver, 0, ver, 1)) return false
    val attrs = intArrayOf(
        EGL14.EGL_RENDERABLE_TYPE, 0x40, // EGL_OPENGL_ES3_BIT
        EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
        EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
        EGL14.EGL_NONE)
    val configs = arrayOfNulls<EGLConfig>(1)
    val num = IntArray(1)
    if (!EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, num, 0) || num[0] == 0) return false
    context = EGL14.eglCreateContext(
        display, configs[0], EGL14.EGL_NO_CONTEXT,
        intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0)
    if (context == EGL14.EGL_NO_CONTEXT) return false
    surface = EGL14.eglCreatePbufferSurface(
        display, configs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
    if (!EGL14.eglMakeCurrent(display, surface, surface, context)) return false
    program = buildProgram(VERT, FRAG)
    return program != 0
  }

  fun release() {
    if (display == EGL14.EGL_NO_DISPLAY) return
    EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
    EGL14.eglDestroySurface(display, surface)
    EGL14.eglDestroyContext(display, context)
    EGL14.eglTerminate(display)
    display = EGL14.EGL_NO_DISPLAY
  }

  /** Renders the band; returns null if it is off-screen. viewW/viewH = overlay size. */
  fun render(spec: BandSpec, tex: Bitmap?, pose: BandPose, viewW: Int, viewH: Int): BandFrame? {
    ensureMeshes(spec)
    ensureTexture(tex)

    // Screen rectangle around the band (+ margin), clipped to the view.
    val reach = (spec.innerR + spec.thick + spec.width) * pose.pxPerMm
    val l = max(0f, pose.cx - reach)
    val t = max(0f, pose.cy - reach)
    val r = min(viewW.toFloat(), pose.cx + reach)
    val b = min(viewH.toFloat(), pose.cy + reach)
    if (r - l < 4 || b - t < 4) return null
    // Render resolution: crisp but bounded.
    val q = min(1f, MAX_SIDE / max(r - l, b - t))
    val w = ceil((r - l) * q).toInt().coerceAtLeast(1)
    val h = ceil((b - t) * q).toInt().coerceAtLeast(1)
    ensureFramebuffers(w, h)

    buildMatrices(pose, l, t, r, b, reach)

    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, msFbo)
    GLES30.glViewport(0, 0, w, h)
    GLES30.glClearColor(0f, 0f, 0f, 0f)
    GLES30.glClearDepthf(1f)
    GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT or GLES30.GL_DEPTH_BUFFER_BIT)
    GLES30.glEnable(GLES30.GL_DEPTH_TEST)
    GLES30.glDepthFunc(GLES30.GL_LESS)
    GLES30.glDisable(GLES30.GL_CULL_FACE)
    GLES30.glUseProgram(program)
    GLES30.glUniformMatrix4fv(loc("uModel"), 1, false, model, 0)
    GLES30.glUniformMatrix4fv(loc("uProj"), 1, false, proj, 0)
    GLES30.glUniformMatrix3fv(loc("uNrm"), 1, false, nrm, 0)
    // Engraving depth: brightest parts of the photo stand ~0.5 mm proud.
    GLES30.glUniform1f(loc("uBump"), 0.5f * pose.pxPerMm)
    GLES30.glUniform1f(loc("uExposure"), exposure)
    GLES30.glUniform1i(loc("uFull"), if (fullTexture) 1 else 0)

    // 1. Invisible arm/finger: depth only, hides the back half of the band.
    GLES30.glColorMask(false, false, false, false)
    GLES30.glUniform1i(loc("uHasTex"), 0)
    draw(occVbo, occIbo, occCount)
    // 2. The band itself.
    GLES30.glColorMask(true, true, true, true)
    GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
    GLES30.glUniform1i(loc("uTex"), 0)
    GLES30.glUniform1i(loc("uHasTex"), if (texture != 0) 1 else 0)
    draw(bandVbo, bandIbo, bandCount)

    // Resolve MSAA and read back.
    GLES30.glBindFramebuffer(GLES30.GL_READ_FRAMEBUFFER, msFbo)
    GLES30.glBindFramebuffer(GLES30.GL_DRAW_FRAMEBUFFER, outFbo)
    GLES30.glBlitFramebuffer(0, 0, w, h, 0, 0, w, h, GLES30.GL_COLOR_BUFFER_BIT, GLES30.GL_NEAREST)
    GLES30.glBindFramebuffer(GLES30.GL_READ_FRAMEBUFFER, outFbo)
    val buf = pixels!!
    buf.position(0)
    GLES30.glReadPixels(0, 0, w, h, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, buf)
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)

    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    buf.position(0)
    bmp.copyPixelsFromBuffer(buf)
    return BandFrame(bmp, l, t, r - l, b - t)
  }

  // ---- internals ----

  private fun buildMatrices(p: BandPose, l: Float, t: Float, r: Float, b: Float, reach: Float) {
    // Second in-plane direction: axis x camera-facing direction.
    val fx = p.ay * p.ez - p.az * p.ey
    val fy = p.az * p.ex - p.ax * p.ez
    val fz = p.ax * p.ey - p.ay * p.ex
    val k = p.pxPerMm
    // local x -> e (faces camera), local y -> f, local z -> axis; millimetres -> pixels
    model.fill(0f)
    model[0] = p.ex * k; model[1] = p.ey * k; model[2] = p.ez * k
    model[4] = fx * k; model[5] = fy * k; model[6] = fz * k
    model[8] = p.ax * k; model[9] = p.ay * k; model[10] = p.az * k
    model[12] = p.cx; model[13] = p.cy; model[14] = p.cz; model[15] = 1f
    nrm[0] = p.ex; nrm[1] = p.ey; nrm[2] = p.ez
    nrm[3] = fx; nrm[4] = fy; nrm[5] = fz
    nrm[6] = p.ax; nrm[7] = p.ay; nrm[8] = p.az
    // Orthographic: view pixels -> clip space. Top row of the view ends up first in glReadPixels.
    val zr = reach * 2f
    proj.fill(0f)
    proj[0] = 2f / (r - l)
    proj[5] = 2f / (b - t)
    proj[10] = 1f / zr
    proj[12] = -(r + l) / (r - l)
    proj[13] = -(b + t) / (b - t)
    proj[14] = -p.cz / zr
    proj[15] = 1f
  }

  private fun draw(vbo: Int, ibo: Int, count: Int) {
    if (count == 0) return
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
    GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo)
    val stride = BandGeometry.STRIDE * 4
    GLES30.glEnableVertexAttribArray(0)
    GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, stride, 0)
    GLES30.glEnableVertexAttribArray(1)
    GLES30.glVertexAttribPointer(1, 3, GLES30.GL_FLOAT, false, stride, 12)
    GLES30.glEnableVertexAttribArray(2)
    GLES30.glVertexAttribPointer(2, 2, GLES30.GL_FLOAT, false, stride, 24)
    GLES30.glEnableVertexAttribArray(3)
    GLES30.glVertexAttribPointer(3, 1, GLES30.GL_FLOAT, false, stride, 32)
    GLES30.glDrawElements(GLES30.GL_TRIANGLES, count, GLES30.GL_UNSIGNED_SHORT, 0)
  }

  private fun ensureMeshes(spec: BandSpec) {
    if (spec == builtSpec) return
    builtSpec = spec
    val band = BandGeometry.band(spec.innerR, spec.width, spec.thick, spec.profile)
    // Arm / finger stand-in: a little thinner than the band's inner radius, longer than the band.
    val occR = if (spec.innerR > 15f) min(spec.innerR * 0.86f, 27f) else spec.innerR * 0.9f
    val half = max(spec.width * 2.5f, if (spec.innerR > 15f) 30f else 10f)
    val occ = BandGeometry.cylinder(occR, -half, half)
    if (bandVbo == 0) {
      val ids = IntArray(4)
      GLES30.glGenBuffers(4, ids, 0)
      bandVbo = ids[0]; bandIbo = ids[1]; occVbo = ids[2]; occIbo = ids[3]
    }
    upload(bandVbo, bandIbo, band)
    upload(occVbo, occIbo, occ)
    bandCount = band.indexCount
    occCount = occ.indexCount
  }

  private fun upload(vbo: Int, ibo: Int, m: Mesh) {
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
    GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, m.vertices.capacity() * 4, m.vertices, GLES30.GL_STATIC_DRAW)
    GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo)
    GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, m.indices.capacity() * 2, m.indices, GLES30.GL_STATIC_DRAW)
  }

  private fun ensureTexture(bmp: Bitmap?) {
    if (bmp === textureSource) return
    textureSource = bmp
    if (texture != 0) {
      GLES30.glDeleteTextures(1, intArrayOf(texture), 0)
      texture = 0
    }
    if (bmp == null || bmp.isRecycled) return
    val ids = IntArray(1)
    GLES30.glGenTextures(1, ids, 0)
    texture = ids[0]
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
    GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
    GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR_MIPMAP_LINEAR)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_MIRRORED_REPEAT)
    GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
  }

  private fun ensureFramebuffers(w: Int, h: Int) {
    // Grow in steps so the buffers are not reallocated every frame.
    if (w <= fbW && h <= fbH && msFbo != 0) return
    val nw = max(w, fbW).let { ((it + 63) / 64) * 64 }
    val nh = max(h, fbH).let { ((it + 63) / 64) * 64 }
    if (msFbo != 0) {
      GLES30.glDeleteFramebuffers(2, intArrayOf(msFbo, outFbo), 0)
      GLES30.glDeleteRenderbuffers(3, intArrayOf(msColor, msDepth, outColor), 0)
    }
    val fb = IntArray(2)
    val rb = IntArray(3)
    GLES30.glGenFramebuffers(2, fb, 0)
    GLES30.glGenRenderbuffers(3, rb, 0)
    msFbo = fb[0]; outFbo = fb[1]
    msColor = rb[0]; msDepth = rb[1]; outColor = rb[2]
    val samples = 4
    GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, msColor)
    GLES30.glRenderbufferStorageMultisample(GLES30.GL_RENDERBUFFER, samples, GLES30.GL_RGBA8, nw, nh)
    GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, msDepth)
    GLES30.glRenderbufferStorageMultisample(GLES30.GL_RENDERBUFFER, samples, GLES30.GL_DEPTH_COMPONENT24, nw, nh)
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, msFbo)
    GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_RENDERBUFFER, msColor)
    GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_RENDERBUFFER, msDepth)
    GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, outColor)
    GLES30.glRenderbufferStorage(GLES30.GL_RENDERBUFFER, GLES30.GL_RGBA8, nw, nh)
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outFbo)
    GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_RENDERBUFFER, outColor)
    val status = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
    if (status != GLES30.GL_FRAMEBUFFER_COMPLETE) Log.e(TAG, "framebuffer incomplete $status")
    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    fbW = nw
    fbH = nh
    pixels = ByteBuffer.allocateDirect(nw * nh * 4).order(ByteOrder.nativeOrder())
  }

  private val locs = HashMap<String, Int>()

  private fun loc(name: String) = locs.getOrPut(name) { GLES30.glGetUniformLocation(program, name) }

  private fun buildProgram(vs: String, fs: String): Int {
    fun compile(type: Int, src: String): Int {
      val s = GLES30.glCreateShader(type)
      GLES30.glShaderSource(s, src)
      GLES30.glCompileShader(s)
      val ok = IntArray(1)
      GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, ok, 0)
      if (ok[0] == 0) {
        Log.e(TAG, "shader: " + GLES30.glGetShaderInfoLog(s))
        return 0
      }
      return s
    }
    val v = compile(GLES30.GL_VERTEX_SHADER, vs)
    val f = compile(GLES30.GL_FRAGMENT_SHADER, fs)
    if (v == 0 || f == 0) return 0
    val p = GLES30.glCreateProgram()
    GLES30.glAttachShader(p, v)
    GLES30.glAttachShader(p, f)
    GLES30.glBindAttribLocation(p, 0, "aPos")
    GLES30.glBindAttribLocation(p, 1, "aNrm")
    GLES30.glBindAttribLocation(p, 2, "aUv")
    GLES30.glBindAttribLocation(p, 3, "aOuter")
    GLES30.glLinkProgram(p)
    val ok = IntArray(1)
    GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, ok, 0)
    if (ok[0] == 0) {
      Log.e(TAG, "link: " + GLES30.glGetProgramInfoLog(p))
      return 0
    }
    return p
  }

  companion object {
    private const val TAG = "BandRenderer"
    private const val MAX_SIDE = 720f

    private const val VERT = """#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUv; in float aOuter;
uniform mat4 uModel; uniform mat4 uProj; uniform mat3 uNrm;
out vec3 vPos; out vec3 vNrm; out vec2 vUv; out float vOuter;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vPos = w.xyz;
  vNrm = uNrm * aNrm;
  vUv = aUv;
  vOuter = aOuter;
  gl_Position = uProj * w;
}"""

    // Polished-gold look: studio reflection + key light; the photo is used as colour on the outer
    // face, and its brightness as a bump map so engravings catch the light.
    private const val FRAG = """#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNrm; in vec2 vUv; in float vOuter;
uniform sampler2D uTex; uniform int uHasTex; uniform float uBump; uniform float uExposure; uniform int uFull;
out vec4 outColor;

vec3 studio(vec3 r) {
  float up = -r.y;                                   // view y points down
  vec3 c = mix(vec3(0.10, 0.07, 0.04), vec3(1.0, 0.96, 0.88), smoothstep(-0.45, 0.65, up));
  c += vec3(1.0, 0.93, 0.78) * 0.9 * exp(-pow((r.x + 0.45) / 0.16, 2.0)); // softbox stripe
  c += vec3(1.0, 0.95, 0.85) * 0.5 * exp(-pow((r.x - 0.55) / 0.10, 2.0));
  return c;
}

void main() {
  // Mesh s runs -0.5..1.5 around the band (0.5 = facing the camera).
  // Full 360 texture: map that range onto 0..1 once. Half texture: mirrored repeat.
  vec2 uv = uFull == 1 ? vec2((vUv.x + 0.5) * 0.5, vUv.y) : vUv;
  vec4 t = texture(uTex, uv);
  // Photo colour only on the outer face where the photo has the design; elsewhere polished gold.
  bool tex = uHasTex == 1 && vOuter > 0.5 && t.a > 0.4;
  vec3 n = normalize(vNrm);
  vec3 albedo = tex ? t.rgb / max(t.a, 0.001) : vec3(0.0);
  if (tex) {
    float h = dot(albedo, vec3(0.299, 0.587, 0.114)) * uBump;
    vec3 dpdx = dFdx(vPos), dpdy = dFdy(vPos);
    float dhx = dFdx(h), dhy = dFdy(h);
    vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
    float det = dot(dpdx, r1);
    vec3 g = sign(det) * (dhx * r1 + dhy * r2);
    n = normalize(abs(det) * n - g);
  }
  vec3 r = reflect(vec3(0.0, 0.0, 1.0), n);          // camera looks along +z
  vec3 L = normalize(vec3(-0.4, -0.7, -0.6));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(r, L), 0.0), 70.0);
  vec3 env = studio(r);
  vec3 gold = vec3(1.0, 0.77, 0.34);
  vec3 col;
  if (tex) {
    col = albedo * (0.55 + 0.45 * diff) + albedo * env * 0.35 + vec3(1.0, 0.95, 0.82) * spec * 0.7;
  } else {
    col = gold * env * 0.85 + gold * diff * 0.2 + vec3(1.0, 0.95, 0.82) * spec;
  }
  outColor = vec4(min(col * uExposure, vec3(1.0)), 1.0);
}"""
  }
}
