package com.jewelar

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.jewelar.ar.ARTryOnViewManager
import com.jewelar.bgremover.BackgroundRemoverModule
import com.jewelar.inbox.SharedImagesModule
import com.jewelar.share.JewelShareModule

/** Registers our own native code: background remover + AR try-on view. */
class JewelARPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      when (name) {
        BackgroundRemoverModule.NAME -> BackgroundRemoverModule(reactContext)
        JewelShareModule.NAME -> JewelShareModule(reactContext)
        SharedImagesModule.NAME -> SharedImagesModule(reactContext)
        else -> null
      }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    listOf(BackgroundRemoverModule.NAME, JewelShareModule.NAME, SharedImagesModule.NAME).associateWith { name ->
      ReactModuleInfo(
          name,
          name,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // isCxxModule
          true, // isTurboModule
      )
    }
  }

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<in Nothing, in Nothing>> = listOf(ARTryOnViewManager())
}
