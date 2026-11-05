# UI Tooling Reference (skills, MCPs, galleries)

> 🧭 **Start here.** This page is organized in the order you use tools while vibecoding: set up, pick a direction, build foundations, polish motion and visuals, then audit and ship. Each section lists what to use and when.

---

## 0. Setup Hub

Install and configure your tools once before a project starts.

Claude Code Setup Instructions

### Claude Code workflow commands

| Command | Use it when |
| --- | --- |
| `/doctor` | Before installing many skills, to see how much context they cost |
| `/handoff` | Ending a session, to carry goal, decisions, state, and next steps into a new session |
| `/compact` | A long session is getting heavy; condenses it into a checkpoint |
| `/rewind` | Claude took the wrong path; jump back before the mistake |

### Desktop tool

- **Handy** (GitHub: cjpais/handy): free, open-source, offline speech-to-text desktop app using local transcription models. No Claude Code setup needed.

### Cost tracking

- **CodeBurn** (GitHub: getagentseal/codeburn, https://github.com/getagentseal/codeburn): free, local tool that tracks AI coding token usage and cost across 37 tools and agents (Claude Code, Cursor, Codex, Gemini and more), broken down by model, project, and task. Run with `npx codeburn`. Includes an MCP server (`claude mcp add codeburn -- npx -y codeburn mcp`) so your agent can answer spend questions. Needs Node.js 22.13+. Use `codeburn optimize` to find wasted tokens.

---

## 1. Direction and Inspiration

Decide the look before building. Use these to pick an aesthetic and avoid generic output.

### Starting point and design vocabulary

- **Uizze** (uizze.com): gives agents UI taste by referencing real product journeys (Stripe, Notion, Linear, Airbnb, Slack, WhatsApp). Best for a solid first draft with real components and tokens. Install from the third-party registry: `npx skhub add github/anti-ui-slop`. No account needed.
- **Impeccable** (impeccable.style): design vocabulary for agents covering hierarchy, typography, spacing, color, and motion. Best for making functional AI UI feel intentional. Setup is on the Claude Code Setup Instructions page.
- **DesignSkills.dev** (designskills.dev): directory of 230+ design skills for Claude Code, Codex, and Cursor. Browse and copy the install command for each skill you want.

### Inspiration galleries

- godly.design: design inspiration.
- transitions.dev: transition and motion design.
- animos.app: animation.
- deck.gallery: presentation and deck design.

<details>
<summary>Design styles reference (22 styles)</summary>

1. **Claymorphism**: soft, rounded, clay-like forms with dimensional shadows and a playful tactile feel.
2. **Cybercore**: digital, futuristic visuals with glitch effects, neon accents, and technology imagery.
3. **Neo-Brutalism**: bold colors, stark contrast, thick borders, oversized type, intentionally raw layouts.
4. **Scrapbook**: layered paper, cutouts, handwritten notes, tape, collage-like arrangements.
5. **Surrealism**: dreamlike, unexpected combinations, distorted or impossible imagery.
6. **Y2K Aesthetic**: late-1990s/early-2000s futurism, metallic finishes, glossy gradients, playful digital motifs.
7. **Pixel Art**: visible square pixels, limited palettes, retro-game references.
8. **Synthwave**: 1980s retro-futurism, neon pinks and purples, grids, sunset imagery.
9. **Glassmorphism**: translucent frosted-glass surfaces with blur, subtle borders, layered depth.
10. **Neumorphism**: low-contrast surfaces that look softly raised or inset.
11. **Bento Grid**: modular content in a clean grid of varied rectangular tiles.
12. **Editorial Design**: publication-inspired layouts emphasizing typography, hierarchy, imagery, and composition.
13. **Swiss Design**: International Typographic Style with precise grids, sans-serif type, and strong alignment.
14. **Minimalism**: essential elements only, generous space, restrained color and decoration.
15. **Maximalism**: abundant color, pattern, imagery, and detail.
16. **Luxury Typography**: elegant, high-impact type, often refined serifs, careful spacing.
17. **Conceptual Sketch**: hand-drawn or sketch-like visuals with an exploratory quality.
18. **Ethereal**: airy, soft light, haze, muted or luminous color.
19. **Bohemian**: eclectic, organic textures, earthy tones, handcrafted or global motifs.
20. **Victorian**: ornate decorative type, intricate patterns, formal composition.
21. **Cyberpunk**: dystopian high-tech imagery, neon signage, strong dark and light contrast.
22. **Wabi-Sabi**: appreciation of imperfection, natural materials, irregular forms, restrained simplicity.

</details>

<details>
<summary>Anti-slop rules: 30 reasons your site looks vibecoded</summary>

1. Harsh gradients
2. Lucide icons everywhere
3. Pure black or pure white backgrounds
4. Rainbow text and coloring
5. Heavy drop shadows
6. 3 feature cards in a row
7. Emoji headings
8. Liquid motion or liquid glass
9. Em dashes
10. Inter, Geist, or Space Grotesk font stack
11. Colored left stripe on cards
12. Fake testimonials
13. Bento grids
14. Fake terminal or CLI preview windows
15. "It's not X, it's Y" copy
16. Checkmark bullet points
17. 3 pricing tiers
18. No real product demos
19. Soft corner radius on everything
20. Purple and black color scheme
21. Missing skeleton loaders
22. Radial orbs and glowing blobs
23. Dot grids
24. Sparkle or AI magic icons
25. Animated bouncing arrows
26. Missing terms of service
27. Missing privacy policy
28. Unnecessary hover animations
29. Neon accent colors
30. Basic pastel colors

</details>

---

## 2. Build Foundations

Pick components and layout primitives. Record your choice in CLAUDE.md so every session uses the same library.

| Tool | Best for | Claude Code integration |
| --- | --- | --- |
| Taste Skill (tasteskill.dev) | Landing pages and expressive design | Install: `npx skills add Leonxlnx/taste-skill` |
| shadcn/ui (ui.shadcn.com) | Tailored, accessible Tailwind and Radix components | Native MCP: `npx shadcn@latest mcp init --client claude` |
| HyperUI (hyperui.dev) | Landing page and admin panel sections | Copy markup into the project |
| Flowbite (flowbite.com) | Broad ready-made coverage, 600+ components | Copy markup or install the npm package |
| Preline UI (preline.co) | Reusable patterns in Tailwind projects | Copy markup or install the npm package |
| Aceternity UI (ui.aceternity.com) | Landing pages with motion and 3D effects | Copy code into the project |
| Componentry (componentry.dev) | Animated sections, carousels, portfolios | Copy code; no verified MCP |
| Space UI (spaceui.one) | Motion-focused microinteractions | Copy-paste; no verified MCP |
| Skecher UI (skecher-ui.com, GitHub: CoDesign-Spa27/skecher-ui) | Motion-first, liquid-glass surfaces | Copy-paste; no verified MCP |
| Arc UI (uiarc.dev) | Dashboards and auth flows | Copy-paste; no verified MCP |
| Planes | Editable TypeScript and Tailwind components | UNVERIFIED: planes.dev could not be fetched. Planes Studio (planes.studio) is a London digital product agency, not a component library, so it is likely a different product. Confirm the intended Planes before use |
| CSS Layout Generator (layout.bradwoods.io) | Grid and Flexbox layouts | Use visually, paste the CSS |

---

## 3. Motion, Visuals and Assets

Add polish after the layout works. Note class names, hex values, and asset paths in CLAUDE.md.

### Motion and interaction

- **Emil Kowalski's Design Engineering** (emilkowal.ski/skill, verified): micro-interactions, animation curves, component craft. Install: `npx skills add emilkowalski/skill`. Included skills: emil-design-eng, animate, review-animations, improve-animations, find-animation-opportunities, prototype, animation-vocabulary, apple-design, pick-ui-library.
- **Animista** (animista.net): CSS animation generator for hover effects and transitions. Copy CSS into the project.
- **Spline** (docs.spline.design/generate/spline-mcp-server): 3D scenes and interactive hero visuals, with React and Three.js integration. Set up using the command in Spline's MCP docs.
- **VGPU** (GitHub: vercel-labs/vgpu, vgpu.sh), Vercel Labs: WebGPU graphics experiments, including particles and 3D Gaussian splatting.

### Effects and decorative assets

- **CSS Scan** (getcssscan.com): curated box shadows to copy into the stylesheet.
- **UIverse** (uiverse.io): open-source buttons, loaders, and cards to adapt.
- **Canvas UI** (canvasui.dev, GitHub: DavidHDev/canvas-ui): WebGL and WebGPU effects such as Aurora, Fluid, Glass, Ripple, and Spotlight.
- **Haikei** (haikei.app): SVG backgrounds, blobs, and mesh assets. Export SVGs to the assets folder.
- **unDraw** (undraw.co): open-source SVG illustrations. Download and reference in code.
- **Coolors** (coolors.co): color palettes. Copy hex values into the design tokens file.

---

## 4. Audit, Quality and Ship

Run these before you call a UI done.

- **Vercel Web Design Guidelines**: audit against accessibility, focus states, responsive behavior, and edge cases. Install: `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines`.
- **Impeccable**: `/polish` and `/distill` for the final pass. Update with `npx impeccable update`.
- **Anti Slop** (github.com/miqdadbadjuber/anti-slop, MIT): 38 mandatory rules against generic UI, copy, and code. Install: `npx skills add miqdadbadjuber/anti-slop`. Alternatives: `npx antislop-ai`, or the plugin route in the Setup section.
- **Hallmark** (usehallmark.com, by Together AI): themes, anti-patterns, and validation gates. Install: `npx skills add nutlope/hallmark`. Use: `/hallmark build ...`
- Check the 30 reasons list in section 1 before shipping.
- **Ponytail** (GitHub: dietrichgebert/ponytail): a code-auditing CLI that removes redundancy and enforces a simplest-solution workflow. A concise-output skill with the same name is also listed. Confirm which one you mean before installing.
- **Improve / Audit** (GitHub: shadcn/improve): read-only audit that generates prioritized technical fix plans without modifying source code. Install: `npx skills add shadcn/improve`. Usage: `/improve` (also `/improve quick`, `/improve security`, `/improve branch`, `/improve plan <description>`).
- **Draw.io**: generates an architecture diagram from a codebase. Good for orienting in an unfamiliar project.
- **SkillSpector** (GitHub: nvidia/skillspector, NVIDIA, open source): security scanner for agent skills and tools. Run it on any third-party skill before installing.

> ⚠️ Items marked unverified or without a verified install command (Planes, Ponytail's install path, Draw.io, SkillSpector) need their own repo or docs checked before use.
