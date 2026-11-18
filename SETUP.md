# JewelAR – setup

Jewellery shop app with live AR try-on. React Native CLI + Supabase. No paid libraries.

## 1. Install tools (one time)

| Tool | Version | Notes |
|---|---|---|
| Node.js | **22.13+** (LTS 22 or 24) | React Native 0.88 does not support Node 20 |
| JDK | **17** (or 21) | e.g. Eclipse Temurin / Microsoft OpenJDK. Set `JAVA_HOME` to it |
| Android SDK | already installed | Set `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` and add `%ANDROID_HOME%\platform-tools` to `PATH` |
| Android phone | real device, USB debugging on | The AR camera does not work well in an emulator |

## 2. Supabase (free)

1. Create a project at supabase.com.
2. **SQL Editor** → paste `supabase/schema.sql` → Run.
3. **SQL Editor** → paste `supabase/02_owners.sql` → Run.
4. **Authentication → Sign In / Providers → Email**: turn off **"Confirm email"**
   (the free plan's built-in email sending is very limited).
5. **Project Settings → API Keys**: copy the URL and anon (publishable) key into `src/config.ts`.
6. In the app: **My Shop → Sign up** → **Set up my shop**. The first account becomes the owner.
   More owners: they sign up, then an owner adds their email in **My Shop → Team**.

## 3. Run

```bash
npm install
npm start            # terminal 1 – Metro
npm run android      # terminal 2 – builds and installs on the phone
```

## How it works

| Part | Where | Tech |
|---|---|---|
| AR try-on view | `android/app/src/main/java/com/jewelar/ar/` | CameraX + MediaPipe Face/Hand Landmarker (on-device) |
| Placement tuning | `ar/JewelPlacer.kt` | landmark indices + size constants per body part |
| Background removal | `bgremover/BackgroundRemoverModule.kt` | Google ML Kit Subject Segmentation (on-device) |
| JS ↔ native contracts | `specs/` | React Native codegen (New Architecture) |
| Screens | `src/screens/` | Home, Detail, TryOn, Owner (login/dashboard), Editor |
| Backend | `src/lib/supabase.ts` | Supabase DB + Storage + Auth |

## Owner flow
My Shop tab → sign in → **+** → take photo → background removed automatically →
choose body part → tap the attach point → adjust size → **Preview on me** → **Add to shop**.

## Notes
- First background removal may fail with "waiting for model" while Google Play services downloads the model – wait a minute and retry.
- Earring/necklace positions are first estimates. Tune the numbers in `JewelPlacer.kt` on a real phone.
- iOS: the screens work, but the native AR view and background remover are Android-only for now (needs a Swift version, built on a Mac).
