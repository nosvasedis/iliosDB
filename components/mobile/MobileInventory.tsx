
import React, { useState, useMemo } from 'react';
import { Product } from '../../types';
import { Search, Box, MapPin, ImageIcon, Camera } from 'lucide-react';
import { formatCurrency, findProductByScannedCode } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';

interface Props {
  products: Product[];
  onProductSelect: (p: Product) => void;
}

interface MobileInventoryItemProps {
    product: Product;
    onClick: () => void;
    totalStock: number;
}

const MobileInventoryItem: React.FC<MobileInventoryItemProps> = ({ product, onClick, totalStock }) => {
    const variantsCount = product.variants?.length || 0;

    return (
        <div 
            onClick={onClick}
            className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
            <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shrink-0 relative">
                {product.image_url ? (
                    <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={20}/></div>
                )}
                {variantsCount > 0 && (
                    <div className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[9px] px-1.5 py-0.5 rounded-tl-lg font-bold">
                        +{variantsCount}
                    </div>
                )}
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <h3 className="font-black text-slate-800 text-base truncate">{product.sku}</h3>
                    {product.selling_price > 0 && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{formatCurrency(product.selling_price)}</span>}
                </div>
                <p className="text-xs text-slate-500 font-medium truncate mb-2">{product.category}</p>
                
                <div className="flex gap-2">
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${totalStock > 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                        <Box size={10}/> {totalStock}
                    </div>
                    {/* Only showing master locations summary for simplicity */}
                    {(product.sample_qty > 0) && (
                        <div className="px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 flex items-center gap-1">
                            <MapPin size={10}/> Δειγμ: {product.sample_qty}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function MobileInventory({ products, onProductSelect }: Props) {
    const [search, setSearch] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const { showToast } = useUI();

    // Logic: Calculate total stock for each product (including variants & locations)
    // Filter out products with 0 total stock.
    const inventoryList = useMemo(() => {
        const lower = search.toLowerCase();
        
        return products
            .map(p => {
                // Calculate stock across ALL locations and variants
                let pTotal = 0;
                
                // 1. Master/Main Stock (if any)
                if (p.location_stock) {
                    pTotal += Object.values(p.location_stock).reduce((a, b) => a + b, 0);
                } else {
                    pTotal += (p.stock_qty || 0) + (p.sample_qty || 0);
                }

                // 2. Variant Stock (if variants exist and have separate stock)
                if (p.variants && p.variants.length > 0) {
                    // Note: Usually location_stock on product includes variants if flattened, 
                    // but depending on data structure we might need to sum variants explicitly if not using a flat view.
                    // The `api.getProducts` implementation merges variant stock into location_stock if configured,
                    // but strictly speaking `p.stock_qty` is master stock.
                    // Let's sum variants explicitly to be safe for display if location_stock isn't aggregated at product level.
                    // *However*, in `lib/supabase.ts`, `p.location_stock` is just for the master SKU.
                    
                    // Simple Sum:
                    p.variants.forEach(v => {
                        if (v.location_stock) {
                            pTotal += Object.values(v.location_stock).reduce((a, b) => a + b, 0);
                        } else {
                            pTotal += (v.stock_qty || 0);
                        }
                    });
                }

                return { product: p, totalStock: pTotal };
            })
            .filter(item => item.totalStock > 0) // HIDE ZERO STOCK ITEMS
            .filter(item => {
                if (!search) return true;
                return item.product.sku.toLowerCase().includes(lower) || 
                       item.product.category.toLowerCase().includes(lower);
            })
            .slice(0, 50); // Performance limit
    }, [products, search]);

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            onProductSelect(match.product);
            setShowScanner(false);
            showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Αποθήκη</h1>
            
            <div className="flex gap-2 mb-4 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Αναζήτηση..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                    />
                </div>
                <button 
                    onClick={() => setShowScanner(true)}
                    className="bg-slate-900 text-white p-3 rounded-xl shadow-md active:scale-95 transition-transform"
                >
                    <Camera size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {inventoryList.map(item => (
                    <MobileInventoryItem 
                        key={item.product.sku} 
                        product={item.product} 
                        totalStock={item.totalStock}
                        onClick={() => onProductSelect(item.product)} 
                    />
                ))}
                {inventoryList.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium flex flex-col items-center">
                        <Box size={32} className="mb-2 opacity-50"/>
                        Δεν βρέθηκε απόθεμα.<br/>
                        <span className="text-xs opacity-70 mt-1">Ελέγξτε το Μητρώο για κωδικούς χωρίς στοκ.</span>
                    </div>
                )}
            </div>

            {showScanner && (
                <BarcodeScanner 
                    onScan={handleScan} 
                    onClose={() => setShowScanner(false)} 
                />
            )}
        </div>
    );
}
