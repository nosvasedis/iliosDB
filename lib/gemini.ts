import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper to clean Base64 string
const cleanBase64 = (dataUrl: string) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

const getClient = () => {
    const key = process.env.API_KEY;
    if (!key) {
        throw new Error("Το κλειδί Gemini API λείπει από το περιβάλλον.");
    }
    return new GoogleGenAI({ apiKey: key });
};

/**
 * Generates a collection description based on products.
 */
export const generateCollectionDescription = async (
    collectionName: string,
    products: any[],
    userGuidance?: string
): Promise<string> => {
    try {
        const ai = getClient();
        
        // Extract context from products
        const categories = Array.from(new Set(products.map(p => p.category))).join(', ');
        const genders = Array.from(new Set(products.map(p => p.gender))).join(', ');
        const materials = Array.from(new Set(products.map(p => p.plating_type))).join(', ');
        
        const prompt = `
            Είσαι ο Chief Editor ενός πολυτελούς περιοδικού μόδας (όπως η Vogue ή το Elle).
            Γράψε ένα ΣΥΝΤΟΜΟ (30-50 λέξεις), ατμοσφαιρικό και ελκυστικό διαφημιστικό κείμενο (intro) για μια συλλογή κοσμημάτων.
            
            ΔΕΔΟΜΕΝΑ ΣΥΛΛΟΓΗΣ:
            - Όνομα: "${collectionName}"
            - Είδη: ${categories}
            - Υλικά/Φινίρισμα: ${materials}
            - Κοινό: ${genders}
            
            ${userGuidance ? `ΕΙΔΙΚΕΣ ΟΔΗΓΙΕΣ ΧΡΗΣΤΗ (Σημαντικό): "${userGuidance}"` : ''}
            
            ΟΔΗΓΙΕΣ ΥΦΟΥΣ:
            - Το κείμενο πρέπει να εμπνέει πολυτέλεια, στυλ και συναίσθημα.
            - Μην κάνεις λίστα (bullet points). Γράψε μια ρέουσα, λογοτεχνική παράγραφο.
            - Γράψε στα Ελληνικά.
            - Αν ο χρήστης έδωσε οδηγίες (π.χ. "καλοκαιρινό", "minimal"), προσάρμοσε το ύφος ανάλογα.
        `;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.85 // High creativity for storytelling
            }
        });

        return response.text?.trim() || "";
    } catch (error: any) {
        throw new Error(`AI Generation failed: ${error.message}`);
    }
};

export const extractSkusFromImage = async (imageBase64: string): Promise<string> => {
  try {
    const ai = getClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
          { text: "Extract SKUs and Quantities in 'SKU QUANTITY' format." },
        ],
      },
    });
    return response.text || "";
  } catch (error: any) {
    throw new Error(`AI failed: ${error.message}`);
  }
};