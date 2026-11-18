package com.jewelar.ar

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class TrackingChangeEvent(surfaceId: Int, viewId: Int, private val tracking: Boolean) :
    Event<TrackingChangeEvent>(surfaceId, viewId) {

  override fun getEventName() = EVENT_NAME

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply { putBoolean("tracking", tracking) }

  companion object {
    const val EVENT_NAME = "topTrackingChange"
  }
}
