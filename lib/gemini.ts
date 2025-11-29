

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from "./supabase";

// Helper to clean Base64 string
const cleanBase64 = (dataUrl: string) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

// Helper to get a fresh client instance
const getClient = () => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'provided-by-environment') {
        throw new Error("Το κλειδί Gemini API λείπει. Παρακαλώ ρυθμίστε το στις Ρυθμίσεις.");
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

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
    const ai = getClient();
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
          systemInstruction: `
            Είσαι ένας κορυφαίος Copywriter Κοσμημάτων (Jewelry Expert) για την Ελληνική αγορά.
            Στόχος σου είναι να γράψεις κείμενα που αποπνέουν πολυτέλεια, συναίσθημα και επαγγελματισμό.
            
            Ακολούθησε ΑΥΣΤΗΡΑ την παρακάτω δομή μορφοποίησης:
            1. Ξεκίνα με έναν δυνατό Τίτλο χρησιμοποιώντας ένα σύμβολο # στην αρχή (π.χ. # Μαγευτικό Κολιέ...).
            2. Γράψε μια συναισθηματική εισαγωγή που να μιλάει στην καρδιά του πελάτη.
            3. Χρησιμοποίησε λίστα με παύλες (-) για τα τεχνικά χαρακτηριστικά.
            4. Κλείσε με μια πρόταση styling ή call-to-action.
            
            Κανόνες Μορφοποίησης:
            - Χρησιμοποίησε **Bold** για λέξεις κλειδιά και έμφαση.
            - ΜΗΝ χρησιμοποιείς διαχωριστικά γραμμών όπως *** ή ---.
            - ΜΗΝ χρησιμοποιείς Markdown για τον τίτλο εκτός από το # στην αρχή.
            - Το κείμενο πρέπει να έχει συνοχή και ροή.
          `,
          temperature: 0.7
      }
    });

    return response.text || "Δεν υπήρξε απάντηση από το AI.";

  } catch (error: any) {
    console.error("Gemini Copywriting Error:", error);
    if (error.status === 403 || (error.message && error.message.includes('403'))) {
        throw new Error("Άρνηση Πρόσβασης (403): Ελέγξτε ότι το API Key είναι έγκυρο και έχει ενεργοποιημένο το 'Generative Language API'.");
    }
    throw new Error(`Αποτυχία δημιουργίας περιγραφής: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Generates a Virtual Model image using Google Gemini Models.
 */
export const generateVirtualModel = async (
    imageBase64: string, 
    gender: 'Men' | 'Women' | 'Unisex',
    category: string,
    userInstructions?: string,
    useProModel: boolean = false
): Promise<string | null> => {
  
  const ai = getClient();

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
    const modelName = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    
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
    
    if (error.status === 403 || (error.message && error.message.includes('403'))) {
        throw new Error("Άρνηση Πρόσβασης (403): Το API Key δεν έχει πρόσβαση στο μοντέλο εικόνας. Δοκιμάστε να ενεργοποιήσετε το Paid Plan ή ελέγξτε τα δικαιώματα του Cloud Project.");
    }
    
    if (error.status === 404 || (error.message && error.message.includes('404'))) {
         throw new Error(`Το μοντέλο δεν βρέθηκε. Βεβαιωθείτε ότι έχετε πρόσβαση στα μοντέλα Gemini 2.5/3.0.`);
    }

    throw new Error(`Αποτυχία δημιουργίας εικόνας: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Trend Analysis using Google Search Grounding
 */
export const generateTrendAnalysis = async (query: string): Promise<string> => {
    try {
        const ai = getClient();
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
        if (error.status === 403) {
             throw new Error("Άρνηση Πρόσβασης (403): Ελέγξτε το API Key και την ενεργοποίηση του Google Search tool.");
        }
        throw new Error(`Αποτυχία ανάλυσης τάσεων: ${error.message}`);
    }
};

/**
 * Extracts SKUs and quantities from an image of an order sheet.
 */
export const extractSkusFromImage = async (imageBase64: string): Promise<string> => {
  try {
    const ai = getClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64(imageBase64),
              mimeType: 'image/jpeg',
            },
          },
          {
            text: `You are an OCR system for a jewelry ERP. Analyze the provided image of an order sheet. Extract all product SKUs and their corresponding quantities.
            The SKU is in the 'Περιγραφή / SKU' column. The quantity is in the 'Ποσότητα' column.
            Format your output strictly as 'SKU QUANTITY' with each item on a new line.
            Example:
            XR2020-PKR 5
            DA1005-X 10
            
            - Only output the SKU and quantity pairs.
            - Do not include any conversational text, headers, explanations, or markdown formatting.
            - If no SKUs are found, return an empty string.`,
          },
        ],
      },
    });

    return response.text || "";
  } catch (error: any) {
    console.error("Gemini SKU Extraction Error:", error);
    throw new Error(`AI analysis failed: ${error.message || 'Unknown error'}`);
  }
};