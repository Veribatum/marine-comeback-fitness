# Marine Comeback for iPhone

Open `MarineComeback.xcodeproj` in Xcode. Select your Apple team under Signing & Capabilities, choose your iPhone as the destination, and run the **MarineComeback** target. The target uses the existing Marine Comeback website as its interface and native Core Location and audio for run tracking.

For a first install, transfer your existing logs before recording new workouts. In the Home Screen web app, use **Backup / Restore → Export Backup** and copy the JSON. In the installed iOS app, paste it into **Backup / Restore** and select **Import Backup**. This replaces the destination's workout logs and settings. If you use progress photos or want to carry over the XP history, also export and import the separate **Your journey & photo comparisons** backup.

On iPhone, grant **While Using the App** with **Precise Location** on. Start a run in **Fitness → Run** and wait for **GPS tracking**. For the device acceptance test, play music, lock the phone, and verify the half-mile cue and a full-mile pace, total time, and average pace cue. Check that music dips during the cue and returns afterward. Unlock and tap **Finish & Save** to verify the result is recorded once with the run notes.

Unsigned build check from the repository root:

```sh
xcodebuild -project ios/MarineComeback.xcodeproj -target MarineComeback \
  -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```
