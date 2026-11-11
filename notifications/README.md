# Marine Comeback notifications

Deployment is pending hosting authorization. The website continues to use its existing GitHub Pages address. Deploy this directory as a separate Vercel API project, using the committed lockfile and Node.js 22 or later.

Connect a **private** Blob store to the API project. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as production environment variables using a newly generated Web Push VAPID key pair. Keep the private key on the server. Blob credentials must also remain server-side. Provisioning a store through Vercel creates the storage environment variables.

The private scheduled function `api/daily` sends the reminder daily at 16:00 in `America/Chicago`, including weekends and daylight saving changes. Vercel Schedules applies dispatch jitter. Hobby uses a 15-minute window, while Pro defaults to one minute. Do not describe delivery as exact to the minute.

After deployment, verify `/api/push` returns `ready: true`, then set `serviceURL` in the website's `reminder-config.json` to the production API origin. Leave it empty until the service is ready. The app requests notification permission only when the user taps **Enable 4 p.m. reminder**, sends a confirmation notification, and stores the browser subscription privately. Only subscription credentials go to this service. Workout logs, location, and photos stay on the device.

Verify on the actual iPhone using the existing Home Screen icon. Enable notifications, close the app, confirm a notification arrives, and tap it to open the goblin video. Turn reminders off and confirm the server registration is removed. Verify the scheduled delivery separately. Keep the temporary ChatGPT reminder until device delivery is confirmed.

This service does not supply background GPS. The existing native iOS tracker is still required for run tracking and spoken distance cues after iPhone lock. Its signing, installation, and device test remain unresolved.

Run `npm ci` and `npm test` to check subscription validation, Central Time dates, concurrent delivery deduplication, expiry cleanup, and failed-send recovery.
