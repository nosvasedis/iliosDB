
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { GEMINI_API_KEY } from "./supabase";

// Helper to clean Base64 string
const cleanBase64 = (dataUrl: string) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

const getClient = () => {
    const key = GEMINI_API_KEY || process.env.API_KEY;
    if (!key || key === 'provided-by-environment') {
        throw new Error("Το κλειδί Gemini API λείπει.");
    }
    return new GoogleGenAI({ apiKey: key });
};

/**
 * AI Predictive Pricing Analysis
 * Analyzes margin risk based on hypothetical silver price hikes.
 */
export const getPriceRiskAnalysis = async (products: any[], currentSilverPrice: number): Promise<string> => {
    try {
        const ai = getClient();
        const productData = products.slice(0, 50).map(p => ({
            sku: p.sku,
            weight: p.weight_g,
            cost: p.active_price,
            price: p.selling_price,
            margin: p.selling_price > 0 ? ((p.selling_price - p.active_price) / p.selling_price * 100).toFixed(1) : 0
        }));

        const prompt = `
            Ανάλυσε τον κίνδυνο κερδοφορίας για τα παρακάτω προϊόντα κοσμημάτων.
            Τρέχουσα Τιμή Ασημιού: ${currentSilverPrice}€/g.
            
            Σενάρια προς ανάλυση:
            1. Άνοδος Ασημιού +20%
            2. Άνοδος Ασημιού +50% (Κρίσιμο Σενάριο)
            
            Δεδομένα:
            ${JSON.stringify(productData)}

            Στόχοι:
            - [TITLE]Προϊόντα Υψηλού Κινδύνου[/TITLE]: Ποιοι κωδικοί θα έχουν αρνητικό margin πρώτοι;
            - [TITLE]Εκτίμηση Απώλειας[/TITLE]: Πόσο θα μειωθεί το συνολικό περιθώριο κέρδους;
            - [TITLE]Στρατηγική Αντίδρασης[/TITLE]: Προτάσεις ανατιμολόγησης.

            Μορφοποίηση: Format [TITLE]Τίτλος[/TITLE] χωρίς Markdown symbols.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        return response.text || "Η ανάλυση απέτυχε.";
    } catch (error: any) {
        throw new Error(`AI Risk Analysis failed: ${error.message}`);
    }
};

/**
 * Visual Similarity Search
 * Takes an image and finds descriptors to match against the registry.
 */
export const identifyJewelryFromImage = async (imageBase64: string): Promise<any> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } },
                    { text: "Περίγραψε αυτό το κόσμημα με λέξεις κλειδιά (τύπος, υλικό, σχέδιο) για αναζήτηση σε βάση δεδομένων. Επίσης προσπάθησε να μαντέψεις την κατηγορία (π.χ. Δαχτυλίδι, Βραχιόλι)." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                        description: { type: Type.STRING }
                    }
                }
            }
        });
        return JSON.parse(response.text);
    } catch (error: any) {
        throw new Error(`Visual search failed: ${error.message}`);
    }
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
            Είσαι ένας έμπειρος Business Analyst στον κλάδο της αργυροχοΐας.
            Ανάλυσε τα παρακάτω δεδομένα του εργαστηρίου "Ilios Kosmima".
            
            Τρέχουσα Τιμή Ασημιού: ${data.silverPrice}€/g
            Σύνολο Προϊόντων: ${productSummary.length}
            
            Δεδομένα:
            ${JSON.stringify(productSummary)}

            Στόχοι Ανάλυσης:
            1. [TITLE]Έλεγχος Κερδοφορίας[/TITLE]
            2. [TITLE]Ανάλυση Αποθέματος[/TITLE]
            3. [TITLE]Ευπάθεια Μετάλλου[/TITLE]
            4. [TITLE]Στρατηγικές Προτάσεις[/TITLE]

            ΠΕΡΙΟΡΙΣΜΟΙ ΜΟΡΦΟΠΟΙΗΣΗΣ:
            - ΜΗΝ χρησιμοποιείς σύμβολα Markdown.
            - Χρησιμοποίησε ΑΥΣΤΗΡΑ format [TITLE]Τίτλος[/TITLE].
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

export const generateMarketingCopy = async (prompt: string, imageBase64?: string, mimeType: string = 'image/jpeg'): Promise<string> => {
  try {
    const ai = getClient();
    const parts: any[] = [];
    if (imageBase64) parts.push({ inlineData: { data: cleanBase64(imageBase64), mimeType } });
    parts.push({ text: prompt });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { systemInstruction: "Είσαι κορυφαίος Copywriter Κοσμημάτων. Γράψε στα Ελληνικά.", temperature: 0.7 }
    });
    return response.text || "Δεν υπήρξε απάντηση.";
  } catch (error: any) {
    throw new Error(`Αποτυχία: ${error.message}`);
  }
};

export const generateVirtualModel = async (imageBase64: string, gender: 'Men' | 'Women' | 'Unisex', category: string, userInstructions?: string, useProModel: boolean = false): Promise<string | null> => {
  const ai = getClient();
  const genderPrompt = gender === 'Men' ? 'handsome Greek male model' : 'beautiful Greek female model';
  let promptText = `High-end editorial fashion photography. A ${genderPrompt} wearing the jewelry item provided. ${userInstructions || ''}`;
  try {
    const response = await ai.models.generateContent({
      model: useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image',
      contents: { parts: [{ inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } }, { text: promptText }] },
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

export const extractSkusFromImage = async (imageBase64: string): Promise<string> => {
  try {
    const ai = getClient();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ inlineData: { data: cleanBase64(imageBase64), mimeType: 'image/jpeg' } }, { text: "Extract SKUs and Quantities in 'SKU QUANTITY' format." }] },
    });
    return response.text || "";
  } catch (error: any) {
    throw new Error(`AI failed: ${error.message}`);
  }
};
