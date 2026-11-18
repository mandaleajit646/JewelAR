package com.jewelar.inbox

import com.facebook.fbreact.specs.NativeSharedImagesSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

/** Hands photos shared into the app over to JS. Emits "SharedImages" when new ones arrive. */
@ReactModule(name = SharedImagesModule.NAME)
class SharedImagesModule(private val ctx: ReactApplicationContext) : NativeSharedImagesSpec(ctx) {

  init {
    SharedInbox.listener = {
      if (ctx.hasActiveReactInstance()) ctx.emitDeviceEvent(EVENT, null)
    }
  }

  override fun getName() = NAME

  override fun takeSharedImages(promise: Promise) {
    val list = Arguments.createArray()
    for ((uri, mime) in SharedInbox.take()) {
      list.pushMap(Arguments.createMap().apply {
        putString("uri", uri)
        putString("mime", mime)
      })
    }
    promise.resolve(list)
  }

  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}

  override fun invalidate() {
    SharedInbox.listener = null
    super.invalidate()
  }

  companion object {
    const val NAME = "SharedImages"
    const val EVENT = "SharedImages"
  }
}
