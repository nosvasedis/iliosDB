import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  PackagePlus, 
  Warehouse, 
  DollarSign, 
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Gem,
  MapPin
} from 'lucide-react';
import { GlobalSettings, Product, Material, ProductVariant, RecipeItem, Mold, Gender, PlatingType } from './types';
import { INITIAL_SETTINGS, MOCK_PRODUCTS, MOCK_MATERIALS } from './constants';
import { supabase } from './lib/supabase';

// Pages
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import NewProduct from './components/NewProduct';
import PricingManager from './components/PricingManager';
import SettingsPage from './components/SettingsPage';
import MaterialsPage from './components/MaterialsPage';
import MoldsPage from './components/MoldsPage';

type Page = 'dashboard' | 'inventory' | 'new-product' | 'pricing' | 'settings' | 'materials' | 'molds';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Application State
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [molds, setMolds] = useState<Mold[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>(INITIAL_SETTINGS);

  // FETCH DATA FROM SUPABASE
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // 1. Fetch Global Settings
        const { data: settingsData } = await supabase.from('global_settings').select('*').single();
        if (settingsData) {
          setSettings({
            silver_price_gram: Number(settingsData.silver_price_gram),
            loss_percentage: Number(settingsData.loss_percentage)
          });
        }

        // 2. Fetch Materials
        const { data: matData } = await supabase.from('materials').select('*');
        if (matData) {
          setMaterials(matData.map((m: any) => ({
             id: m.id,
             name: m.name,
             type: m.type,
             cost_per_unit: Number(m.cost_per_unit),
             unit: m.unit
          })));
        }

        // 3. Fetch Molds
        const { data: moldData } = await supabase.from('molds').select('*');
        if (moldData) {
            setMolds(moldData.map((m: any) => ({
                code: m.code,
                location: m.location,
                description: m.description
            })));
        }

        // 4. Fetch Products and Relational Data
        const { data: prodData } = await supabase.from('products').select('*');
        const { data: varData } = await supabase.from('product_variants').select('*');
        const { data: recData } = await supabase.from('recipes').select('*');
        const { data: prodMoldsData } = await supabase.from('product_molds').select('*'); // Join table

        if (prodData) {
          const assembledProducts: Product[] = prodData.map((p: any) => {
            // Find Variants
            const pVariants: ProductVariant[] = varData
              ?.filter((v: any) => v.product_sku === p.sku)
              .map((v: any) => ({
                suffix: v.suffix,
                description: v.description,
                stock_qty: v.stock_qty
              })) || [];

            // Find Recipe
            const pRecipeRaw = recData?.filter((r: any) => r.parent_sku === p.sku) || [];
            const pRecipe: RecipeItem[] = pRecipeRaw.map((r: any) => {
               if (r.type === 'raw') {
                 return { type: 'raw', id: r.material_id, quantity: Number(r.quantity) };
               } else {
                 return { type: 'component', sku: r.component_sku, quantity: Number(r.quantity) };
               }
            });
            
            // Find Molds (Many-to-Many)
            const pMolds = prodMoldsData
                ?.filter((pm: any) => pm.product_sku === p.sku)
                .map((pm: any) => pm.mold_code) || [];

            return {
              sku: p.sku,
              prefix: p.prefix,
              category: p.category,
              gender: p.gender as Gender,
              image_url: p.image_url || 'https://picsum.photos/300/300',
              weight_g: Number(p.weight_g),
              plating_type: p.plating_type as PlatingType,
              active_price: Number(p.active_price),
              draft_price: Number(p.draft_price),
              selling_price: Number(p.selling_price || 0),
              stock_qty: p.stock_qty,
              sample_qty: p.sample_qty,
              molds: pMolds,
              is_component: p.is_component,
              variants: pVariants,
              recipe: pRecipe,
              labor: {
                casting_cost: Number(p.labor_casting),
                setter_cost: Number(p.labor_setter),
                technician_cost: Number(p.labor_technician),
                plating_cost: Number(p.labor_plating)
              }
            };
          });
          setProducts(assembledProducts);
        }

      } catch (error) {
        console.error("Error loading data from Supabase:", error);
        // Fallback to mocks if offline or error
        setProducts(MOCK_PRODUCTS);
        setMaterials(MOCK_MATERIALS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleNav = (page: Page) => {
    setActivePage(page);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 size={48} className="animate-spin mb-4 text-amber-500" />
        <p className="font-medium">Σύνδεση με Supabase...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden text-slate-800 bg-slate-100">
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-40 bg-slate-900 text-white transition-all duration-300 ease-in-out shadow-xl flex flex-col
          ${isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
        `}
      >
        <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} border-b border-slate-700 h-24`}>
          {!isCollapsed ? (
            <div className="flex items-center justify-center w-full">
              <img src="/logo.png" alt="Ilios Kosmima" className="h-16 w-auto object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 flex items-center justify-center">
               <img src="/logo.png" alt="Icon" className="w-full h-full object-contain" />
            </div>
          )}
          
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white absolute right-4 top-4">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 py-6 px-2 space-y-2 overflow-y-auto overflow-x-hidden">
          <NavItem 
            icon={<LayoutDashboard size={22} />} 
            label="Πίνακας Ελέγχου" 
            isActive={activePage === 'dashboard'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('dashboard')} 
          />
          <NavItem 
            icon={<Warehouse size={22} />} 
            label="Αποθήκη / Προϊόντα" 
            isActive={activePage === 'inventory'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('inventory')} 
          />
          <NavItem 
            icon={<Gem size={22} />} 
            label="Υλικά" 
            isActive={activePage === 'materials'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('materials')} 
          />
          <NavItem 
            icon={<MapPin size={22} />} 
            label="Λάστιχα" 
            isActive={activePage === 'molds'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('molds')} 
          />
          <NavItem 
            icon={<PackagePlus size={22} />} 
            label="Νέο Προϊόν" 
            isActive={activePage === 'new-product'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('new-product')} 
          />
          <NavItem 
            icon={<DollarSign size={22} />} 
            label="Τιμολόγηση" 
            isActive={activePage === 'pricing'} 
            isCollapsed={isCollapsed}
            onClick={() => handleNav('pricing')} 
          />
          <div className="pt-4 mt-4 border-t border-slate-700">
            <NavItem 
              icon={<SettingsIcon size={22} />} 
              label="Ρυθμίσεις" 
              isActive={activePage === 'settings'} 
              isCollapsed={isCollapsed}
              onClick={() => handleNav('settings')} 
            />
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-900">
           <button 
             onClick={toggleCollapse}
             className="hidden md:flex w-full items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
           >
             {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-sm"><ChevronLeft size={16}/> <span>Σύμπτυξη</span></div>}
           </button>
           
           {!isCollapsed && (
              <div className="mt-4 text-xs text-slate-500 text-center">
                <p>Ag925: <span className="text-amber-500">{settings.silver_price_gram}€</span></p>
                <p>v1.2.0</p>
              </div>
           )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        
        {/* Mobile Header */}
        <header className="md:hidden bg-white p-4 shadow-sm flex items-center justify-between z-30 sticky top-0">
           <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600">
             <Menu size={24} />
           </button>
           <div className="h-8">
              <img src="/logo.png" alt="Ilios Kosmima" className="h-full w-auto object-contain" />
           </div>
           <div className="w-6"></div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 relative">
          <div className="max-w-7xl mx-auto">
            {activePage === 'dashboard' && <Dashboard products={products} settings={settings} />}
            {activePage === 'inventory' && <Inventory products={products} materials={materials} />}
            {activePage === 'materials' && <MaterialsPage materials={materials} setMaterials={setMaterials} />}
            {activePage === 'molds' && <MoldsPage molds={molds} setMolds={setMolds} />}
            {activePage === 'new-product' && <NewProduct products={products} materials={materials} setProducts={setProducts} molds={molds} />}
            {activePage === 'pricing' && <PricingManager products={products} setProducts={setProducts} settings={settings} setSettings={setSettings} materials={materials} />}
            {activePage === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} />}
          </div>
        </div>
      </main>
    </div>
  );
}

const NavItem = ({ icon, label, isActive, onClick, isCollapsed }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean }) => (
  <button
    onClick={onClick}
    title={isCollapsed ? label : ''}
    className={`
      w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative
      ${isActive ? 'bg-amber-500 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
    `}
  >
    <div className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
      {icon}
    </div>
    {!isCollapsed && <span className="font-medium truncate">{label}</span>}
    {isCollapsed && (
      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl">
        {label}
      </div>
    )}
  </button>
);