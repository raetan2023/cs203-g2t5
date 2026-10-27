# Wireframe login preview

Run from `frontend`: `npx vite --config vite.wireframe.config.ts`.
Open http://127.0.0.1:5175/wireframe.html.
Build with `npx vite build --config vite.wireframe.config.ts`.

This isolated entry reuses the Oris preview form, including its copy, validation,
signup, password visibility and local mock authentication. It does not change the
production app or connect to real authentication. Only presentation is overridden.

The original procedural SVG depicts a container ship with staggered cargo stacks,
a broad aft bridge, rails and an open foredeck. The shallow angle is retained;
the clean, raked bow has no bulbous protrusion, and the mesh has no node markers.
The illustration occupies normal document flow below the intro copy, so text
wrapping and viewport changes cannot place it over the headline.
A five-second sequence traces the outline, hull mesh, deck fittings and bridge,
then finishes with a soft light sweep. The ship stays stationary and the completed
mesh remains visible. Reduced motion shows the complete still ship immediately.
The shared form module imports the Oris assets, so Vite may also emit those files;
this theme never renders the photographic background or video.
