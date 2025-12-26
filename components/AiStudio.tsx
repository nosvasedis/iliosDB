
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateMarketingCopy, generateVirtualModel, generateTrendAnalysis, identifyProductFromImage } from '../lib/gemini';
import { ChatMessage, Product } from '../types';
import { Sparkles, Send, Search, Loader2, Copy, TrendingUp, Feather, User, Camera, Image as ImageIcon, CheckCircle, X, Zap, AlertTriangle, Crown, Eye, Package } from 'lucide-react';
import { useUI } from './UIProvider';
import { api, R2_PUBLIC_URL, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { compressImage } from '../utils/imageHelpers';
import ProductDetails from './ProductDetails';

type Mode = 'copywriting' | 'virtual-model' | 'trends' | 'lookup';

const parseBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const parseStyledText = (text: string) => {
    if (!text) return null;
    
    const cleanText = text.replace(/\*\*\*/g, '').replace(/---/g, '');
    const lines = cleanText.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];
    
    const flushList = (keyPrefix: number) => {
        if (currentList.length > 0) {
            elements.push(
                <ul key={`list-${keyPrefix}`} className="list-disc pl-5 space-y-1.5 text-slate-700 marker:text-emerald-400 my-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {currentList}
                </ul>
            );
            currentList = [];
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        if (!trimmed) {
            flushList(index);
            return;
        }

        if (trimmed.startsWith('#')) {
            flushList(index);
            const content = trimmed.replace(/^#+\s*/, '');
            elements.push(
                <h3 key={index} className="text-lg font-bold text-[#060b00] mt-5 mb-2 flex items-center gap-2">
                    {content}
                </h3>
            );
        }
        else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            const content = trimmed.replace(/^[-•]\s+/, '');
            currentList.push(<li key={`li-${index}`}>{parseBold(content)}</li>);
        }
        else {
            flushList(index);
            elements.push(
                <p key={index} className="mb-2 text-slate-700 leading-relaxed text-[15px]">
                    {parseBold(trimmed)}
                </p>
            );
        }
    });
    
    flushList(lines.length); 
    return <div className="space-y-1">{elements}</div>;
};

