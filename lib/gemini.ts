
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
 * Performs a deep audit of business health.
 */
export const analyzeBusinessHealth = async (data: {
    products: any[],
    orders: any[],
    silverPrice: number
}): Promise<string> => {
    try {
        const ai = getClient();
        
        const productSummary = data.products.map(p => {
            let effectivePrice = p.selling_price || 0;
            let effectiveCost = p.active_price || 0;

            if (effectivePrice <= 0 && p.variants && p.variants.length > 0) {
                const pricedVariant = p.variants.find((v: any) => (v.selling_price || 0) > 0) || p.variants[0];
                effectivePrice = pricedVariant.selling_price || 0;
                effectiveCost = pricedVariant.active_price || p.active_price;
            }

            return {
                sku: p.sku,
                cat: p.category,
                w: p.weight_g,
                cost: effectiveCost,
                price: effectivePrice,
                stock: p.stock_qty,
                margin: effectivePrice > 0 ? ((effectivePrice - effectiveCost) / effectivePrice * 100).toFixed(1) : 0
            };
        });

        const prompt = `
            Είσαι ένας έμπειρος Business Analyst στον κλάδο της αργυροχοΐας (Jewelry Industry).
            Ανάλυσε τα παρακάτω δεδομένα του εργαστηρίου "Ilios Kosmima".
            
            Τρέχουσα Τιμή Ασημιού: ${data.silverPrice}€/g
            Σύνολο Προϊόντων: ${productSummary.length}
            
            Δεδομένα Προϊόντων (Condensed):
            ${JSON.stringify(productSummary)}

            Στόχοι Ανάλυσης:
            1. [TITLE]Έλεγχος Κερδοφορίας[/TITLE]: Εντόπισε κωδικούς με margin < 40% που έχουν υψηλό βάρος ή εργατικά.
            2. [TITLE]Ανάλυση Αποθέματος[/TITLE]: Βρες προϊόντα με υψηλό στοκ αλλά χαμηλή κερδοφορία.
            3. [TITLE]Ευπάθεια Μετάλλου[/TITLE]: Ποια προϊόντα θα πληγούν περισσότερο αν ανέβει η τιμή του ασημιού;
            4. [TITLE]Στρατηγικές Προτάσεις[/TITLE]: Δώσε 3 συγκεκριμένες στρατηγικές κινήσεις για αύξηση κερδοφορίας.

            ΠΕΡΙΟΡΙΣΜΟΙ ΜΟΡΦΟΠΟΙΗΣΗΣ:
            - ΜΗΝ χρησιμοποιείς σύμβολα Markdown όπως *** ή ## ή #.
            - ΜΗΝ χρησιμοποιείς έντονα γράμματα με αστεράκια.
            - Χρησιμοποίησε ΑΥΣΤΗΡΑ το format [TITLE]Τίτλος Ενότητας[/TITLE] για επικεφαλίδες.
            - Γράψε τις λεπτομέρειες σε απλές γραμμές με παύλες κάτω από κάθε τίτλο.
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
 */
export const generateMarketingCopy = async (
    prompt: string, 
    imageBase64?: string, 
    mimeType: string = 'image/jpeg'
): Promise<string> => {
  try {
    const ai = getClient();
    const parts: any[] = [];
    if (imageBase64) parts.push({ inlineData: { data: cleanBase64(imageBase64), mimeType } });
    parts.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
          systemInstruction: "Είσαι κορυφαίος Copywriter Κοσμημάτων. Γράψε στα Ελληνικά.",
          temperature: 0.7
      }
    });
    return response.text || "Δεν υπήρξε απάντηση.";
  } catch (error: any) {
    throw new Error(`Αποτυχία: ${error.message}`);
  }
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
            - Αν ο χρήστης έδωσε οδηγίες (π.χ. "καλοκαιρινό"), προσάρμοσε το ύφος ανάλογα.
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

export const generateVirtualModel = async (
    imageBase64: string, 
    gender: 'Men' | 'Women' | 'Unisex',
    category: string,
    userInstructions?: string,
    useProModel: boolean = false
): Promise<string | null> => {
  const ai = getClient();
  const genderPrompt = gender === 'Men' ? 'handsome Greek male model' : 'beautiful Greek female model';
  let promptText = `High-end editorial fashion photography. A ${genderPrompt} wearing the jewelry item provided. ${userInstructions || ''}`;
  try {
    const response = await ai.models.generateContent({
      model: useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
          { text: promptText },
        ],
      },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error: any) {
    throw new Error(`Αποτυχία: ${error.message}`);
  }
};

export const generateTrendAnalysis = async (query: string): Promise<string> => {
    try {
        const ai = getClient();
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Ανάλυσε τις τρέχουσες τάσεις κοσμημάτων για: ${query}.`,
            config: { tools: [{ googleSearch: {} }] }
        });
        return response.text || "Δεν βρέθηκαν δεδομένα.";
    } catch (error: any) {
        throw new Error(`Αποτυχία: ${error.message}`);
    }
};

/**
 * Identifies a product SKU from an image by comparing it against a provided list.
 */
export const identifyProductFromImage = async (imageBase64: string, productContext: string): Promise<string> => {
    try {
        const ai = getClient();
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
                    { text: `You are a jewelry forensic expert. 
                    
                    CRITICAL TASK: Find the EXACT SKU from the reference list that matches the jewelry in the photo.
                    
                    SPECIAL FOCUS FOR RINGS (RN/DA):
                    1. MOTIF SHAPE: Is it a signet? Round? Rectangular? Does it have a specific symbol (Cross, Star)?
                    2. BAND DETAILS: Is the band wide or thin? Smooth or hammered? Simple or double-shank?
                    3. STONE SETTING: Are stones Flush-set? Pave? Bezel? Claw?
                    
                    LOGIC STEPS:
                    1. Analyze Category first (Ring, Bracelet, Pendant).
                    2. Analyze Material/Texture (Solid Silver vs Cord, Patina vs Mirror-finish).
                    3. Compare the image visual cues with the provided descriptions in the Reference List.
                    4. Check for SKU prefix logic (DA = Women Ring, RN = Men Ring, XR = Men Bracelet).
                    
                    REFERENCE LIST (SKU | Category | Description):
                    ${productContext}
                    
                    Output ONLY the SKU string. If no high-confidence match exists, output "UNKNOWN".` },
                ],
            },
        });
        return response.text?.trim() || "UNKNOWN";
    } catch (error: any) {
        throw new Error(`AI Identification failed: ${error.message}`);
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
