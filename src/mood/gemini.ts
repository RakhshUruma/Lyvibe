import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "../env";

let _genai: GoogleGenerativeAI | null = null;
const genai = (): GoogleGenerativeAI => {
  if (_genai) return _genai;
  if (!env.geminiMood.key) throw new Error("gemini: no key");
  _genai = new GoogleGenerativeAI(env.geminiMood.key);
  return _genai;
};

const moodResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    bg: { type: SchemaType.STRING }, accent: { type: SchemaType.STRING },
    hot: { type: SchemaType.STRING }, cool: { type: SchemaType.STRING },
    font: { type: SchemaType.STRING }, weight: { type: SchemaType.NUMBER }, color: { type: SchemaType.STRING },
    blur: { type: SchemaType.NUMBER }, rgbSplit: { type: SchemaType.NUMBER }, panelBorder: { type: SchemaType.STRING },
    tilt: { type: SchemaType.NUMBER }, glitchRate: { type: SchemaType.NUMBER }, ghostRate: { type: SchemaType.NUMBER },
    motionRate: { type: SchemaType.NUMBER }, bgSwapRate: { type: SchemaType.NUMBER },
    positionMode: { type: SchemaType.STRING },
    bgCssVariants: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    lineExtraCss: { type: SchemaType.STRING },
    entryKeyframes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING }, css: { type: SchemaType.STRING },
          duration: { type: SchemaType.STRING }, easing: { type: SchemaType.STRING },
          iteration: { type: SchemaType.STRING },
        },
        required: ["name","css","duration","easing"],
      },
    },
    motionKeyframes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING }, css: { type: SchemaType.STRING },
          duration: { type: SchemaType.STRING }, easing: { type: SchemaType.STRING },
          iteration: { type: SchemaType.STRING },
        },
        required: ["name","css","duration","easing"],
      },
    },
  },
  required: [
    "bg","accent","hot","cool","font","weight","color","blur","rgbSplit","panelBorder",
    "tilt","glitchRate","ghostRate","motionRate","bgSwapRate","positionMode",
    "bgCssVariants","lineExtraCss","entryKeyframes","motionKeyframes",
  ],
};

export const generateTextGemini = async (
  systemPrompt: string,
  userPrompt: string,
  jsonSchema?: any,
): Promise<string> => {
  const model = genai().getGenerativeModel({
    model: env.geminiMood.model,
    systemInstruction: systemPrompt,
    generationConfig: jsonSchema
      ? {
          temperature: 0.95,
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
        }
      : { temperature: 0.95 },
  });
  const r = await model.generateContent(userPrompt);
  const txt = r.response.text();
  if (!txt || !txt.trim()) {
    const fr = (r.response as any).candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`gemini empty (finishReason=${fr})`);
  }
  return txt;
};

/** Stage-2 JSON-schema-enforced call. */
export const generateMoodJsonGemini = (systemPrompt: string, userPrompt: string): Promise<string> =>
  generateTextGemini(systemPrompt, userPrompt, moodResponseSchema);

export { moodResponseSchema };
