package com.jewelar.ar

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.jewelar.ar3d.BandFit
import com.jewelar.ar3d.BandRenderer
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Live camera + on-device face/hand tracking + jewellery overlay.
 * Everything runs on the phone - no server, no paid SDK.
 */
class ARTryOnView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {

  private val previewView =
      PreviewView(reactContext).apply {
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
      }
  private val overlay = JewelOverlayView(reactContext)

  private var cameraProvider: ProcessCameraProvider? = null
  private var analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private val ioExecutor: ExecutorService = Executors.newSingleThreadExecutor()

  // Landmarkers are created and used only on analysisExecutor.
  private var faceLandmarker: FaceLandmarker? = null
  private var handLandmarker: HandLandmarker? = null

  @Volatile private var bodyPart = "ear"
  @Volatile private var sizeScale = 1f
  private var facing = "front"
  private var watermark: String? = null
  private var imageUrl: String? = null
  private var attached = false
  private var lastTracking: Boolean? = null

  private val filters = List(2) { List(4) { OneEuroFilter() } }

  // ---- 3D bands (bangles, kadas, rings) ----
  @Volatile private var band3d = false
  @Volatile private var bandInnerMm = 0f
  @Volatile private var bandThickMm = 0f
  @Volatile private var bandProfile = "dome"
  @Volatile private var bandTexture: Bitmap? = null
  @Volatile private var bandAspect: Float? = null
  @Volatile private var bandTextureFull = false
  private var bandRenderer: BandRenderer? = null // analysis thread only
  private var bandGlFailed = false
  private val bandFilters = List(7) { OneEuroFilter() }

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(overlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  // ---- props ----

  fun setImageUrl(url: String?) {
    if (url == imageUrl) return
    imageUrl = url
    overlay.jewel = null
    bandTexture = null
    if (url.isNullOrEmpty()) return
    ioExecutor.execute {
      val bmp = loadBitmap(url)
      // Unwrapped design strip for the 3D band (cheap; only used when band3d is on).
      if (bmp != null && url == imageUrl) {
        try {
          // Only a clean side-on strip photo can be wrapped; anything else -> plain polished gold band.
          val aspect = bmp.height.toFloat() / bmp.width.toFloat()
          val usable = BandFit.isStrip(bmp)
          Log.i(TAG, "band photo ${bmp.width}x${bmp.height} strip=$usable")
          bandAspect = if (usable) aspect else null
          // Strip photo -> front-half texture (mirrored round the back).
          // Any other product photo -> unroll the ellipse into a full 360-degree design strip.
          val full = if (usable) null else BandFit.unrollEllipse(bmp)
          bandTextureFull = full != null
          bandTexture = if (usable) BandFit.unwrap(bmp) else full
          Log.i(TAG, "band texture: ${if (usable) "strip" else if (full != null) "unrolled 360" else "none (plain gold)"}")
        } catch (e: Exception) {
          Log.w(TAG, "unwrap failed", e)
        }
      }
      post {
        if (url == imageUrl) {
          overlay.jewel = bmp
          overlay.invalidate()
        }
      }
    }
  }

  fun setBodyPart(part: String?) {
    bodyPart = part ?: "ear"
    resetFilters()
    overlay.clear()
  }

  fun setAnchor(x: Float? = null, y: Float? = null) {
    x?.let { overlay.anchorX = it }
    y?.let { overlay.anchorY = it }
    overlay.invalidate()
  }

  fun setSizeScale(s: Float) {
    sizeScale = if (s > 0f) s else 1f
  }

  fun setWatermark(w: String?) {
    watermark = w
  }

  fun setBand3d(on: Boolean) {
    band3d = on
    resetFilters()
    overlay.clear()
  }

  fun setBandInnerMm(v: Float) {
    bandInnerMm = v
  }

  fun setBandThickMm(v: Float) {
    bandThickMm = v
  }

  fun setBandProfile(p: String?) {
    bandProfile = p?.takeIf { it.isNotEmpty() } ?: "dome"
  }

  // ---- capture (snap & share) ----

  /** Saves camera frame + jewellery overlay + watermark as a JPEG; result via onCapture. */
  fun capture() {
    val frame = previewView.bitmap
    if (frame == null || width == 0 || height == 0) {
      emitCapture(null, "Camera is not ready yet")
      return
    }
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawBitmap(frame, null, Rect(0, 0, width, height), null)
    overlay.draw(canvas)
    watermark?.takeIf { it.isNotBlank() }?.let { drawWatermark(canvas, it) }

    ioExecutor.execute {
      try {
        val dir = File(reactContext.cacheDir, "captures").apply { mkdirs() }
        val file = File(dir, "tryon_${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        post { emitCapture(Uri.fromFile(file).toString(), null) }
      } catch (e: Exception) {
        post { emitCapture(null, e.message ?: "Could not save photo") }
      }
    }
  }

  private fun drawWatermark(canvas: Canvas, text: String) {
    val d = resources.displayMetrics.density
    val paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.WHITE
          textSize = 15 * d
          typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
        }
    val label = "✦ $text" // ✦
    val padX = 14 * d
    val padY = 9 * d
    val textW = paint.measureText(label)
    val fm = paint.fontMetrics
    val boxH = (fm.descent - fm.ascent) + padY * 2
    val left = 16 * d
    val bottom = canvas.height - 16 * d
    val box = RectF(left, bottom - boxH, left + textW + padX * 2, bottom)
    val bg =
        Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(120, 20, 14, 6) }
    val border =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          style = Paint.Style.STROKE
          strokeWidth = 1 * d
          color = Color.argb(200, 217, 173, 85)
        }
    canvas.drawRoundRect(box, boxH / 2, boxH / 2, bg)
    canvas.drawRoundRect(box, boxH / 2, boxH / 2, border)
    canvas.drawText(label, left + padX, bottom - padY - fm.descent, paint)
  }

  private fun emitCapture(uri: String?, error: String?) {
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
    dispatcher.dispatchEvent(
        CaptureEvent(UIManagerHelper.getSurfaceId(reactContext), id, uri ?: "", error ?: ""))
  }

  fun setCameraFacing(f: String?) {
    val newFacing = if (f == "back") "back" else "front"
    if (newFacing == facing) return
    facing = newFacing
    resetFilters()
    overlay.clear()
    if (attached) bindCamera()
  }

  // ---- lifecycle ----

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    if (analysisExecutor.isShutdown) analysisExecutor = Executors.newSingleThreadExecutor()
    val future = ProcessCameraProvider.getInstance(reactContext)
    future.addListener(
        {
          cameraProvider = future.get()
          if (attached) bindCamera()
        },
        ContextCompat.getMainExecutor(reactContext),
    )
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    attached = false
    release()
  }

  fun release() {
    cameraProvider?.unbindAll()
    if (!analysisExecutor.isShutdown) {
      analysisExecutor.execute {
        faceLandmarker?.close()
        handLandmarker?.close()
        faceLandmarker = null
        handLandmarker = null
        bandRenderer?.release()
        bandRenderer = null
      }
      analysisExecutor.shutdown()
    }
  }

  // React Native does not lay out natively-added children; do it ourselves.
  private val measureAndLayout = Runnable {
    measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    layout(left, top, right, bottom)
  }

  override fun requestLayout() {
    super.requestLayout()
    post(measureAndLayout)
  }

  // ---- camera ----

  private fun bindCamera() {
    val provider = cameraProvider ?: return
    val owner = reactContext.currentActivity as? LifecycleOwner ?: return

    // Preview and analysis must share the same aspect ratio, or the overlay drifts off the body.
    val preview =
        Preview.Builder()
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .build())
            .build()
            .also { it.setSurfaceProvider(previewView.surfaceProvider) }

    val resolution =
        ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(
                ResolutionStrategy(
                    Size(640, 480),
                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                ))
            .build()

    val analysis =
        ImageAnalysis.Builder()
            .setResolutionSelector(resolution)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
    analysis.setAnalyzer(analysisExecutor) { proxy ->
      try {
        processFrame(proxy)
      } catch (e: Exception) {
        Log.w(TAG, "frame failed", e)
      } finally {
        proxy.close()
      }
    }

    val selector =
        if (facing == "back") CameraSelector.DEFAULT_BACK_CAMERA
        else CameraSelector.DEFAULT_FRONT_CAMERA
    try {
      provider.unbindAll()
      provider.bindToLifecycle(owner, selector, preview, analysis)
    } catch (e: Exception) {
      Log.e(TAG, "camera bind failed", e)
    }
  }

  // ---- tracking (runs on analysisExecutor) ----

  private fun processFrame(proxy: ImageProxy) {
    val part = bodyPart
    val isFront = facing == "front"
    val src = proxy.toBitmap()
    val m = Matrix().apply {
      postRotate(proxy.imageInfo.rotationDegrees.toFloat())
      // Front preview is mirrored, so mirror the frame too -> landmarks line up with the screen.
      if (isFront) postScale(-1f, 1f)
    }
    val frame = Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, false)
    val image = BitmapImageBuilder(frame).build()
    val ts = SystemClock.uptimeMillis()
    val w = frame.width
    val h = frame.height

    if (band3d && JewelPlacer.isHandPart(part) && !bandGlFailed) {
      processBand3d(part, image, frame, ts, w, h)
      return
    }

    val raw: List<Placement?> =
        if (JewelPlacer.isHandPart(part)) {
          val lm = ensureHand().detectForVideo(image, ts).landmarks().firstOrNull()
          if (lm == null) emptyList() else JewelPlacer.hand(part, lm, w, h, sizeScale)
        } else {
          val lm = ensureFace().detectForVideo(image, ts).faceLandmarks().firstOrNull()
          if (lm == null) emptyList() else JewelPlacer.face(part, lm, w, h, sizeScale)
        }

    val tracking = raw.any { it != null }
    if (!tracking) resetFilters()
    val smooth = raw.mapIndexed { i, p -> p?.let { smoothPlacement(i, it, ts) } }

    post {
      overlay.update(smooth, w, h)
      emitTracking(tracking)
    }
  }

  private val lastAngle = DoubleArray(2) { Double.NaN }
  private var lastLog = 0L

  private fun smoothPlacement(slot: Int, p: Placement, ts: Long): Placement {
    val f = filters[slot]
    // Unwrap the angle so going past +/-180 degrees does not make the filter spin the piece around.
    var a = p.angleDeg.toDouble()
    val prev = lastAngle[slot]
    if (!prev.isNaN()) {
      while (a - prev > 180) a -= 360
      while (a - prev < -180) a += 360
    }
    lastAngle[slot] = a
    val out = Placement(
        f[0].filter(p.x.toDouble(), ts).toFloat(),
        f[1].filter(p.y.toDouble(), ts).toFloat(),
        f[2].filter(p.width.toDouble(), ts).toFloat(),
        f[3].filter(a, ts).toFloat(),
    )
    if (ts - lastLog > 1000) {
      lastLog = ts
      Log.i(TAG, "place part=$bodyPart raw=$p smooth=$out anchor=${overlay.anchorX},${overlay.anchorY}")
    }
    return out
  }

  private fun resetFilters() {
    filters.forEach { s -> s.forEach { it.reset() } }
    bandFilters.forEach { it.reset() }
    lastAngle.fill(Double.NaN)
  }

  /** 3D band: hand pose -> OpenGL render -> bitmap drawn by the overlay. */
  private var exposure = 1f

  /** Average brightness (0..1) of the camera frame around a point, so the gold matches the room light. */
  private fun sceneBrightness(frame: Bitmap, x: Float, y: Float, r: Float): Float {
    var sum = 0f
    var n = 0
    for (i in -3..3) for (j in -3..3) {
      val px = (x + i * r / 3f).toInt()
      val py = (y + j * r / 3f).toInt()
      if (px !in 0 until frame.width || py !in 0 until frame.height) continue
      val c = frame.getPixel(px, py)
      sum += (0.299f * Color.red(c) + 0.587f * Color.green(c) + 0.114f * Color.blue(c)) / 255f
      n++
    }
    return if (n == 0) 0.5f else sum / n
  }

  private fun processBand3d(
      part: String,
      image: com.google.mediapipe.framework.image.MPImage,
      cameraFrame: Bitmap,
      ts: Long,
      w: Int,
      h: Int,
  ) {
    val result = ensureHand().detectForVideo(image, ts)
    val lm = result.landmarks().firstOrNull()
    val raw = lm?.let { BandFit.raw(part, it, result.worldLandmarks().firstOrNull(), w, h) }
    val vw = width
    val vh = height
    if (raw == null || vw == 0 || vh == 0) {
      resetFilters()
      post {
        overlay.clear()
        emitTracking(false)
      }
      return
    }
    val f = bandFilters
    val v = floatArrayOf(raw.cx, raw.cy, raw.cz, raw.ax, raw.ay, raw.az, raw.pxPerMm)
    val sm = FloatArray(7) { f[it].filter(v[it].toDouble(), ts).toFloat() }

    // Frame pixels -> view pixels (same mapping as PreviewView FILL_CENTER).
    val s = maxOf(vw.toFloat() / w, vh.toFloat() / h)
    val dx = (vw - w * s) / 2f
    val dy = (vh - h * s) / 2f
    val pose = BandFit.pose(dx + sm[0] * s, dy + sm[1] * s, sm[2] * s, sm[3], sm[4], sm[5], sm[6] * s * sizeScale)
    val spec = BandFit.spec(
        if (bandInnerMm > 0f) bandInnerMm else if (part == "finger") 17.3f else 60.3f,
        bandThickMm, bandProfile, bandAspect)

    val renderer = bandRenderer ?: BandRenderer().also {
      if (!it.init()) {
        Log.e(TAG, "OpenGL ES 3 not available - falling back to flat try-on")
        bandGlFailed = true
        return
      }
      bandRenderer = it
    }
    // Match the room: dim scene -> darker gold, bright scene -> full shine (smoothed over time).
    val lum = sceneBrightness(cameraFrame, sm[0], sm[1], spec.innerR * 2.5f * sm[6])
    val target = (0.35f + 1.1f * lum).coerceIn(0.6f, 1.1f)
    exposure += (target - exposure) * 0.15f
    renderer.exposure = exposure
    renderer.fullTexture = bandTextureFull
    val frame = try {
      renderer.render(spec, bandTexture, pose, vw, vh)
    } catch (e: Exception) {
      Log.e(TAG, "band render failed", e)
      null
    }
    if (ts - lastLog > 1000) {
      lastLog = ts
      Log.i(TAG, "band part=$part spec=${spec.innerR * 2}mm w=${spec.width} t=${spec.thick} " +
          "pxPerMm=${pose.pxPerMm} c=${pose.cx},${pose.cy} tilt=${BandFit.tiltDeg(pose.az)} light=$lum exp=$exposure")
    }
    post {
      overlay.updateBand(frame)
      emitTracking(true)
    }
  }

  private fun ensureFace(): FaceLandmarker =
      faceLandmarker
          ?: FaceLandmarker.createFromOptions(
                  reactContext,
                  FaceLandmarker.FaceLandmarkerOptions.builder()
                      .setBaseOptions(
                          BaseOptions.builder().setModelAssetPath("face_landmarker.task").build())
                      .setRunningMode(RunningMode.VIDEO)
                      .setNumFaces(1)
                      .build())
              .also { faceLandmarker = it }

  private fun ensureHand(): HandLandmarker =
      handLandmarker
          ?: HandLandmarker.createFromOptions(
                  reactContext,
                  HandLandmarker.HandLandmarkerOptions.builder()
                      .setBaseOptions(
                          BaseOptions.builder().setModelAssetPath("hand_landmarker.task").build())
                      .setRunningMode(RunningMode.VIDEO)
                      .setNumHands(1)
                      .build())
              .also { handLandmarker = it }

  private fun emitTracking(tracking: Boolean) {
    if (tracking == lastTracking) return
    lastTracking = tracking
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
    dispatcher.dispatchEvent(
        TrackingChangeEvent(UIManagerHelper.getSurfaceId(reactContext), id, tracking))
  }

  // ---- image loading ----

  private fun loadBitmap(url: String): Bitmap? =
      try {
        val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
        when {
          url.startsWith("http") -> URL(url).openStream().use { BitmapFactory.decodeStream(it, null, opts) }
          url.startsWith("file://") -> BitmapFactory.decodeFile(File(Uri.parse(url).path!!).path, opts)
          url.startsWith("content://") ->
              reactContext.contentResolver.openInputStream(Uri.parse(url))?.use {
                BitmapFactory.decodeStream(it, null, opts)
              }
          else -> BitmapFactory.decodeFile(url, opts)
        }?.let { downscale(it, 1024) }
      } catch (e: Exception) {
        Log.e(TAG, "could not load jewel image $url", e)
        null
      }

  private fun downscale(b: Bitmap, max: Int): Bitmap {
    val big = maxOf(b.width, b.height)
    if (big <= max) return b
    val s = max.toFloat() / big
    return Bitmap.createScaledBitmap(b, (b.width * s).toInt(), (b.height * s).toInt(), true)
  }

  companion object {
    private const val TAG = "ARTryOnView"
  }
}
