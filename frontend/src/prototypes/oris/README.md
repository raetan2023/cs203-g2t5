# Oris-inspired login exploration

Private, isolated visual prototype on `feature/ui-revamp-cinematic`.

From `frontend`:

```sh
npx vite --config vite.oris.config.ts
```

Open http://127.0.0.1:5174/oris.html. No backend or Clerk key is needed.
Use a sample email and any nonempty sample password. Sign-in and account creation
use the existing in-memory mock auth service; no credentials are sent or persisted.
Social buttons explain that OAuth is not connected. Successful submission stays
inside this preview. Production routing, authentication, styles and build entry
are unchanged. This separate presentation component is exploratory, not a new
production authentication implementation.

```sh
npm test -- --run src/prototypes/oris/OrisLogin.test.tsx
npx tsc --noEmit
npx vite build --config vite.oris.config.ts
```

The separate build writes `dist-oris/`, with `oris.html` as its entry.
The video plays one five-second establishing shot and stops. Reduced-motion users
see the poster only; changing the preference is supported. The poster remains
behind the video if playback is unavailable.

## Reference assets

Reference: https://www.orismaritime.com/ (retrieved 24 October 2026).

- `assets/vessel.mp4`: https://www.orismaritime.com/wp-content/uploads/2026/07/10f0cf8a-27a8-4012-9030-ef3f92b64f3c-1.mp4
- `assets/vessel-poster.jpg`: https://www.orismaritime.com/wp-content/uploads/2026/06/di1.jpg

These third-party assets are included solely for the requested private design
exploration. No production reuse rights have been established. Replace them with
owned or licensed media before publishing. No third-party requests occur at runtime.
