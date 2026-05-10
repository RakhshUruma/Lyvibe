---
name: vj-lyrics-mood
description: Generate a VJ Lyrics mood JSON from a short vibe description (e.g. "horror heartbeat", "summer vapor"). Returns a valid mood object that can be pasted into the VJ Lyrics app's "Paste mood JSON" field.
---

# vj-lyrics-mood

Use this skill whenever the user asks for a mood / vibe / aesthetic JSON for the **VJ Lyrics** real-time lyrics visualizer.

## Triggers
- "give me a mood for {X}"
- "VJ mood JSON {X}"
- "vibe like {X}"
- "/vj-lyrics-mood {X}"

## What to do

Output a single JSON object that conforms exactly to the schema below. **No prose, no markdown, no fences.** First character `{`, last character `}`.

## Schema

```
{
  "bg": string                 // hex/rgb of stage background
  "accent": string             // primary accent color
  "hot": string                // RGB-split hot side
  "cool": string               // RGB-split cool side
  "font": string               // CSS font-family stack for lyric lines
  "weight": number             // 100..900
  "color": string              // base lyric text color
  "blur": number               // 0..12 px
  "rgbSplit": number           // 0..12 px
  "panelBorder": string        // CSS color
  "tilt": number               // 0..25 deg
  "glitchRate": number         // 0..1
  "ghostRate": number          // 0..1
  "motionRate": number         // 0..1
  "bgSwapRate": number         // 0..1
  "positionMode": "center" | "scatter"
  "bgCssVariants": string[]    // 2..4, each a CSS BODY for #bgCssLayer (no selector, no braces)
  "lineExtraCss": string       // appended into .line.shown { ... } body
  "entryKeyframes": [{name,css,duration,easing,iteration?}, ...]
  "motionKeyframes": [{name,css,duration,easing,iteration?}, ...]
}
```

## Rules

- All CSS must be SAFE: no `<script>`, no `</style>`, no `javascript:`, no `expression()`, no `@import`.
- Keyframe `css` is the body BETWEEN the braces of `@keyframes`. Always include `0%{...} 100%{...}`.
- Keyframe `name` matches `/^[a-zA-Z_][a-zA-Z0-9_-]*$/` and is unique within the JSON.
- Match the vibe semantically:
  - dark/horror → low brightness, deep reds, slow pulses, heavy ghost
  - dream → pastel, soft blur, slow drift, low rgbSplit
  - cyber → high accent saturation, grids, scan lines, fast glitch
  - rave/edm → high motionRate, high bgSwapRate, scatter positions
- 2–4 `bgCssVariants` always.

## Example

Input: `horror heartbeat`

Output:
```
{"bg":"#0a0000","accent":"#ff2030","hot":"#ff0030","cool":"#80000a","font":"Impact, sans-serif","weight":900,"color":"#ffe0e0","blur":1,"rgbSplit":4,"panelBorder":"rgba(255,0,30,0.2)","tilt":3,"glitchRate":0.25,"ghostRate":0.6,"motionRate":0.7,"bgSwapRate":0.5,"positionMode":"center","bgCssVariants":["background: radial-gradient(ellipse at center, #2a0006, #0a0000 70%); animation: bgPulse 1.1s ease-in-out infinite;","background: #050000;"],"lineExtraCss":"text-shadow: 0 0 16px #ff0030, 4px 0 #ff0030, -4px 0 #80000a;","entryKeyframes":[{"name":"entrySlam","css":"0%{opacity:0;transform:translate(-50%,-50%) scale(1.5)} 60%{opacity:1;transform:translate(-50%,-50%) scale(0.95)} 100%{opacity:1;transform:translate(-50%,-50%) scale(1)}","duration":"0.4s","easing":"cubic-bezier(0.6,0,0.4,1)"}],"motionKeyframes":[{"name":"bgPulse","css":"0%,100%{filter:brightness(0.7)} 50%{filter:brightness(1.3)}","duration":"1.1s","easing":"ease-in-out","iteration":"infinite"},{"name":"breathe","css":"0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.04)}","duration":"1.1s","easing":"ease-in-out","iteration":"infinite"}]}
```
