
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.API_KEY || ''; 

const ai = new GoogleGenAI({ apiKey });

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
 * Generates a Virtual Model image using Nano Banana.
 * Takes a product image and generates a model wearing it with REALISTIC PROPORTIONS.
 * Accepts optional user instructions to guide the generation.
 */
export const generateVirtualModel = async (
    imageBase64: string, 
    gender: 'Men' | 'Women' | 'Unisex',
    category: string,
    userInstructions?: string
): Promise<string | null> => {
  try {
    const genderPrompt = gender === 'Men' ? 'handsome Greek male model' : (gender === 'Women' ? 'beautiful Greek female model' : 'fashion model');
    
    // Determine specific framing based on category to fix scaling issues
    let framingPrompt = "Lifestyle fashion shot.";
    let scaleConstraint = "Ensure the jewelry appears delicate and realistic in size relative to the body.";

    const catLower = category.toLowerCase();

    if (catLower.includes('δαχτυλίδι') || catLower.includes('ring')) {
        framingPrompt = "Close-up shot of a hand resting naturally on a textured surface or fabric. The ring should fit one finger naturally.";
        scaleConstraint = "CRITICAL: The ring must be sized realistically for a human finger. Do NOT make the ring look oversized or giant. It must look proportionate to the finger width.";
    } else if (catLower.includes('σκουλαρίκια') || catLower.includes('earrings')) {
        framingPrompt = "Portrait shot of the model's face, slightly turned to the side to show the ear.";
        scaleConstraint = "The earrings must hang naturally from the earlobe. Maintain true-to-life size proportions. Do not enlarge the earrings artificially.";
    } else if (catLower.includes('κολιέ') || catLower.includes('μενταγιόν') || catLower.includes('σταυρός') || catLower.includes('necklace') || catLower.includes('pendant')) {
        framingPrompt = "Medium portrait shot showing the model's neck and upper chest.";
        scaleConstraint = "The necklace/pendant must rest naturally on the collarbone or chest. Ensure the pendant size is small and realistic, not giant. Accurate chain thickness.";
    } else if (catLower.includes('βραχιόλι') || catLower.includes('bracelet')) {
        framingPrompt = "Shot of the model's arm or wrist resting on a lap or table.";
        scaleConstraint = "The bracelet should fit the wrist comfortably. Realistic diameter and width relative to the wrist bone.";
    }

    // Advanced Prompt for "Nano Banana"
    let promptText = `
      High-end editorial fashion photography. 
      Subject: A ${genderPrompt} wearing the jewelry item provided in the image.
      Setting: Elegant, minimalist studio with soft, cinematic lighting (Rembrandt lighting).
      
      Framing: ${framingPrompt}
      
      CONSTRAINT: ${scaleConstraint}
      
      The generated image must look like a real photo, not a 3D render. 
      Focus on skin texture, natural pose, and the harmonious integration of the jewelry.
    `;

    // Append user instructions if provided
    if (userInstructions && userInstructions.trim() !== "") {
        promptText += `\n\nADDITIONAL INSTRUCTIONS: ${userInstructions} (Strictly follow these overrides).`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { 
              inlineData: {
                  data: cleanBase64(imageBase64),
                  mimeType: 'image/jpeg'
              }
          },
          { text: promptText },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
    return null;

  } catch (error) {
    console.error("Gemini Model Gen Error:", error);
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