export default function AiStudio() {
    const { showToast } = useUI();
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    
    const [mode, setMode] = useState<Mode>('copywriting');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    
    const [inputValue, setInputValue] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const [useProModel, setUseProModel] = useState(false);
    
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [viewProduct, setViewProduct] = useState<Product | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messages.length === 0) {
            setMessages([{ 
                id: 'init', 
                role: 'model', 
                text: 'Καλώς ήρθατε στο Ilios AI Studio! Είμαι εδώ για να βοηθήσω με έξυπνες περιγραφές, δημιουργία εικονικών μοντέλων, ανάλυση τάσεων και αναγνώριση προϊόντων.' 
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
        setUploadedImage(null); 
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
                    setSelectedProduct(null); 
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

    const fetchImageAsBase64 = async (url: string): Promise<string> => {
        if (url.startsWith('data:')) return url;

        try {
            let fetchUrl = url;
            let headers: HeadersInit = {};

            if (url.startsWith(R2_PUBLIC_URL)) {
                const parts = url.split('/');
                const filename = parts[parts.length - 1];
                fetchUrl = `${CLOUDFLARE_WORKER_URL}/${filename}`;
                headers = { 'Authorization': AUTH_KEY_SECRET };
            }

            const response = await fetch(fetchUrl, { headers });
            
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            
            const blob = await response.blob();
            
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

    const handleCopywriting = async () => {
        const image = getActiveImage();
        if (!image) {
            showToast("Παρακαλώ επιλέξτε προϊόν ή ανεβάστε φωτογραφία.", "error");
            return;
        }

        const userText = inputValue;
        const msgId = Date.now().toString();

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
            let prompt = "Γράψε μια ελκυστική περιγραφή προϊόντος για e-shop και social media.";
            if (selectedProduct) {
                prompt += `\nΤεχνικά Χαρακτηριστικά:\n- SKU: ${selectedProduct.sku}\n- Κατηγορία: ${selectedProduct.category}\n- Υλικό/Επιμετάλλωση: ${selectedProduct.plating_type}\n- Βάρος: ${selectedProduct.weight_g}g\n- Φύλο: ${selectedProduct.gender}`;
                if (selectedProduct.variants) {
                    const variants = selectedProduct.variants.map(v => v.description).join(', ');
                    prompt += `\n- Παραλλαγές: ${variants}`;
                }
            }
            if (userText) prompt += `\n\nΕπιπλέον Οδηγίες Χρήστη: ${userText}`;

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
        const gender = selectedProduct?.gender || 'Women'; 
        const category = selectedProduct?.category || 'jewelry';
        const instructions = inputValue;

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
            const base64Image = await fetchImageAsBase64(image);

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

    const handleLookup = async () => {
        const image = getActiveImage();
        if (!image) {
            showToast("Παρακαλώ ανεβάστε μια φωτογραφία του προϊόντος.", "error");
            return;
        }

        const msgId = Date.now().toString();
        setMessages(prev => [...prev, { id: msgId, role: 'user', text: 'Αναγνώριση κωδικού από εικόνα.', image }]);
        setIsLoading(true);

        try {
            const base64Image = await fetchImageAsBase64(image);
            const context = products?.map(p => `${p.sku} - ${p.category} - ${p.description || ''}`).join('\n') || "";
            
            const identifiedSku = await identifyProductFromImage(base64Image, context);
            const match = products?.find(p => p.sku === identifiedSku);

            if (match) {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: `Εντοπίστηκε ο κωδικός: **${match.sku}** (${match.category}).\n\nΜπορείτε να δείτε τις λεπτομέρειες του προϊόντος πατώντας το κουμπί παρακάτω.`,
                    attachedProductSku: match.sku
                }]);
            } else {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: 'Δεν κατάφερα να αντιστοιχίσω την εικόνα με κάποιον υπάρχοντα κωδικό στη βάση δεδομένων.'
                }]);
            }
        } catch (error: any) {
            showToast(`Σφάλμα αναγνώρισης: ${error.message}`, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = () => {
        if (mode === 'copywriting') handleCopywriting();
        if (mode === 'virtual-model') handleVirtualModel();
        if (mode === 'trends') handleTrends();
        if (mode === 'lookup') handleLookup();
    };

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        return products
            .filter(p => p.sku.includes(searchTerm.toUpperCase()) || p.category.includes(searchTerm))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true })); 
    }, [products, searchTerm]);

    const getPlaceholder = () => {
        if (mode === 'copywriting') return "Προσθέστε ειδικές οδηγίες (π.χ. 'Τόνισε την αντοχή')...";
        if (mode === 'virtual-model') return "Προσθέστε οδηγίες (π.χ. 'Σκοτεινό φόντο', 'Ξανθιά κοπέλα')...";
        if (mode === 'lookup') return "Περιγράψτε το προϊόν αν θέλετε να βοηθήσετε την αναζήτηση...";
        return "Ρωτήστε για τις τάσεις (π.χ. 'Τι φοριέται το καλοκαίρι 2025;')...";
    };

    return (
        <div className="h-[calc(100vh-6rem)] flex gap-6">
            <div className="w-72 flex flex-col gap-4 shrink-0 hidden md:flex">
                <div className="bg-gradient-to-br from-[#060b00] to-emerald-900 rounded-3xl p-6 text-white shadow-lg shadow-black/30">
                    <h1 className="text-2xl font-black flex items-center gap-2 mb-1">
                        <Sparkles className="text-yellow-300 animate-pulse" /> AI Studio
                    </h1>
                    <p className="text-emerald-100 text-sm opacity-90">Ilios Intelligent Suite</p>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-2 flex flex-col gap-1">
                    <button onClick={() => setMode('copywriting')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'copywriting' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <Feather size={20} className={mode === 'copywriting' ? 'text-[#060b00]' : ''}/> Έξυπνη Περιγραφή
                    </button>
                    <button onClick={() => setMode('virtual-model')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'virtual-model' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <User size={20} className={mode === 'virtual-model' ? 'text-pink-600' : ''}/> Εικονικό Μοντέλο
                    </button>
                    <button onClick={() => setMode('lookup')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'lookup' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <Eye size={20} className={mode === 'lookup' ? 'text-blue-600' : ''}/> Αναγνώριση (Lookup)
                    </button>
                    <button onClick={() => setMode('trends')} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === 'trends' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <TrendingUp size={20} className={mode === 'trends' ? 'text-emerald-600' : ''}/> Τάσεις Αγοράς
                    </button>
                </div>
                
                {mode === 'virtual-model' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 animate-in fade-in slide-in-from-top-2 space-y-4">
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
                
                {mode !== 'trends' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 flex flex-col gap-4 flex-1">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Επιλογη Προϊοντος</div>
                        
                        {getActiveImage() ? (
                            <div className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square">
                                <img src={getActiveImage()!} alt="Selected" className="w-full h-full object-cover" />
                                <button onClick={() => { setShowProductSearch(true); }} className="absolute top-2 left-2 bg-white/80 p-1.5 rounded-full hover:bg-blue-500 hover:text-white transition-colors shadow-sm text-slate-700">
                                    <Search size={16}/>
                                </button>
                                <button onClick={() => { setSelectedProduct(null); setUploadedImage(null); }} className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full hover:bg-red-50 hover:text-white transition-colors shadow-sm">
                                    <X size={16}/>
                                </button>
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs p-2 backdrop-blur-sm">
                                    {selectedProduct ? selectedProduct.sku : 'Ανεβασμένη Εικόνα'}
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setShowProductSearch(true)} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all gap-2">
                                    <Search size={24}/>
                                    <span className="text-xs font-bold">Αναζήτηση</span>
                                </button>
                                <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all gap-2 cursor-pointer">
                                    <Camera size={24}/>
                                    <span className="text-xs font-bold">Μεταφόρτωση</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </label>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
                
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-slate-50/30">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'model' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'}`}>
                                {msg.role === 'model' ? <Sparkles size={18} /> : <div className="font-bold">ME</div>}
                            </div>
                            
                            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                                {msg.text && (
                                    <div className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-[#060b00] text-white rounded-tr-none whitespace-pre-wrap' 
                                            : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                                    }`}>
                                        {msg.role === 'model' ? parseStyledText(msg.text) : msg.text}
                                        
                                        {msg.isTrendAnalysis && (
                                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1 text-xs font-bold text-emerald-600">
                                                <Search size={12}/> Επαληθεύτηκε με Google Search
                                            </div>
                                        )}
                                        
                                        {msg.attachedProductSku && (
                                            <div className="mt-4 pt-4 border-t border-slate-100">
                                                <button 
                                                    onClick={() => setViewProduct(products?.find(p => p.sku === msg.attachedProductSku) || null)}
                                                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-700 transition-all shadow-md"
                                                >
                                                    <Package size={14}/> Προβολη Προϊοντος
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {msg.image && (
                                    <div className="relative group rounded-2xl overflow-hidden border border-slate-200 shadow-md max-w-sm bg-white p-2">
                                        <div className="aspect-square rounded-xl overflow-hidden relative">
                                            <img src={msg.image} alt="AI Content" className="w-full h-full object-cover" />
                                        </div>
                                        {msg.role === 'model' && (
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <a href={msg.image} download={`ilios-ai-${msg.id}.png`} className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-xs hover:scale-105 transition-transform shadow-lg">Λήψη</a>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4">
                             <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-400 flex items-center justify-center shrink-0">
                                <Sparkles size={18} className="animate-pulse" />
                            </div>
                            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 flex items-center gap-2 text-slate-500 text-sm shadow-sm">
                                <Loader2 size={16} className="animate-spin" /> 
                                {mode === 'lookup' ? 'To Ilios Vision αναγνωρίζει το προϊόν...' : 'Επεξεργασία...'}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white">
                    <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-400 transition-all shadow-sm">
                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            placeholder={getPlaceholder()}
                            disabled={isLoading}
                            className="flex-1 bg-transparent p-2 outline-none text-slate-800 placeholder-slate-400 min-w-0"
                        />
                        <button 
                            onClick={handleSubmit} 
                            disabled={isLoading || (mode === 'trends' ? !inputValue.trim() : !getActiveImage())} 
                            className="bg-[#060b00] text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-900 transition-colors shadow-md"
                        >
                            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                        </button>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-slate-400">
                            Powered by Google Gemini 3 Flash • Ilios Intelligent Vision
                        </span>
                    </div>
                </div>
            </div>

            {/* Product Selector Modal */}
            {showProductSearch && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg">Επιλογή Προϊόντος</h3>
                            <button onClick={() => setShowProductSearch(false)}><X size={20}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                <input 
                                    type="text" 
                                    placeholder="Αναζήτηση SKU..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    autoFocus
                                    className="w-full pl-10 p-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
                            {filteredProducts.map(p => (
                                <div key={p.sku} onClick={() => handleProductSelect(p)} className="cursor-pointer group">
                                    <div className="aspect-square bg-slate-100 rounded-xl overflow-hidden mb-2 relative border border-slate-200 group-hover:border-emerald-500 transition-colors">
                                        {p.image_url ? (
                                            <img src={p.image_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>
                                        )}
                                        <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <CheckCircle className="text-white drop-shadow-md" size={32}/>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="font-bold text-sm text-slate-800">{p.sku}</div>
                                        <div className="text-[10px] text-slate-500 truncate">{p.category}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {viewProduct && settings && collections && molds && (
                <ProductDetails 
                    product={viewProduct} 
                    allProducts={products || []} 
                    allMaterials={[]} 
                    onClose={() => setViewProduct(null)} 
                    setPrintItems={() => {}} 
                    settings={settings} 
                    collections={collections} 
                    allMolds={molds} 
                    viewMode="registry" 
                />
            )}
        </div>
    );
}
