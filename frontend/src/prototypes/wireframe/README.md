# Wireframe login preview

Run from `frontend`: `npx vite --config vite.wireframe.config.ts`.
Open http://127.0.0.1:5175/wireframe.html.
Build with `npx vite build --config vite.wireframe.config.ts`.

This isolated entry reuses the Oris preview form, including its copy, validation,
signup, password visibility and local mock authentication. It does not change the
production app or connect to real authentication. Only presentation is overridden.

The original procedural SVG depicts a tanker with hull mesh, pipes, bridge and
rails. A five-second drift and light sweep settle to a still image, without adding
controls to the existing UI. Reduced-motion preference makes it static immediately.
The shared form module imports the Oris assets, so Vite may also emit those files;
this theme never renders the photographic background or video.
