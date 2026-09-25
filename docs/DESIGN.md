# Design System: Kage

## 1. Visual Theme & Atmosphere
A cozy, tactile pocket world: a small living room for one pet, seen on a phone. It should feel like a handheld toy you want to check on (Tamagotchi warmth), built with the restraint of a good fintech app, because real money moves here. Soft, rounded, friendly shapes; generous air; one character that carries all the colour.
Density 4 ("Daily App Balanced"). Variance 6 ("Offset Asymmetric", playful but never chaotic). Motion 7 ("Fluid, alive": the pet always breathes, blinks and reacts).
The pet's mood tints the room: fed = warm morning light; hungry = late afternoon; starving = dusk grey-green; dead = quiet night. The atmosphere is the status indicator.

## 2. Color Palette & Roles
- **Pistachio Ground** (#EEF1E4) — App background, the room's wall
- **Moss Floor** (#E3E8D5) — Raised surfaces, cards, the room's floor, nav bar
- **Forest Ink** (#161A12) — Primary text (never pure black)
- **Lichen Ink** (#566050) — Secondary text, descriptions
- **Faint Lichen** (#8D9684) — Metadata, captions, timestamps
- **Deep Leaf** (#243A22) — THE single accent: primary buttons, active tab, focus rings. Text on it is Pistachio Ground
- **Night Moss** (#121710) — Dark mode background and the "starving / night" room
- **Mochi Coral** (#EF6A3D), **Coral Shade** (#C9502A), **Belly Peach** (#FFD7B5), **Cheek Blush** (#FF9A7A) — reserved for the pet character ONLY, never for UI chrome, text or buttons
- **Sprout Green** (#5F9B4C) — the pet's leaf sprout only
Rules: one accent (Deep Leaf). Colour lives in the pet, the UI stays tonal. No purple, no blue-purple, no neon, no gradients on text, no cream/beige, no default UI-kit grey.

## 3. Typography Rules
- **Display:** Sentient (Fontshare), medium weight, slightly tight tracking. Used ONLY for the pet's name, big moments ("Mochi ate!", "Here lies Mochi") and screen titles. Never for dense UI. If Sentient is unavailable, use a warm, soft modern text serif with character. NEVER Fraunces, Cormorant, Playfair, Bodoni, Didot, Young Serif, Georgia or Times.
- **UI and body:** the device system sans (SF Pro / Roboto / Segoe) at 15-17px, relaxed leading, max 65 characters per line. Not Inter, Space Grotesk, Sora, Syne, Archivo or any Google "trendy" sans.
- **Numbers:** money and counts in the system sans with tabular figures (not monospace as a costume).
- Hierarchy through weight and colour, not shouting size. Headlines max 2 lines.

## 4. Component Stylings
- **The Pet (signature artifact):** Mochi is a round coral dumpling with a peach belly, blush cheeks, big glossy eyes and a two-leaf sprout on top, standing on two little feet. Always the largest, most detailed thing on the pet home screen. Moods: curious, focused, happy (closed smiling eyes), hungry (small open mouth + sweat drop), starving (droopy, desaturated), dead (grey with X eyes). Always breathing, blinking, sprout swaying.
- **The Room:** the pet stands on a soft floor plane (Moss Floor) against the wall (Pistachio Ground) with one or two simple objects: a food bowl and a small window whose light shows the pet's mood. Depth from tone, not shadows.
- **Food meter:** the bowl itself fills and empties (not a progress bar). A small caption under it: "Full", "Getting hungry", "Starving".
- **Primary button:** Deep Leaf fill, Pistachio Ground label, 14px corner radius (NOT a pill), 48px min height, 44px min tap target. Pressed = 1px down + slightly darker. No glow, no gradient, no lift on hover. Arrow icons point up-right when used.
- **Secondary actions:** plain text links in Lichen Ink. Never a filled + outlined button pair.
- **Job card:** a Moss Floor card, 20px radius, holding: who is asking ("BharatBot, a support assistant"), the question in large readable text, the content (Hindi/Tamil/English text), answer controls, and "Pays ₹4 · about 20 sec" in small Lichen Ink. One job at a time, full focus.
- **Answer controls:** big, thumb-friendly choice buttons (2-3 options) in Moss Floor with Forest Ink text; selected = Deep Leaf fill. For "record audio": one large round record button (the only circle allowed) with a live waveform.
- **Reward moment:** after an accepted answer, a coin drops into the pet's bowl, the pet does a happy squish, and "+₹3.60" floats up once. Short, satisfying, no confetti explosion.
- **Chips/badges:** avoid. Rank and status are plain text with weight ("#12 in Bengaluru"), not tinted pills.
- **Cards:** only where they group something real. Corner radius 20-28px. No hairline borders; separate by tone (Moss Floor on Pistachio Ground). No drop-shadow blooms.
- **Loaders:** skeletons in the shape of the content; the pet can "think" (eyes looking up) while a job loads. No spinners.
- **Empty states:** the pet doing something ("Mochi is napping. No jobs right now.") instead of blank text.
- **Icons:** custom, rounded, 2px stroke, slightly chunky to match the pet's softness. Bare icons, never inside coloured tiles. No emoji anywhere.

## 5. Layout Principles
- **Mobile first (390px):** one column. Top: pet name + today's earnings. Middle: the room with the pet (at least 45% of the screen height). Bottom: the current job or "no jobs" state. Bottom tab bar with 4 tabs: Home, Jobs, Ranks, Wallet (text labels + custom icons, active = Deep Leaf text, no dot under the active item).
- **Desktop (1280px+):** two panes. Left 55%: the room and the pet, large. Right 45%: the job feed and answer area. Max width 1400px, centered container, generous gutters (24px mobile, 48px desktop).
- Asymmetric, never a centred hero stack. No 3-equal-cards rows. Full-height screens use 100dvh.
- No overlapping text on images; every element has its own space. No horizontal scroll on mobile.

## 6. Motion & Interaction
- The pet is always alive: breathing (3s loop), blinking (every 4-5s), sprout sway, eyes follow the pointer/finger on the room.
- Spring physics for reactions (stiffness 100, damping 20): happy squish on reward, droop when hungry, little hop when a job arrives.
- Content is visible by default; motion never hides text or controls. Respect reduced-motion (pet goes still, UI still works).
- Only transform and opacity animate. Short, purposeful; no looping decorative floaters on UI.

## 7. Anti-Patterns (Banned)
No emojis. No Inter or trendy Google sans. No Fraunces/Cormorant/Didone serifs. No pure black. No purple or blue-purple anything. No neon, glow or blurred bloom shadows. No gradient text. No pill buttons with glow. No filled + outlined button pair. No icons inside coloured tiles. No 3-equal-cards feature rows. No tinted pill chips for every label. No dot under the active nav item. No sun/moon theme toggle. No fake app-window mockups, no traffic-light dots. No confetti explosions. No generic names ("John Doe", "Acme") — use realistic Indian names and cities (Ananya, Pune; Rohit, Bengaluru). No fake round stats ("99%", "10,000 users"). No AI clichés ("Elevate", "Seamless", "Unleash", "Next-gen"). No "scroll to explore" or bouncing chevrons.
