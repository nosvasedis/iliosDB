
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { ChatMessage } from '../../types';
import MobileScreenHeader from './MobileScreenHeader';
import { generateMarketingCopy, generateTrendAnalysis, identifyProductFromImage } from '../../lib/gemini';
import { compressImage } from '../../utils/imageHelpers';
import { useUI } from '../UIProvider';
import { api, R2_PUBLIC_URL, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET } from '../../lib/supabase';

// Helper to fetch image as base64
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
        if (!response.ok) throw new Error(`Fetch failed`);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export default function MobileAiStudio() {
    const { showToast } = useUI();
    const [messages, setMessages] = useState<ChatMessage[]>([{ 
        id: 'init', 
        role: 'model', 
        text: 'Γεια σας! Είμαι το Ilios AI. Μπορώ να σας βοηθήσω με περιγραφές, αναγνώριση προϊόντων από φωτογραφίες ή ανάλυση τάσεων.' 
    }]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Simple logic: if text looks like a question about trends, use trend analysis. Otherwise generic chat.
            // In a real app, this would be smarter.
            let responseText = '';
            if (input.toLowerCase().includes('τάσεις') || input.toLowerCase().includes('μόδα')) {
                responseText = await generateTrendAnalysis(input);
            } else {
                // Fallback to simple marketing copy generation as a general chat
                responseText = await generateMarketingCopy(input);
            }
            
            setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'model', text: responseText }]);
        } catch (error) {
            showToast("Σφάλμα επικοινωνίας.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setIsLoading(true);
            try {
                const blob = await compressImage(file);
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    
                    // Add user message with image
                    setMessages(prev => [...prev, { 
                        id: Date.now().toString(), 
                        role: 'user', 
                        text: 'Αναγνώριση προϊόντος / Δημιουργία λεζάντας',
                        image: base64 
                    }]);

                    // Attempt recognition first, then captioning
                    try {
                        const allProducts = await api.getProducts();
                        const context = allProducts.map(p => `${p.sku} - ${p.category}`).join('\n');
                        
                        // 1. Identify
                        const sku = await identifyProductFromImage(base64, context);
                        
                        // 2. Caption
                        const caption = await generateMarketingCopy("Γράψε μια σύντομη λεζάντα Instagram για αυτό το κόσμημα.", base64);

                        let reply = "";
                        if (sku && sku !== 'UNKNOWN') reply += `🔍 **Αναγνωρίστηκε:** ${sku}\n\n`;
                        reply += `✨ **Πρόταση:** ${caption}`;

                        setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'model', text: reply }]);

                    } catch (err) {
                        setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'model', text: 'Δεν κατάφερα να αναλύσω την εικόνα.' }]);
                    }
                    setIsLoading(false);
                };
            } catch (err) {
                showToast("Σφάλμα εικόνας.", "error");
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <MobileScreenHeader
                icon={Sparkles}
                title="AI Studio"
                subtitle="Βοηθός κοσμημάτων"
                iconClassName="text-violet-600"
            />

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'model' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'}`}>
                            {msg.role === 'model' ? <Sparkles size={14} /> : <span className="text-[10px] font-bold">ME</span>}
                        </div>
                        <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                                ? 'bg-slate-900 text-white rounded-tr-none' 
                                : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                        }`}>
                            {msg.image && (
                                <img src={msg.image} className="w-full rounded-lg mb-2 border border-white/20" alt="Upload" />
                            )}
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                            <Loader2 size={14} className="animate-spin" />
                        </div>
                        <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 text-slate-400 text-xs italic">
                            Σκέφτομαι...
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0 pb-24">
                <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-full p-1 pl-4 shadow-sm">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ρωτήστε κάτι..."
                        className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder-slate-400"
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    
                    <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                    />
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors">
                        <Camera size={20}/>
                    </button>
                    
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="w-10 h-10 bg-[#060b00] rounded-full flex items-center justify-center text-white shadow-md disabled:opacity-50 transition-all active:scale-90"
                    >
                        <Send size={16}/>
                    </button>
                </div>
            </div>
        </div>
    );
}
