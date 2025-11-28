
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateMarketingCopy, generateVirtualModel, generateTrendAnalysis } from '../lib/gemini';
import { ChatMessage, Product } from '../types';
import { Sparkles, Send, Search, Loader2, Copy, TrendingUp, Feather, User, Camera, Image as ImageIcon, CheckCircle, X, Zap, AlertTriangle, Crown } from 'lucide-react';
import { useUI } from './UIProvider';
import { api, R2_PUBLIC_URL, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { compressImage } from '../utils/imageHelpers';

type Mode = 'copywriting' | 'virtual-model' | 'trends';

export default function AiStudio() {
    const { showToast } = useUI();
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    
    // State
    const [mode, setMode] = useState<Mode>('copywriting');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    
    // Inputs
    const [inputValue, setInputValue] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Pro Settings
    const [useProModel, setUseProModel] = useState(false); // Default to Nano Banana (Flash)
    
    // Product Search Modal
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial Greeting
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([{ 
                id: 'init', 
                role: 'model', 
                text: 'Καλώς ήρθατε στο Ilios AI Studio! Είμαι εδώ για να βοηθήσω με έξυπνες περιγραφές, δημιουργία εικονικών μοντέλων και ανάλυση τάσεων.' 
            }]);
        }
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleProductSelect = (p: Product) => {
        setSelectedProduct(p);
        setUploadedImage(null); // Reset manual upload
        setShowProductSearch(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const blob = await compressImage(e.target.files[0]);
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    setUploadedImage(reader.result as string);
                    setSelectedProduct(null); // Reset DB selection
                };
            } catch (err) {
                showToast("Σφάλμα φόρτωσης εικόνας.", "error");
            }
        }
    };

    const getActiveImage = () => {
        if (uploadedImage) return uploadedImage;
        if (selectedProduct?.image_url) return selectedProduct.image_url;
        return null;
    };

    /**
     * Helper to robustly fetch an image and convert to Base64.
     * Handles CORS by routing R2 requests through our Worker with Auth.
     */
    const fetchImageAsBase64 = async (url: string): Promise<string> => {
        // 1. If it's already base64, return it.
        if (url.startsWith('data:')) return url;

        try {
            let fetchUrl = url;
            let headers: HeadersInit = {};

            // 2. Check if it's OUR R2 Image
            if (url.startsWith(R2_PUBLIC_URL)) {
                // Extract filename
                const parts = url.split('/');
                const filename = parts[parts.length - 1];
                
                // Use Worker as Proxy with Auth Header
                fetchUrl = `${CLOUDFLARE_WORKER_URL}/${filename}`;
                headers = { 'Authorization': AUTH_KEY_SECRET };
            }

            // 3. Perform Fetch
            const response = await fetch(fetchUrl, { headers });
            
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            
            const blob = await response.blob();
            
            // 4. Convert Blob to Base64
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error("Image Fetch Error:", error);
            throw error;
        }
    };

    // --- ACTION HANDLERS ---

    const handleCopywriting = async () => {
        const image = getActiveImage();
        if (!image) {
            showToast("Παρακαλώ επιλέξτε προϊόν ή ανεβάστε φωτογραφία.", "error");
            return;
        }

        const userText = inputValue;
        const msgId = Date.now().toString();

        // Construct User Message
        const userMsg: ChatMessage = { 
            id: msgId, 
            role: 'user', 
            text: `Δημιουργία περιγραφής. ${userText ? `Οδηγίες: ${userText}` : ''}`,
            image: image,
            attachedProductSku: selectedProduct?.sku
        };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Build Prompt with Technical Details if product selected
            let prompt = "Γράψε μια ελκυστική περιγραφή προϊόντος για e-shop και social media.";
            if (selectedProduct) {
                prompt += `\nΤεχνικά Χαρακτηριστικά:\n- SKU: ${selectedProduct.sku}\n- Κατηγορία: ${selectedProduct.category}\n- Υλικό/Επιμετάλλωση: ${selectedProduct.plating_type}\n- Βάρος: ${selectedProduct.weight_g}g\n- Φύλο: ${selectedProduct.gender}`;
                if (selectedProduct.variants) {
                    const variants = selectedProduct.variants.map(v => v.description).join(', ');
                    prompt += `\n- Παραλλαγές: ${variants}`;
                }
            }
            if (userText) prompt += `\n\nΕπιπλέον Οδηγίες Χρήστη: ${userText}`;

            // Fetch Base64 safely
            const base64Image = await fetchImageAsBase64(image);

            const response = await generateMarketingCopy(prompt, base64Image);
            
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: response
            }]);

        } catch (error) {
            console.error("Copywriting Error", error);
            showToast("Σφάλμα λήψης εικόνας ή σύνδεσης.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleVirtualModel = async () => {
        const image = getActiveImage();
        if (!image) {
            showToast("Παρακαλώ επιλέξτε προϊόν ή ανεβάστε φωτογραφία.", "error");
            return;
        }

        const msgId = Date.now().toString();
        const gender = selectedProduct?.gender || 'Women'; // Default to Women if unknown
        const category = selectedProduct?.category || 'jewelry';
        const instructions = inputValue; // Capture user instructions

        const modelUsed = useProModel ? 'Nano Banana Pro' : 'Nano Banana';

        setMessages(prev => [...prev, {
            id: msgId,
            role: 'user',
            text: `Δημιουργία εικονικού μοντέλου (${gender}) - ${modelUsed}. ${instructions ? `Οδηγίες: ${instructions}` : ''}`,
            image: image
        }]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Fetch Base64 safely
            const base64Image = await fetchImageAsBase64(image);

            // Pass instructions to Gemini with PRO toggle
            const generatedImage = await generateVirtualModel(
                base64Image, 
                gender === 'Unisex' ? 'Women' : gender, 
                category, 
                instructions,
                useProModel
            );
            
            if (generatedImage) {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: 'Ορίστε το εικονικό μοντέλο με το κόσμημά σας!',
                    image: generatedImage
                }]);
            } else {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: 'Δεν κατάφερα να δημιουργήσω την εικόνα. Δοκιμάστε ξανά με μια πιο καθαρή φωτογραφία.'
                }]);
            }

        } catch (error: any) {
            console.error(error);
            // Handle Free Tier 429 Error specifically
            if (error.message.includes("limit: 0") || error.message.includes("quota")) {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: '⚠️ **Περιορισμός Πακέτου**: Η δημιουργία εικόνων απαιτεί χρεώσιμο API Key (Paid Tier). Το τρέχον κλειδί είναι Free Tier και υποστηρίζει μόνο κείμενο (Copywriting/Trends).'
                }]);
                showToast("Απαιτείται αναβάθμιση API Key για εικόνες.", "error");
            } else {
                showToast(`Σφάλμα: ${error.message}`, "error");
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: `Παρουσιάστηκε σφάλμα: ${error.message}`
                }]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleTrends = async () => {
        if (!inputValue.trim()) return;
        
        const query = inputValue;
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: query }]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await generateTrendAnalysis(query);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: response,
                isTrendAnalysis: true
            }]);
        } catch (error) {
            showToast("Σφάλμα ανάλυσης τάσεων.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = () => {
        if (mode === 'copywriting') handleCopywriting();
        if (mode === 'virtual-model') handleVirtualModel();
        if (mode === 'trends') handleTrends();
    };

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        return products
            .filter(p => p.sku.includes(searchTerm.toUpperCase()) || p.category.includes(searchTerm))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true })); // Natural Sort
    }, [products, searchTerm]);

    // Helper for placeholder text
    const getPlaceholder = () => {
        if (mode === 'copywriting') return "Προσθέστε ειδικές οδηγίες (π.χ. 'Τόνισε την αντοχή')...";
        if (mode === 'virtual-model') return "Προσθέστε οδηγίες (π.χ. 'Σκοτεινό φόντο', 'Ξανθιά κοπέλα')...";
        return "Ρωτήστε για τις τάσεις (π.χ. 'Τι φοριέται το καλοκαίρι 2025;')...";
    };

    return (
        <div className="h-[calc(100vh-100px)] flex gap-6">
            {/* Sidebar Controls */}
            <div className="w-72 flex flex-col gap-4 shrink-0">
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
                    <h1 className="text-2xl font-black flex items-center gap-2 mb-1">
                        <Sparkles className="text-yellow-300 animate-pulse" /> AI Studio
                    </h1>
                    <p className="text-indigo-100 text-sm opacity-90">Ilios Intelligent Suite</p>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-2 flex flex-col gap-1">
                    <button onClick={() => setMode('copywriting')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'copywriting' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <Feather size={20} className={mode === 'copywriting' ? 'text-indigo-600' : ''}/> Έξυπνη Περιγραφή
                    </button>
                    <button onClick={() => setMode('virtual-model')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'virtual-model' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <User size={20} className={mode === 'virtual-model' ? 'text-pink-600' : ''}/> 
                        <div className="flex flex-col items-start">
                            <span>Εικονικό Μοντέλο</span>
                        </div>
                    </button>
                    <button onClick={() => setMode('trends')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'trends' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <TrendingUp size={20} className={mode === 'trends' ? 'text-emerald-600' : ''}/> Τάσεις Αγοράς
                    </button>
                </div>
                
                {/* Model Selector Toggle - Nano Banana / Nano Banana Pro */}
                {mode === 'virtual-model' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 animate-in fade-in slide-in-from-top-2 space-y-4">
                        
                        {/* High Quality Toggle */}
                        <label className="flex items-center justify-between cursor-pointer group select-none">
                            <div className="flex items-center gap-2">
                                <div className={`p-2 rounded-lg transition-colors ${useProModel ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <Zap size={18} className={useProModel ? 'fill-current' : ''} />
                                </div>
                                <div>
                                    <div className={`font-bold text-sm ${useProModel ? 'text-slate-800' : 'text-slate-500'}`}>
                                        {useProModel ? 'Nano Banana Pro' : 'Nano Banana'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">{useProModel ? 'Gemini 3 Pro (HQ)' : 'Gemini 2.5 (Fast)'}</div>
                                </div>
                            </div>
                            <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${useProModel ? 'bg-amber-500' : 'bg-slate-200'}`} onClick={() => setUseProModel(!useProModel)}>
                                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${useProModel ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                        </label>
                    </div>
                )}
                
                {/* Context Panel (Inputs) */}
                {mode !== 'trends' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 flex flex-col gap-4 flex-1">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Επιλογη Προϊοντος</div>
                        
                        {getActiveImage() ? (
                            <div className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square">
                                <img src={getActiveImage()!} alt="Selected" className="w-full h-full object-cover" />
                                <button onClick={() => { setShowProductSearch(true); /* Keep search active to switch */ }} className="absolute top-2 left-2 bg-white/80 p-1.5 rounded-full hover:bg-blue-500 hover:text-white transition-colors shadow-sm text-slate-700">
                                    <Search size={16}/>
                                </button>
                                <button onClick={() => { setSelectedProduct(null); setUploadedImage(null); }} className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors shadow-sm">
                                    <X size={16}/>
                                </button>
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-2 backdrop-blur-sm">
                                    {selectedProduct ? selectedProduct.sku : 'Ανεβασμένη Εικόνα'}
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setShowProductSearch(true)} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all gap-2">
                                    <Search size={24}/>
                                    <span className="text-xs font-bold">Αναζήτηση</span>
                                </button>
                                <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all gap-2 cursor-pointer">
                                    <Camera size={24}/>
                                    <span className="text-xs font-bold">Μεταφόρτωση</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </label>
                            </div>
                        )}

                        {selectedProduct && mode === 'copywriting' && (
                             <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <strong>Πλαίσιο:</strong> {selectedProduct.category}, {selectedProduct.gender}, {selectedProduct.weight_g}g.
                             </div>
                        )}
                        {selectedProduct && mode === 'virtual-model' && (
                             <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <strong>Στόχος:</strong> Μοντέλο ({selectedProduct.gender === 'Unisex' ? 'Γυναίκα' : (selectedProduct.gender === 'Men' ? 'Άντρας' : 'Γυναίκα')})
                             </div>
                        )}
                    </div>
                )}
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
                
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-slate-50/30">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'model' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}>
                                {msg.role === 'model' ? <Sparkles size={18} /> : <div className="font-bold">ME</div>}
                            </div>
                            
                            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                                {msg.text && (
                                    <div className={`p-5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-slate-900 text-white rounded-tr-none' 
                                            : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                                    }`}>
                                        {msg.text}
                                        {msg.isTrendAnalysis && (
                                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1 text-xs font-bold text-emerald-600">
                                                <Search size={12}/> Επαληθεύτηκε με Google Search
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {msg.image && (
                                    <div className="relative group rounded-2xl overflow-hidden border border-slate-200 shadow-md max-w-sm bg-white p-2">
                                        <div className="aspect-square rounded-xl overflow-hidden relative">
                                            <img src={msg.image} alt="AI Generated" className="w-full h-full object-cover" />
                                        </div>
                                        {msg.role === 'model' && (
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <a href={msg.image} download={`ilios-ai-${msg.id}.png`} className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-xs hover:scale-105 transition-transform shadow-lg">Λήψη</a>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {msg.role === 'model' && msg.text && (
                                    <button onClick={() => { navigator.clipboard.writeText(msg.text!); showToast('Αντιγράφηκε', 'success'); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors pl-1">
                                        <Copy size={12}/> Αντιγραφή
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4">
                             <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-400 flex items-center justify-center shrink-0">
                                <Sparkles size={18} className="animate-pulse" />
                            </div>
                            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 flex items-center gap-2 text-slate-500 text-sm shadow-sm">
                                <Loader2 size={16} className="animate-spin" /> 
                                {mode === 'virtual-model' ? (useProModel ? 'To Nano Banana Pro επεξεργάζεται...' : 'To Nano Banana (Flash) επεξεργάζεται...') : 'Επεξεργασία...'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-slate-100 bg-white">
                    <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all shadow-inner">
                        <textarea
                            disabled={isLoading || (mode !== 'trends' && !getActiveImage())}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                            placeholder={getPlaceholder()}
                            className="flex-1 bg-transparent border-none focus:ring-0 p-2 text-sm max-h-32 min-h-[44px] resize-none outline-none text-slate-800 placeholder-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            rows={1}
                        />
                        <button 
                            onClick={handleSubmit}
                            disabled={isLoading || (mode !== 'trends' && !getActiveImage())}
                            className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 shadow-md shadow-indigo-200"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Product Selection Modal */}
            {showProductSearch && (
                <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl flex flex-col max-h-[80vh] animate-in zoom-in-95">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Επιλογή Προϊόντος</h3>
                            <button onClick={() => setShowProductSearch(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                        </div>
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    autoFocus
                                    className="w-full pl-9 p-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-500" 
                                    placeholder="Αναζήτηση SKU..." 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {filteredProducts.map(p => (
                                <div key={p.sku} onClick={() => handleProductSelect(p)} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border-b border-slate-50 last:border-0">
                                    <img src={p.image_url} className="w-12 h-12 rounded bg-slate-100 object-cover" alt={p.sku}/>
                                    <div>
                                        <div className="font-bold text-sm text-slate-800">{p.sku}</div>
                                        <div className="text-xs text-slate-500">{p.category} • {p.gender}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
