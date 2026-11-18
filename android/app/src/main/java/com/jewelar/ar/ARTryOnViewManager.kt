package com.jewelar.ar

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ARTryOnViewManagerDelegate
import com.facebook.react.viewmanagers.ARTryOnViewManagerInterface

@ReactModule(name = ARTryOnViewManager.NAME)
class ARTryOnViewManager : SimpleViewManager<ARTryOnView>(), ARTryOnViewManagerInterface<ARTryOnView> {

  private val delegate: ViewManagerDelegate<ARTryOnView> = ARTryOnViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ARTryOnView> = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = ARTryOnView(context)

  @ReactProp(name = "imageUrl")
  override fun setImageUrl(view: ARTryOnView, value: String?) = view.setImageUrl(value)

  @ReactProp(name = "bodyPart")
  override fun setBodyPart(view: ARTryOnView, value: String?) = view.setBodyPart(value)

  @ReactProp(name = "anchorX", defaultFloat = 0.5f)
  override fun setAnchorX(view: ARTryOnView, value: Float) = view.setAnchor(x = value)

  @ReactProp(name = "anchorY", defaultFloat = 0f)
  override fun setAnchorY(view: ARTryOnView, value: Float) = view.setAnchor(y = value)

  @ReactProp(name = "sizeScale", defaultFloat = 1f)
  override fun setSizeScale(view: ARTryOnView, value: Float) = view.setSizeScale(value)

  @ReactProp(name = "cameraFacing")
  override fun setCameraFacing(view: ARTryOnView, value: String?) = view.setCameraFacing(value)

  @ReactProp(name = "watermark")
  override fun setWatermark(view: ARTryOnView, value: String?) = view.setWatermark(value)

  @ReactProp(name = "band3d", defaultBoolean = false)
  override fun setBand3d(view: ARTryOnView, value: Boolean) = view.setBand3d(value)

  @ReactProp(name = "bandInnerMm", defaultFloat = 0f)
  override fun setBandInnerMm(view: ARTryOnView, value: Float) = view.setBandInnerMm(value)

  @ReactProp(name = "bandThickMm", defaultFloat = 0f)
  override fun setBandThickMm(view: ARTryOnView, value: Float) = view.setBandThickMm(value)

  @ReactProp(name = "bandProfile")
  override fun setBandProfile(view: ARTryOnView, value: String?) = view.setBandProfile(value)

  override fun capture(view: ARTryOnView) = view.capture()

  override fun onDropViewInstance(view: ARTryOnView) {
    super.onDropViewInstance(view)
    view.release()
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf(
          TrackingChangeEvent.EVENT_NAME to mapOf("registrationName" to "onTrackingChange"),
          CaptureEvent.EVENT_NAME to mapOf("registrationName" to "onCapture"),
      )

  companion object {
    const val NAME = "ARTryOnView"
  }
}
