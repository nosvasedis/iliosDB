import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from "./supabase";

// Helper to clean Base64 string
const cleanBase64 = (dataUrl: string) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

// Helper to get a fresh client instance
const getClient = () => {
    // Note: The system instruction requires process.env.API_KEY, 
    // but the established project pattern uses GEMINI_API_KEY from supabase.ts.
    // We will ensure the initialization follows the modern SDK rules.
    const key = GEMINI_API_KEY || process.env.API_KEY;
    if (!key || key === 'provided-by-environment') {
        throw new Error("Το κλειδί Gemini API λείπει.");
    }
    return new GoogleGenAI({ apiKey: key });
};

/**
 * Performs a deep audit of business health based on inventory and sales data.
 */
export const analyzeBusinessHealth = async (data: {
    products: any[],
    orders: any[],
    silverPrice: number
}): Promise<string> => {
    try {
        const ai = getClient();
        
        // Prepare a condensed version of data to stay within context limits and focus on vitals
        const productSummary = data.products.map(p => ({
            sku: p.sku,
            cat: p.category,
            w: p.weight_g,
            cost: p.active_price,
            price: p.selling_price,
            stock: p.stock_qty,
            margin: p.selling_price > 0 ? ((p.selling_price - p.active_price) / p.selling_price * 100).toFixed(1) : 0
        }));

        const prompt = `
            Είσαι ένας έμπειρος Business Analyst στον κλάδο της αργυροχοΐας (Jewelry Industry).
            Ανάλυσε τα παρακάτω δεδομένα του εργαστηρίου "Ilios Kosmima".
            
            Τρέχουσα Τιμή Ασημιού: ${data.silverPrice}€/g
            Σύνολο Προϊόντων: ${productSummary.length}
            
            Δεδομένα Προϊόντων (Condensed):
            ${JSON.stringify(productSummary)}

            Στόχοι Ανάλυσης:
            1. **Υποκοστολόγηση**: Βρες κωδικούς με πολύ χαμηλό περιθώριο κέρδους (κάτω από 40%) που έχουν υψηλό βάρος ή εργατικά.
            2. **Inventory Risk**: Βρες προϊόντα με υψηλό στοκ αλλά αναντίστοιχη τιμή.
            3. **Silver Exposure**: Ποια προϊόντα θα πληγούν περισσότερο αν ανέβει η τιμή του ασημιού;
            4. **Προτάσεις**: Δώσε 3 συγκεκριμένες στρατηγικές κινήσεις για αύξηση κερδοφορίας.

            Μορφοποίηση:
            - Χρησιμοποίησε Markdown.
            - Ξεκίνα με ένα "Score Υγείας" (0-100).
            - Χρησιμοποίησε emoji για κάθε κατηγορία.
            - Γράψε στα Ελληνικά με επαγγελματικό αλλά άμεσο ύφος.
        `;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        return response.text || "Δεν στάθηκε δυνατή η ανάλυση.";
    } catch (error: any) {
        console.error("Gemini Audit Error:", error);
        throw new Error(`AI Analysis failed: ${error.message}`);
    }
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

    if (imageBase64) {
        parts.push({
            inlineData: {
                data: cleanBase64(imageBase64),
                mimeType: mimeType
            }
        });
    }

    parts.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
          systemInstruction: `
            Είσαι ένας κορυφαίος Copywriter Κοσμημάτων (Jewelry Expert) για την Ελληνική αγορά.
            Στόχος σου είναι να γράψεις κείμενα που αποπνέουν πολυτέλεια, συναίσθημα και επαγγελματισμό.
          `,
          temperature: 0.7
      }
    });

    return response.text || "Δεν υπήρξε απάντηση από το AI.";
  } catch (error: any) {
    throw new Error(`Αποτυχία: ${error.message}`);
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
  const genderPrompt = gender === 'Men' ? 'handsome Greek male model' : (gender === 'Women' ? 'beautiful Greek female model' : 'fashion model');
  let framingPrompt = "Lifestyle fashion shot.";
  let scaleConstraint = "Ensure the jewelry appears delicate and realistic in size relative to the body.";
  const catLower = category.toLowerCase();

  if (catLower.includes('δαχτυλίδι') || catLower.includes('ring')) {
      framingPrompt = "Close-up shot of a hand resting naturally.";
  } else if (catLower.includes('σκουλαρίκια') || catLower.includes('earrings')) {
      framingPrompt = "Portrait shot of the model's face.";
  }

  let promptText = `High-end editorial fashion photography. Subject: A ${genderPrompt} wearing the jewelry item provided in the image. Framing: ${framingPrompt} ${scaleConstraint}`;
  if (userInstructions) promptText += `\n\nINSTRUCTIONS: ${userInstructions}`;

  try {
    const modelName = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    const config: any = useProModel ? { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } } : {};

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
          { text: promptText },
        ],
      },
      config
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error: any) {
    throw new Error(`Αποτυχία δημιουργίας εικόνας: ${error.message}`);
  }
};

/**
 * Trend Analysis using Google Search Grounding
 */
export const generateTrendAnalysis = async (query: string): Promise<string> => {
    try {
        const ai = getClient();
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Ανάλυσε τις τρέχουσες τάσεις κοσμημάτων για: ${query}.`,
            config: { tools: [{ googleSearch: {} }] }
        });

        let finalText = response.text || "Δεν βρέθηκαν δεδομένα.";
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            const links = response.candidates[0].groundingMetadata.groundingChunks
                .map((c: any) => c.web?.uri).filter((uri: string) => uri)
                .map((uri: string) => `\n- ${uri}`).join('');
            if (links) finalText += `\n\nΠηγές:${links}`;
        }
        return finalText;
    } catch (error: any) {
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
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
          { text: "Analyze the order sheet image. Extract SKUs and Quantities in 'SKU QUANTITY' format per line." },
        ],
      },
    });
    return response.text || "";
  } catch (error: any) {
    throw new Error(`AI analysis failed: ${error.message}`);
  }
};
