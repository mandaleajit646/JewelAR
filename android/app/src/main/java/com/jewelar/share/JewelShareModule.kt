package com.jewelar.share

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.fbreact.specs.NativeJewelShareSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.io.File

/** Share a captured try-on photo (WhatsApp etc.) or save it to the gallery. */
@ReactModule(name = JewelShareModule.NAME)
class JewelShareModule(private val ctx: ReactApplicationContext) : NativeJewelShareSpec(ctx) {

  override fun getName() = NAME

  override fun shareImage(uri: String, message: String, promise: Promise) {
    try {
      val file = fileFrom(uri)
      val contentUri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
      val send =
          Intent(Intent.ACTION_SEND).apply {
            type = "image/jpeg"
            putExtra(Intent.EXTRA_STREAM, contentUri)
            if (message.isNotBlank()) putExtra(Intent.EXTRA_TEXT, message)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
      val chooser =
          Intent.createChooser(send, "Share try-on photo").apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
      val activity = ctx.currentActivity
      if (activity != null) {
        activity.startActivity(chooser)
      } else {
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(chooser)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SHARE_FAILED", e.message ?: "Could not share", e)
    }
  }

  override fun saveToGallery(uri: String, album: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("UNSUPPORTED", "Saving needs Android 10 or newer. Use Share instead.")
      return
    }
    try {
      val file = fileFrom(uri)
      val values =
          ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, file.name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(
                MediaStore.Images.Media.RELATIVE_PATH,
                "${Environment.DIRECTORY_PICTURES}/${album.ifBlank { "JewelAR" }}",
            )
            put(MediaStore.Images.Media.IS_PENDING, 1)
          }
      val resolver = ctx.contentResolver
      val item =
          resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
              ?: throw IllegalStateException("Could not create gallery item")
      resolver.openOutputStream(item)!!.use { out -> file.inputStream().use { it.copyTo(out) } }
      values.clear()
      values.put(MediaStore.Images.Media.IS_PENDING, 0)
      resolver.update(item, values, null, null)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SAVE_FAILED", e.message ?: "Could not save photo", e)
    }
  }

  private fun fileFrom(uri: String): File {
    val path = Uri.parse(uri).path ?: throw IllegalArgumentException("Bad file uri")
    val file = File(path)
    require(file.exists()) { "Photo not found" }
    return file
  }

  companion object {
    const val NAME = "JewelShare"
  }
}
