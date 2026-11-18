package com.jewelar.ar

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/** Result of the capture() command: uri on success, error message on failure. */
class CaptureEvent(
    surfaceId: Int,
    viewId: Int,
    private val uri: String,
    private val error: String,
) : Event<CaptureEvent>(surfaceId, viewId) {

  override fun getEventName() = EVENT_NAME

  override fun canCoalesce() = false

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putString("uri", uri)
        putString("error", error)
      }

  companion object {
    const val EVENT_NAME = "topCapture"
  }
}
