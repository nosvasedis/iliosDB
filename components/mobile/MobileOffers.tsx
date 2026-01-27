
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET } from '../../lib/supabase';
import { Offer, OrderStatus, Product, Customer, OrderItem, VatRegime } from '../../types';
import { FileText, Plus, Search, Loader2, ChevronRight, Check, Ban, Trash2, Printer, Edit, X, User, Phone, Coins, Percent, Save, RefreshCw, ScanBarcode, Box, ImageIcon, Minus } from 'lucide-react';
import { useUI } from '../UIProvider';
import { formatCurrency, formatDecimal, calculateProductCost, calculateSuggestedWholesalePrice, findProductByScannedCode } from '../../utils/pricingEngine';
import BarcodeScanner from '../BarcodeScanner';

interface Props {
    onPrintOffer: (offer: Offer) => void;
}

export default function MobileOffers({ onPrintOffer }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: offers, isLoading: loadingOffers } = useQuery({ queryKey: ['offers'], queryFn: api.getOffers });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  const [isCreating, setIsCreating] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [search, setSearch] = useState('');

  // --- BUILDER STATE ---
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customSilverPrice, setCustomSilverPrice] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [vatRate, setVatRate] = useState<number>(VatRegime.Standard);
  const [offerNotes, setOfferNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  
  // --- INPUT STATE ---
  const [skuInput, setSkuInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Initializer
  useEffect(() => {
      if (isCreating && settings && customSilverPrice === 0 && !editingOffer) {
          setCustomSilverPrice(settings.silver_price_gram);
      }
  }, [isCreating, settings]);

  // Recalculate Prices when Silver Changes
  useEffect(() => {
      if (isCreating && items.length > 0 && products && materials && settings) {
          setItems(prev => prev.map(item => {
              const product = products.find(p => p.sku === item.sku);
              if (!product) return item;
              
              const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
              const costCalc = calculateProductCost(product, tempSettings, materials, products);
              const weight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));
              const newPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);
              
              return { ...item, price_at_order: newPrice };
          }));
      }
  }, [customSilverPrice, isCreating]);

  // Filtered Lists
  const filteredOffers = useMemo(() => {
      if (!offers) return [];
      return offers.filter(o => 
          o.customer_name.toLowerCase().includes(search.toLowerCase()) || 
          o.id.toLowerCase().includes(search.toLowerCase())
      );
  }, [offers, search]);

  const filteredCustomers = useMemo(() => {
      if (!customers || !customerName) return [];
      return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
  }, [customers, customerName]);

  const handleSelectCustomer = (c: Customer) => {
      setCustomerId(c.id);
      setCustomerName(c.full_name);
      setCustomerPhone(c.phone || '');
      
      // Auto-set VAT Rate
      if (c.vat_rate !== undefined && c.vat_rate !== null) {
          setVatRate(c.vat_rate);
      } else {
          setVatRate(VatRegime.Standard);
      }

      setShowCustomerSearch(false);
  };

  const handleEditOffer = (offer: Offer) => {
      setEditingOffer(offer);
      setCustomerName(offer.customer_name);
      setCustomerPhone(offer.customer_phone || '');
      setCustomerId(offer.customer_id || null);
      setCustomSilverPrice(offer.custom_silver_price);
      setDiscountPercent(offer.discount_percent);
      setVatRate(offer.vat_rate !== undefined ? offer.vat_rate : VatRegime.Standard);
      setOfferNotes(offer.notes || '');
      setItems(offer.items);
      setIsCreating(true);
  };

  const fetchLivePrice = async () => {
    setIsFetchingPrice(true);
    try {
      const response = await fetch(`${CLOUDFLARE_WORKER_URL}/price/silver`, {
          method: 'GET',
          headers: { 'Authorization': AUTH_KEY_SECRET }
      });
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      const price = parseFloat(data.price.toFixed(3));
      setCustomSilverPrice(price);
      showToast(`Τιμή: ${formatDecimal(price, 3)} €/g`, 'success');
    } catch (e) {
      showToast("Σφάλμα λήψης τιμής.", "error");
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const handleSearchInput = (val: string) => {
      setSkuInput(val);
      if (!products) return;
      const term = val.toUpperCase();
      if (term.length < 2) { setSuggestions([]); return; }
      
      const numericMatch = term.match(/\d+/);
      const numberTerm = numericMatch ? numericMatch[0] : null;

      const results = products.filter(p => {
          if (p.is_component) return false;
          if (p.sku.startsWith(term)) return true;
          if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
          return false;
      }).slice(0, 5);
      setSuggestions(results);
  };

  const addItem = (product: Product, variantSuffix?: string) => {
      if (!products || !materials || !settings) return;
      
      const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
      const costCalc = calculateProductCost(product, tempSettings, materials, products);
      const weight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));
      const unitPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);

      const newItem: OrderItem = {
          sku: product.sku,
          variant_suffix: variantSuffix,
          quantity: 1,
          price_at_order: unitPrice,
          product_details: product
      };

      setItems(prev => {
          const existing = prev.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix);
          if (existing >= 0) {
              const updated = [...prev];
              updated[existing].quantity += 1;
              return updated;
          }
          return [newItem, ...prev];
      });
      
      setSkuInput('');
      setSuggestions([]);
      showToast("Προστέθηκε.", "success");
  };

  const handleScan = (code: string) => {
      if (!products) return;
      const match = findProductByScannedCode(code, products);
      if (match && !match.product.is_component) {
          addItem(match.product, match.variant?.suffix);
          setShowScanner(false);
      } else {
          showToast("Δεν βρέθηκε ή είναι εξάρτημα.", "error");
      }
  };

  const handleSave = async () => {
      if (!customerName) { showToast("Εισάγετε πελάτη.", "error"); return; }
      if (items.length === 0) { showToast("Προσθέστε είδη.", "error"); return; }

      const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
      const discountAmt = subtotal * (discountPercent / 100);
      const total = (subtotal - discountAmt) * (1 + vatRate);

      const payload: Offer = {
          id: editingOffer?.id || crypto.randomUUID(),
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_id: customerId || undefined,
          items,
          custom_silver_price: customSilverPrice,
          discount_percent: discountPercent,
          vat_rate: vatRate,
          total_price: total,
          status: editingOffer?.status || 'Pending',
          created_at: editingOffer?.created_at || new Date().toISOString(),
          notes: offerNotes
      };

      try {
          if (editingOffer) await api.updateOffer(payload);
          else await api.saveOffer(payload);
          
          queryClient.invalidateQueries({ queryKey: ['offers'] });
          setIsCreating(false);
          showToast("Αποθηκεύτηκε.", "success");
      } catch (e) {
          showToast("Σφάλμα αποθήκευσης.", "error");
      }
  };

  const handleConvert = async (offer: Offer) => {
      if (!await confirm({ title: 'Μετατροπή', message: 'Δημιουργία παραγγελίας από προσφορά;', confirmText: 'Ναι' })) return;
      try {
           // Create Order Logic
           const now = new Date();
           const year = now.getFullYear().toString().slice(-2);
           const month = (now.getMonth() + 1).toString().padStart(2, '0');
           const day = now.getDate().toString().padStart(2, '0');
           const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
           const newOrderId = `ORD-${year}${month}${day}-${random}`;

           await api.saveOrder({
               id: newOrderId,
               customer_id: offer.customer_id,
               customer_name: offer.customer_name,
               customer_phone: offer.customer_phone,
               created_at: new Date().toISOString(),
               status: 'Pending',
               items: offer.items,
               total_price: offer.total_price,
               notes: `From Offer #${offer.id.slice(0,6)}. ${offer.notes || ''}`,
               custom_silver_rate: offer.custom_silver_price,
               vat_rate: offer.vat_rate
           } as any);

           await api.updateOffer({ ...offer, status: 'Accepted' });
           queryClient.invalidateQueries({ queryKey: ['offers'] });
           queryClient.invalidateQueries({ queryKey: ['orders'] });
           showToast("Η παραγγελία δημιουργήθηκε!", "success");
      } catch (e) {
          showToast("Σφάλμα μετατροπής.", "error");
      }
  };

  const handleDecline = async (offer: Offer) => {
      if (!await confirm({ title: 'Απόρριψη', message: 'Απόρριψη προσφοράς;', isDestructive: true })) return;
      await api.updateOffer({ ...offer, status: 'Declined' });
      queryClient.invalidateQueries({ queryKey: ['offers'] });
  };

  const handleDelete = async (id: string) => {
      if (!await confirm({ title: 'Διαγραφή', message: 'Οριστική διαγραφή;', isDestructive: true })) return;
      await api.deleteOffer(id);
      queryClient.invalidateQueries({ queryKey: ['offers'] });
  };
  
  const handleStartCreate = (offer?: Offer) => {
        if (offer) {
            handleEditOffer(offer);
        } else {
            setEditingOffer(null);
            setCustomerName('');
            setCustomerPhone('');
            setCustomerId(null);
            setCustomSilverPrice(settings?.silver_price_gram || 0);
            setDiscountPercent(0);
            setVatRate(VatRegime.Standard);
            setOfferNotes('');
            setItems([]);
            setIsCreating(true);
        }
  };

  // ---------------- UI RENDERING ----------------

  if (loadingOffers) return <div className="p-12 text-center text-slate-400">Φόρτωση προσφορών...</div>;

  if (isCreating) {
      const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
      const grandTotal = (subtotal * (1 - discountPercent/100)) * (1 + vatRate);

      return (
          <div className="flex flex-col h-[calc(100vh-100px)] bg-slate-50">
              {/* Header */}
              <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
                  <div>
                      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                          {editingOffer ? 'Επεξεργασία Προσφοράς' : 'Νέα Προσφορά'}
                      </h2>
                      <p className="text-sm text-slate-500">Δημιουργήστε μια προσαρμοσμένη οικονομική προσφορά.</p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => { setIsCreating(false); setEditingOffer(null); setItems([]); setVatRate(VatRegime.Standard); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">Ακύρωση</button>
                      <button onClick={handleSave} className="px-6 py-2 bg-[#060b00] text-white font-bold rounded-xl shadow-lg hover:bg-black transition-colors flex items-center gap-2">
                          <Save size={18}/> Αποθήκευση
                      </button>
                  </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                  {/* Left Panel: Controls */}
                  <div className="lg:w-1/3 bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-6 custom-scrollbar z-0">
                      
                      {/* Customer */}
                      <div className="space-y-3">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-wide flex items-center gap-2"><User size={14}/> Πελάτης</label>
                          <div className="relative">
                              <input 
                                  className={`w-full p-3 bg-slate-50 border rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 ${customerId ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}
                                  placeholder="Αναζήτηση..."
                                  value={customerName}
                                  onChange={e => { setCustomerName(e.target.value); setShowCustomerSearch(true); if(!e.target.value) setCustomerId(null); }}
                                  onFocus={() => setShowCustomerSearch(true)}
                              />
                              {showCustomerSearch && customerName && !customerId && filteredCustomers.length > 0 && (
                                  <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden">
                                      {filteredCustomers.map(c => (
                                          <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 font-medium text-sm">
                                              {c.full_name}
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                          <div className="flex items-center gap-2 border-t border-slate-50 pt-2">
                              <Phone size={14} className="text-slate-400"/>
                              <input className="flex-1 outline-none text-sm text-slate-600 font-medium placeholder-slate-300" placeholder="Τηλέφωνο..." value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}/>
                          </div>
                      </div>

                      {/* Pricing Parameters */}
                      <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 space-y-4">
                          <label className="text-xs font-black text-amber-700 uppercase tracking-wide flex items-center gap-2"><Coins size={14}/> Παράμετροι Τιμολόγησης</label>
                          
                          <div>
                              <label className="text-[10px] font-bold text-amber-600/70 uppercase mb-1 block">Τιμή Ασημιού (€/g)</label>
                              <div className="flex gap-2">
                                  <input 
                                      type="number" step="0.01" 
                                      value={customSilverPrice} 
                                      onChange={e => setCustomSilverPrice(parseFloat(e.target.value) || 0)} 
                                      className="flex-1 p-2 bg-white border border-amber-200 rounded-lg font-mono font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500/20"
                                  />
                                  <button onClick={fetchLivePrice} disabled={isFetchingPrice} className="p-2 bg-amber-200 text-amber-800 rounded-lg hover:bg-amber-300 transition-colors">
                                      {isFetchingPrice ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
                                  </button>
                              </div>
                              <p className="text-[10px] text-amber-600/60 mt-1 italic">Οι τιμές των ειδών θα υπολογιστούν αυτόματα με βάση αυτή την τιμή.</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="text-[10px] font-bold text-amber-600/70 uppercase mb-1 block">Έκπτωση (%)</label>
                                  <div className="relative">
                                      <input 
                                          type="number" min="0" max="100" 
                                          value={discountPercent} 
                                          onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} 
                                          className="w-full p-2 bg-white border border-amber-200 rounded-lg font-mono font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500/20 pr-8"
                                      />
                                      <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400"/>
                                  </div>
                              </div>
                              <div>
                                  <label className="text-[10px] font-bold text-amber-600/70 uppercase mb-1 block">Καθεστώς ΦΠΑ</label>
                                  <select 
                                    value={vatRate} 
                                    onChange={(e) => setVatRate(parseFloat(e.target.value))} 
                                    className="w-full p-2 bg-white border border-amber-200 rounded-lg font-bold text-sm text-amber-900 outline-none cursor-pointer"
                                  >
                                    <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                    <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                    <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                  </select>
                              </div>
                          </div>
                      </div>

                      {/* Add Items */}
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Προσθήκη Ειδών</h3>
                          
                          {/* By SKU */}
                          <div className="flex gap-2">
                              <input 
                                  className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold uppercase placeholder-slate-400 focus:ring-2 focus:ring-slate-800/20"
                                  placeholder="SKU ή Εύρος (π.χ. DA100-DA105)..."
                                  value={skuInput}
                                  onChange={e => handleSearchInput(e.target.value)}
                              />
                              <button onClick={handleAddItem} className="p-3 bg-slate-800 text-white rounded-xl hover:bg-black transition-colors shadow-md">
                                  <Plus size={20}/>
                              </button>
                          </div>

                          {/* By Collection */}
                          <div className="flex gap-2">
                              <select 
                                  value={selectedCollectionId}
                                  onChange={e => setSelectedCollectionId(parseInt(e.target.value))}
                                  className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm text-slate-700 cursor-pointer"
                              >
                                  <option value="">Επιλογή Συλλογής...</option>
                                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <button onClick={handleAddCollection} disabled={!selectedCollectionId} className="p-3 bg-pink-100 text-pink-700 border border-pink-200 rounded-xl hover:bg-pink-200 transition-colors disabled:opacity-50">
                                  <FolderKanban size={20}/>
                              </button>
                          </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                           <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Σημειώσεις</label>
                           <textarea value={offerNotes} onChange={e => setOfferNotes(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-slate-800/20"/>
                      </div>
                  </div>

                  {/* Right Panel: Items Table */}
                  <div className="lg:w-2/3 flex flex-col h-full bg-slate-50/30">
                      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                           <table className="w-full text-left text-sm bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-4 pl-6">Εικόνα</th>
                                        <th className="p-4">SKU / Περιγραφή</th>
                                        <th className="p-4 text-center">Βάρος</th>
                                        <th className="p-4 text-right">Τιμή Μον.</th>
                                        <th className="p-4 text-center">Ποσ.</th>
                                        <th className="p-4 text-right">Σύνολο</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4 pl-6">
                                                <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                    {item.product_details?.image_url && <img src={item.product_details.image_url} className="w-full h-full object-cover"/>}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-slate-800">{item.sku}{item.variant_suffix}</div>
                                                <div className="text-xs text-slate-500 truncate max-w-[200px]">{item.product_details?.category}</div>
                                            </td>
                                            <td className="p-4 text-center font-mono text-slate-600">{item.product_details?.weight_g}g</td>
                                            <td className="p-4 text-right font-mono font-bold text-slate-700">{formatCurrency(item.price_at_order)}</td>
                                            <td className="p-4 text-center">
                                                <input 
                                                    type="number" min="1" value={item.quantity} 
                                                    onChange={e => {
                                                        const newQty = parseInt(e.target.value) || 1;
                                                        setItems(prev => prev.map((it, i) => i === idx ? {...it, quantity: newQty} : it));
                                                    }}
                                                    className="w-12 text-center bg-slate-100 rounded border border-slate-200 font-bold outline-none focus:border-blue-400"
                                                />
                                            </td>
                                            <td className="p-4 text-right font-black text-slate-900">{formatCurrency(item.price_at_order * item.quantity)}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-400 italic">Δεν υπάρχουν είδη.</td></tr>}
                                </tbody>
                           </table>
                      </div>

                      {/* Footer Totals */}
                      <div className="bg-white border-t border-slate-200 p-6 flex justify-end gap-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                           <div className="text-right">
                               <div className="text-xs font-bold text-slate-400 uppercase">Υποσύνολο</div>
                               <div className="text-xl font-bold text-slate-700">{formatCurrency(subtotal)}</div>
                           </div>
                           <div className="text-right">
                               <div className="text-xs font-bold text-slate-400 uppercase">Έκπτωση ({discountPercent}%)</div>
                               <div className="text-xl font-bold text-rose-500">-{formatCurrency(discountAmount)}</div>
                           </div>
                           <div className="text-right">
                               <div className="text-xs font-bold text-slate-400 uppercase">Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%)</div>
                               <div className="text-xl font-bold text-slate-600">{formatCurrency(vatAmount)}</div>
                           </div>
                           <div className="text-right pl-6 border-l border-slate-100">
                               <div className="text-xs font-bold text-slate-400 uppercase">Γενικό Σύνολο</div>
                               <div className="text-3xl font-black text-slate-900">{formatCurrency(grandTotal)}</div>
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- LIST VIEW ---
  return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Προσφορές</h1>
                <button onClick={() => handleStartCreate()} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md active:scale-95"><Plus size={24}/></button>
            </div>

            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredOffers.map(o => (
                    <div key={o.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all">
                        <div 
                            onClick={() => handleStartCreate(o)}
                            className="flex justify-between items-start mb-2"
                        >
                            <div>
                                <div className="font-bold text-slate-800">{o.customer_name}</div>
                                <div className="text-[10px] text-slate-400">{new Date(o.created_at).toLocaleDateString('el-GR')}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                                o.status === 'Accepted' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                o.status === 'Declined' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                'bg-amber-50 text-amber-600 border-amber-200'
                            }`}>
                                {o.status === 'Pending' ? 'Εκκρεμεί' : (o.status === 'Accepted' ? 'Εγκρίθηκε' : 'Απορρίφθηκε')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-t border-slate-50 pt-2 mt-2">
                            <div className="flex gap-1">
                                <button onClick={() => onPrintOffer(o)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg"><Printer size={16}/></button>
                                {o.status === 'Pending' && (
                                    <>
                                        <button onClick={() => handleConvert(o)} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><Check size={16}/></button>
                                        <button onClick={() => handleDecline(o)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg"><Ban size={16}/></button>
                                    </>
                                )}
                                <button onClick={() => handleDelete(o.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                            <div className="font-black text-slate-900 text-lg">{formatCurrency(o.total_price)}</div>
                        </div>
                    </div>
                ))}
                {filteredOffers.length === 0 && <div className="text-center py-10 text-slate-400 text-sm font-medium">Δεν βρέθηκαν προσφορές.</div>}
            </div>
        </div>
    );
}
