
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateMarketingCopy, generateVirtualModel, generateTrendAnalysis, identifyJewelryFromImage } from '../lib/gemini';
import { ChatMessage, Product } from '../types';
import { Sparkles, Send, Search, Loader2, Copy, TrendingUp, Feather, User, Camera, Image as ImageIcon, CheckCircle, X, Zap, AlertTriangle, Crown, SearchCode } from 'lucide-react';
import { useUI } from './UIProvider';
import { api, R2_PUBLIC_URL, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, GEMINI_API_KEY } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { compressImage } from '../utils/imageHelpers';
import ProductDetails from './ProductDetails';

type Mode = 'copywriting' | 'virtual-model' | 'trends' | 'visual-search';

const parseStyledText = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return <div className="space-y-1">{lines.map((line, i) => <p key={i} className="mb-2 text-slate-700 leading-relaxed text-[15px]">{line}</p>)}</div>;
};

export default function AiStudio() {
    const { showToast } = useUI();
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    
    const [mode, setMode] = useState<Mode>('copywriting');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [useProModel, setUseProModel] = useState(false);
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [detailedProduct, setDetailedProduct] = useState<Product | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messages.length === 0) setMessages([{ id: 'init', role: 'model', text: 'Καλώς ήρθατε στο Ilios AI Studio! Επιλέξτε εργαλείο για να ξεκινήσουμε.' }]);
    }, []);

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const blob = await compressImage(e.target.files[0]);
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => { setUploadedImage(reader.result as string); setSelectedProduct(null); if (mode === 'visual-search') handleVisualSearch(reader.result as string); };
            } catch (err) { showToast("Error", "error"); }
        }
    };

    const handleVisualSearch = async (img: string) => {
        setIsLoading(true);
        try {
            const analysis = await identifyJewelryFromImage(img);
            const matches = products?.filter(p => {
                const matchesCat = p.category.toLowerCase().includes(analysis.category.toLowerCase());
                const matchesKeywords = analysis.keywords.some((k: string) => p.sku.toLowerCase().includes(k.toLowerCase()) || p.category.toLowerCase().includes(k.toLowerCase()));
                return matchesCat || matchesKeywords;
            }).slice(0, 3) || [];

            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                text: `Εντοπίστηκε: **${analysis.category}**. ${analysis.description}\n\nΠιθανές αντιστοιχίες στο μητρώο:`,
                image: matches.length > 0 ? undefined : undefined
            }]);
            
            if (matches.length > 0) {
                matches.forEach(m => {
                    setMessages(prev => [...prev, { id: m.sku, role: 'model', text: `SKU: ${m.sku} - ${m.category}`, attachedProductSku: m.sku }]);
                });
            }
        } catch (err) { showToast("Visual search failed", "error"); }
        finally { setIsLoading(true); }
    };

    const fetchImageAsBase64 = async (url: string): Promise<string> => {
        if (url.startsWith('data:')) return url;
        const response = await fetch(url.startsWith(R2_PUBLIC_URL) ? `${CLOUDFLARE_WORKER_URL}/${url.split('/').pop()}` : url, { headers: url.startsWith(R2_PUBLIC_URL) ? { 'Authorization': AUTH_KEY_SECRET } : {} });
        const blob = await response.blob();
        return new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result as string); r.readAsDataURL(blob); });
    };

    const handleSubmit = async () => {
        const image = uploadedImage || selectedProduct?.image_url;
        if (mode === 'copywriting' && image) {
            setIsLoading(true);
            const base64 = await fetchImageAsBase64(image);
            const res = await generateMarketingCopy(inputValue || "Περιγραφή προϊόντος", base64);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: 'Generate Copy', image }, { id: (Date.now()+1).toString(), role: 'model', text: res }]);
            setIsLoading(false);
        } else if (mode === 'trends') {
            setIsLoading(true);
            const res = await generateTrendAnalysis(inputValue);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: inputValue }, { id: (Date.now()+1).toString(), role: 'model', text: res, isTrendAnalysis: true }]);
            setIsLoading(false);
        }
    };

    return (
        <div className="h-[calc(100vh-6rem)] flex gap-6">
            <div className="w-72 flex flex-col gap-4 shrink-0 hidden md:flex">
                <div className="bg-gradient-to-br from-[#060b00] to-emerald-900 rounded-3xl p-6 text-white shadow-lg"><h1 className="text-2xl font-black flex items-center gap-2"><Sparkles className="text-yellow-300" /> AI Studio</h1></div>
                <div className="bg-white rounded-3xl shadow-sm border p-2 flex flex-col gap-1">
                    {[
                        { id: 'copywriting', label: 'Περιγραφές', icon: Feather },
                        { id: 'visual-search', label: 'Οπτική Αναζήτηση', icon: SearchCode },
                        { id: 'virtual-model', label: 'Μοντέλο', icon: User },
                        { id: 'trends', label: 'Τάσεις', icon: TrendingUp }
                    ].map(btn => (
                        <button key={btn.id} onClick={() => setMode(btn.id as any)} className={`p-3 rounded-xl flex items-center gap-3 font-bold transition-all ${mode === btn.id ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}><btn.icon size={20}/> {btn.label}</button>
                    ))}
                </div>
                <div className="bg-white rounded-3xl border p-4 flex flex-col gap-4 flex-1">
                    <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all cursor-pointer">
                        <Camera size={24}/><span className="text-xs font-bold">Μεταφόρτωση</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </label>
                </div>
            </div>
            <div className="flex-1 bg-white rounded-3xl shadow-sm border flex flex-col overflow-hidden">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-[#060b00] text-white' : 'bg-white text-slate-800 border'}`}>
                                {parseStyledText(msg.text || '')}
                                {msg.attachedProductSku && <button onClick={() => setDetailedProduct(products?.find(p=>p.sku===msg.attachedProductSku) || null)} className="mt-2 text-xs font-bold text-blue-600 underline">Προβολή SKU: {msg.attachedProductSku}</button>}
                            </div>
                        </div>
                    ))}
                    {isLoading && <Loader2 className="animate-spin mx-auto text-emerald-500" />}
                </div>
                <div className="p-4 border-t bg-white">
                    <div className="flex gap-2 bg-white border rounded-2xl p-2"><input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Γράψτε οδηγίες..." className="flex-1 p-2 outline-none"/><button onClick={handleSubmit} className="bg-[#060b00] text-white p-3 rounded-xl"><Send size={20} /></button></div>
                </div>
            </div>
            {detailedProduct && <ProductDetails product={detailedProduct} allProducts={products!} allMaterials={materials!} onClose={() => setDetailedProduct(null)} setPrintItems={()=>{}} settings={settings!} collections={collections!} allMolds={molds!} viewMode="registry" />}
        </div>
    );
}
