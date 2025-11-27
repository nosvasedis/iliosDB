



import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from "./supabase";

// Initialize client with stored key
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
  if (!GEMINI_API_KEY) {
      throw new Error("Missing API Key. Please add your Gemini API Key in Settings.");
  }

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

  } catch (error: any) {
    console.error("Gemini Copywriting Error:", error);
    throw new Error(`Αποτυχία δημιουργίας περιγραφής: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Generates a Virtual Model image using Google Gemini Models.
 * 
 * Supports:
 * 1. Nano Banana (gemini-2.5-flash-image) - Standard/Fast
 * 2. Nano Banana Pro (gemini-3-pro-image-preview) - High Quality
 */
export const generateVirtualModel = async (
    imageBase64: string, 
    gender: 'Men' | 'Women' | 'Unisex',
    category: string,
    userInstructions?: string,
    useProModel: boolean = false
): Promise<string | null> => {
  
  if (!GEMINI_API_KEY) {
      throw new Error("Missing API Key. Please add your Gemini API Key in Settings.");
  }

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

  try {
    // Select Model based on Pro flag
    const modelName = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
    // Pro model supports explicit image configuration
    const config: any = {};
    if (useProModel) {
        config.imageConfig = { aspectRatio: "1:1", imageSize: "1K" };
    }

    const response = await ai.models.generateContent({
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
    throw new Error(`Αποτυχία δημιουργίας εικόνας: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Trend Analysis using Google Search Grounding
 */
export const generateTrendAnalysis = async (query: string): Promise<string> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Missing API Key. Please add your Gemini API Key in Settings.");
    }

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
    } catch (error: any) {
        console.error("Gemini Trends Error:", error);
        throw new Error(`Αποτυχία ανάλυσης τάσεων: ${error.message}`);
    }
};