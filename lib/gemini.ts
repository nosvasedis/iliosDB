

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Base client for standard operations
// Note: We use a let variable or create instances dynamically to support User-Pays flow
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Helper to clean Base64 string
const cleanBase64 = (dataUrl: string) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

/**
 * Generates marketing text description.
 * Supports MULTIMODAL input (text + image).
 */
export const generateMarketingCopy = async (
    prompt: string, 
    imageBase64?: string, 
    mimeType: string = 'image/jpeg'
): Promise<string> => {
  try {
    const parts: any[] = [];

    // Add Image if present
    if (imageBase64) {
        parts.push({
            inlineData: {
                data: cleanBase64(imageBase64),
                mimeType: mimeType
            }
        });
    }

    // Add Text Prompt
    parts.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
          systemInstruction: "Είσαι ένας έμπειρος copywriter για κοσμήματα στην Ελλάδα. Γράφεις ελκυστικά, κομψά και επαγγελματικά κείμενα marketing.",
          temperature: 0.7
      }
    });

    return response.text || "Δεν υπήρξε απάντηση από το AI.";

  } catch (error) {
    console.error("Gemini Copywriting Error:", error);
    throw new Error("Αποτυχία δημιουργίας περιγραφής.");
  }
};

/**
 * Helper to generate image via Puter.js (Client-side User-Pays)
 */
export const generateImageViaPuter = async (
    prompt: string,
    model: 'gemini-3-pro' | 'gemini-flash' = 'gemini-flash',
    inputImageBase64?: string
): Promise<string> => {
    if (!window.puter) {
        throw new Error("Puter.js library not loaded. Check internet connection.");
    }

    const modelName = model === 'gemini-3-pro' ? 'google/gemini-3-pro-image' : 'gemini-2.5-flash-image-preview';
    
    const options: any = {
        model: modelName,
        provider: 'together-ai', // Often required for the Pro model via Puter
        disable_safety_checker: true
    };

    // If input image exists (Image-to-Image)
    if (inputImageBase64) {
        options.input_image = cleanBase64(inputImageBase64);
        options.input_image_mime_type = 'image/jpeg';
    }

    try {
        const imgElement = await window.puter.ai.txt2img(prompt, options);
        return imgElement.src;
    } catch (error: any) {
        console.error("Puter Generation Error:", error);
        throw new Error(`Puter Generation Failed: ${error.message || 'Unknown error'}`);
    }
};

/**
 * Generates a Virtual Model image.
 * 
 * Supports:
 * 1. Standard Flash (API Key)
 * 2. Pro/Flash via Puter (User-Pays/Free for Dev)
 */
export const generateVirtualModel = async (
    imageBase64: string, 
    gender: 'Men' | 'Women' | 'Unisex',
    category: string,
    userInstructions?: string,
    useProModel: boolean = false,
    usePuter: boolean = false
): Promise<string | null> => {
  
  // Construct the Prompt
  const genderPrompt = gender === 'Men' ? 'handsome Greek male model' : (gender === 'Women' ? 'beautiful Greek female model' : 'fashion model');
  let framingPrompt = "Lifestyle fashion shot.";
  let scaleConstraint = "Ensure the jewelry appears delicate and realistic in size relative to the body.";
  const catLower = category.toLowerCase();

  if (catLower.includes('δαχτυλίδι') || catLower.includes('ring')) {
      framingPrompt = "Close-up shot of a hand resting naturally. The ring should fit one finger naturally.";
      scaleConstraint = "CRITICAL: The ring must be sized realistically. Do NOT make it look oversized.";
  } else if (catLower.includes('σκουλαρίκια') || catLower.includes('earrings')) {
      framingPrompt = "Portrait shot of the model's face, slightly turned.";
      scaleConstraint = "The earrings must hang naturally. Maintain true-to-life size proportions.";
  } else if (catLower.includes('κολιέ') || catLower.includes('μενταγιόν') || catLower.includes('pendant')) {
      framingPrompt = "Medium portrait shot showing neck and upper chest.";
      scaleConstraint = "The necklace must rest naturally on the collarbone. Ensure realistic size.";
  } else if (catLower.includes('βραχιόλι') || catLower.includes('bracelet')) {
      framingPrompt = "Shot of the model's arm or wrist resting naturally.";
      scaleConstraint = "The bracelet should fit the wrist comfortably.";
  }

  let promptText = `
    High-end editorial fashion photography. 
    Subject: A ${genderPrompt} wearing the jewelry item provided in the image.
    Setting: Elegant, minimalist studio with soft, cinematic lighting.
    Framing: ${framingPrompt}
    CONSTRAINT: ${scaleConstraint}
    The generated image must look like a real photo, not a 3D render.
  `;

  if (userInstructions && userInstructions.trim() !== "") {
      promptText += `\n\nINSTRUCTIONS: ${userInstructions}`;
  }

  // --- PATH 1: PUTER.JS (User Pays / Free for Dev) ---
  if (usePuter) {
      return await generateImageViaPuter(
          promptText, 
          useProModel ? 'gemini-3-pro' : 'gemini-flash',
          imageBase64
      );
  }

  // --- PATH 2: STANDARD GOOGLE SDK (Requires Env Key or Window Wrapper) ---
  try {
    let modelName = 'gemini-2.5-flash-image';
    let currentAiClient = ai;
    let config: any = {};

    if (useProModel) {
        modelName = 'gemini-3-pro-image-preview';
        // User-Pays Flow for SDK
        if (typeof window !== 'undefined' && window.aistudio) {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) await window.aistudio.openSelectKey();
            currentAiClient = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        }
        config.imageConfig = { aspectRatio: "1:1", imageSize: "1K" };
    }

    const response = await currentAiClient.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
          { text: promptText },
        ],
      },
      config: config
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;

  } catch (error: any) {
    console.error("Gemini Model Gen Error:", error);
    if (error.message && error.message.includes("Requested entity was not found")) {
         if (typeof window !== 'undefined' && window.aistudio) {
             try { await window.aistudio.openSelectKey(); } catch(e) {}
         }
         throw new Error("Απαιτείται επιλογή ενεργού κλειδιού. Παρακαλώ δοκιμάστε ξανά.");
    }
    throw new Error("Αποτυχία δημιουργίας εικόνας μοντέλου.");
  }
};

/**
 * Trend Analysis using Google Search Grounding
 */
export const generateTrendAnalysis = async (query: string): Promise<string> => {
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Ανάλυσε τις τρέχουσες τάσεις κοσμημάτων για: ${query}. Εστίασε στην Ευρωπαϊκή και Ελληνική αγορά.`,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });

        let finalText = response.text || "Δεν βρέθηκαν δεδομένα.";

        // Append sources
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            const chunks = response.candidates[0].groundingMetadata.groundingChunks;
            const links = chunks
                .map((c: any) => c.web?.uri)
                .filter((uri: string) => uri)
                .map((uri: string) => `\n- ${uri}`)
                .join('');
            
            if (links) {
                finalText += `\n\nΠηγές:${links}`;
            }
        }
        return finalText;
    } catch (error) {
        console.error("Gemini Trends Error:", error);
        throw new Error("Αποτυχία ανάλυσης τάσεων.");
    }
};