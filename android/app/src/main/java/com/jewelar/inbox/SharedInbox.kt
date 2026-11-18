package com.jewelar.inbox

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.IntentCompat
import java.io.File

/**
 * Photos shared into the app (WhatsApp, Gallery...). They are copied into our cache straight away,
 * because the read permission for the shared content:// uris ends when the activity goes away.
 */
object SharedInbox {
  private const val TAG = "SharedInbox"
  private val pending = mutableListOf<Pair<String, String>>() // file uri, mime
  /** Set by the native module; called when new photos are ready. */
  @Volatile var listener: (() -> Unit)? = null

  fun handle(activity: Activity, intent: Intent?) {
    if (intent == null) return
    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
    val uris = mutableListOf<Uri>()
    if (action == Intent.ACTION_SEND) {
      IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris += it }
    } else {
      IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris += it }
    }
    intent.clipData?.let { cd -> for (i in 0 until cd.itemCount) cd.getItemAt(i).uri?.let { if (it !in uris) uris += it } }
    // Handled: don't import the same photos again if the activity is re-created.
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(Intent.EXTRA_STREAM)
    intent.clipData = null
    if (uris.isEmpty()) return

    val ctx = activity.applicationContext
    val cr = activity.contentResolver
    Thread {
      val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
      // Clear old imports (older than 2 days).
      val old = System.currentTimeMillis() - 2 * 24 * 3600 * 1000L
      dir.listFiles()?.forEach { if (it.lastModified() < old) it.delete() }
      val got = mutableListOf<Pair<String, String>>()
      for ((i, u) in uris.withIndex()) {
        try {
          val mime = cr.getType(u) ?: intent.type ?: "image/jpeg"
          if (!mime.startsWith("image/")) continue
          val ext = if (mime.contains("png")) "png" else if (mime.contains("webp")) "webp" else "jpg"
          val out = File(dir, "s${System.currentTimeMillis()}_$i.$ext")
          cr.openInputStream(u)?.use { input -> out.outputStream().use { input.copyTo(it) } } ?: continue
          got += Uri.fromFile(out).toString() to mime
        } catch (e: Exception) {
          Log.w(TAG, "could not read shared photo $u", e)
        }
      }
      Log.i(TAG, "imported ${got.size} of ${uris.size} shared photos")
      if (got.isEmpty()) return@Thread
      synchronized(pending) { pending += got }
      listener?.invoke()
    }.start()
  }

  fun take(): List<Pair<String, String>> =
      synchronized(pending) { pending.toList().also { pending.clear() } }
}
