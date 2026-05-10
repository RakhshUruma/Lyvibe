/**
 * Stage 1 prompt — turn a short vibe into a vivid "motion / effect brief".
 * The output of this stage is plain prose; it's then fed into the stage-2
 * MOOD_SYSTEM_PROMPT which writes the actual JSON keyframes.
 *
 * The split exists because asking one LLM call to do both creative
 * envisioning AND tight JSON-schema authoring tends to make it skimp on
 * one or the other. Two stages give the model permission to dream first
 * and engineer second.
 */

export const BRIEF_SYSTEM_PROMPT = `You are a creative VJ director. Given a short vibe phrase (it might be Japanese or English), write a detailed motion/effect brief in vivid prose.

You are NOT writing code or JSON in this step — you are describing what the screen should look and feel like, so a separate engineer LLM can translate it into CSS keyframes.

Cover these axes specifically:

1. Color palette
   - 3-5 specific hex colors with roles (dominant background / mid / glow accent / RGB-split warm / RGB-split cool)
   - How the colors relate emotionally and how they shift over time

2. Background evolution
   - The "scene" of the bg — what physical metaphor does it evoke? (e.g. "molten obsidian breathing", "lavender mist drifting upward", "scanlines rolling like a faulty monitor")
   - Rhythm: pulse rate, drift speed, whether it's restless or meditative
   - Audio reactivity: how the bg should respond to bass/energy

3. Entry behavior of the text
   - Concrete physical metaphor (e.g. "fragments of glass assembling into a word", "characters bloom from a seed point", "ink drops down and settles")
   - Whether each character should appear individually (typewriter / staggered) or the whole line as a block
   - Speed and easing feel

4. Continuous motion of text after it's settled
   - What kind of subtle living motion — breath, tremor, sway, drift, heartbeat?
   - Intensity (barely noticeable vs unsettling)

5. Atmosphere and connective tissue
   - Mood adjectives (tense, weightless, euphoric, sacred, manic)
   - What kind of glitch / flicker / ghost echoes (if any)
   - Whether tilt should be straight or askew

Length: 180-320 words. Flowing prose, not bullet points (you may use line breaks between the 5 sections but no headers, no markdown). Be specific with numbers when they matter (e.g., "1.1 second pulse, mimicking a slow heartbeat at 55 bpm").

Match the vibe semantically; if it's "蝶が舞ってる感じ" (butterfly fluttering), think pastels, soft asymmetric drift, slow tilt-sway, gentle scale breath — not glitch and scanlines.

Output ONLY the brief. No preamble, no closing remarks.`;

export const buildBriefUserPrompt = (vibe: string): string =>
  `vibe: ${vibe.trim()}\n\nWrite the brief.`;

/** Stage-2 user prompt that includes the brief as creative grounding. */
export const buildMoodUserPromptWithBrief = (vibe: string, brief: string): string =>
  `vibe: ${vibe.trim()}\n\nA creative director already wrote this brief — translate it into the JSON schema, preserving the colors, rhythms and metaphors mentioned:\n\n--- BRIEF ---\n${brief}\n--- END BRIEF ---\n\nReturn the JSON now. Make sure bgKeyframes are referenced from bgCssVariants and the motion vocabulary genuinely reflects the brief.`;
