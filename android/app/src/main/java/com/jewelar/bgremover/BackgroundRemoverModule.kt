package com.jewelar.bgremover

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import com.facebook.fbreact.specs.NativeBackgroundRemoverSpec
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * On-device background removal with Google ML Kit Subject Segmentation (free).
 * Returns a transparent PNG trimmed to the jewellery's bounding box.
 */
@ReactModule(name = BackgroundRemoverModule.NAME)
class BackgroundRemoverModule(private val ctx: ReactApplicationContext) :
    NativeBackgroundRemoverSpec(ctx) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName() = NAME

  override fun removeBackground(uri: String, promise: Promise) {
    executor.execute {
      try {
        val input = loadUpright(Uri.parse(uri), 1600)
        val segmenter =
            SubjectSegmentation.getClient(
                SubjectSegmenterOptions.Builder().enableForegroundBitmap().build())
        segmenter
            .process(InputImage.fromBitmap(input, 0))
            .addOnSuccessListener(executor) { result ->
              try {
                val fg = result.foregroundBitmap
                if (fg == null) {
                  promise.reject("NO_SUBJECT", "Could not find the jewellery in this photo")
                  return@addOnSuccessListener
                }
                val trimmed = trimTransparent(fg)
                val out = File(ctx.cacheDir, "jewel_${System.currentTimeMillis()}.png")
                FileOutputStream(out).use { trimmed.compress(Bitmap.CompressFormat.PNG, 100, it) }
                promise.resolve(
                    Arguments.createMap().apply {
                      putString("uri", Uri.fromFile(out).toString())
                      putDouble("width", trimmed.width.toDouble())
                      putDouble("height", trimmed.height.toDouble())
                    })
              } catch (e: Exception) {
                promise.reject("SAVE_FAILED", e.message, e)
              } finally {
                segmenter.close()
              }
            }
            .addOnFailureListener(executor) { e ->
              segmenter.close()
              // First run may fail while Google Play services downloads the model.
              promise.reject("SEGMENT_FAILED", e.message ?: "Background removal failed", e)
            }
      } catch (e: Exception) {
        promise.reject("LOAD_FAILED", e.message, e)
      }
    }
  }

  override fun cropImage(
      uri: String,
      left: Double,
      top: Double,
      right: Double,
      bottom: Double,
      promise: Promise
  ) {
    executor.execute {
      try {
        val src = loadUpright(Uri.parse(uri), 2000)
        fun cx(v: Double) = (v.coerceIn(0.0, 1.0) * src.width).toInt()
        fun cy(v: Double) = (v.coerceIn(0.0, 1.0) * src.height).toInt()
        val x0 = cx(minOf(left, right))
        val y0 = cy(minOf(top, bottom))
        val w = (cx(maxOf(left, right)) - x0).coerceAtLeast(1).coerceAtMost(src.width - x0)
        val h = (cy(maxOf(top, bottom)) - y0).coerceAtLeast(1).coerceAtMost(src.height - y0)
        val out = Bitmap.createBitmap(src, x0, y0, w, h)
        val file = File(ctx.cacheDir, "crop_${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        promise.resolve(
            Arguments.createMap().apply {
              putString("uri", Uri.fromFile(file).toString())
              putDouble("width", out.width.toDouble())
              putDouble("height", out.height.toDouble())
            })
      } catch (e: Exception) {
        promise.reject("CROP_FAILED", e.message ?: "Could not read this photo", e)
      }
    }
  }

  /** Decode, downscale to [max] px and apply EXIF rotation. */
  private fun loadUpright(uri: Uri, max: Int): Bitmap {
    val cr = ctx.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    cr.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= max) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bmp = cr.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, opts) }!!

    val rotation =
        cr.openInputStream(uri)?.use {
          when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
          }
        } ?: 0f
    if (rotation == 0f) return bmp
    val m = Matrix().apply { postRotate(rotation) }
    return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
  }

  private fun trimTransparent(b: Bitmap): Bitmap {
    val w = b.width
    val h = b.height
    val px = IntArray(w * h)
    b.getPixels(px, 0, w, 0, 0, w, h)
    var minX = w
    var minY = h
    var maxX = -1
    var maxY = -1
    for (y in 0 until h) {
      for (x in 0 until w) {
        if ((px[y * w + x] ushr 24) > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return b
    val pad = 4
    minX = (minX - pad).coerceAtLeast(0)
    minY = (minY - pad).coerceAtLeast(0)
    maxX = (maxX + pad).coerceAtMost(w - 1)
    maxY = (maxY + pad).coerceAtMost(h - 1)
    return Bitmap.createBitmap(b, minX, minY, maxX - minX + 1, maxY - minY + 1)
  }

  companion object {
    const val NAME = "BackgroundRemover"
  }
}
