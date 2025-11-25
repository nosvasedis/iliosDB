import React from 'react';
import { Product, GlobalSettings } from '../types';
import { TrendingUp, Package, AlertTriangle, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  products: Product[];
  settings: GlobalSettings;
}

export default function Dashboard({ products, settings }: Props) {
  const totalStock = products.reduce((acc, p) => acc + p.stock_qty, 0);
  const totalValue = products.reduce((acc, p) => acc + (p.stock_qty * p.active_price), 0);
  const lowStock = products.filter(p => p.stock_qty < 5).length;

  const chartData = [
    { name: 'Δαχτυλίδια', count: products.filter(p => p.category === 'Δαχτυλίδι' || p.category === 'Ring').length },
    { name: 'Βραχιόλια', count: products.filter(p => p.category === 'Βραχιόλι' || p.category === 'Bracelet').length },
    { name: 'Σκουλαρίκια', count: products.filter(p => p.category === 'Σκουλαρίκια' || p.category === 'Earrings').length },
    { name: 'Κολιέ', count: products.filter(p => p.category === 'Μενταγιόν' || p.category === 'Pendant').length },
    { name: 'Σταυροί', count: products.filter(p => p.category === 'Σταυρός' || p.category === 'Cross').length },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Πίνακας Ελέγχου</h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Συνολική Αξία Αποθήκης" 
          value={`${totalValue.toFixed(2)}€`} 
          icon={<TrendingUp className="text-green-500" />} 
          bg="bg-green-50"
        />
        <StatCard 
          title="Κωδικοί Προϊόντων (SKUs)" 
          value={products.length.toString()} 
          icon={<Layers className="text-blue-500" />} 
          bg="bg-blue-50"
        />
        <StatCard 
          title="Σύνολο Τεμαχίων" 
          value={totalStock.toString()} 
          icon={<Package className="text-amber-500" />} 
          bg="bg-amber-50"
        />
        <StatCard 
          title="Χαμηλό Απόθεμα" 
          value={lowStock.toString()} 
          icon={<AlertTriangle className="text-red-500" />} 
          bg="bg-red-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 min-w-0">
          <h3 className="text-lg font-semibold mb-4 text-slate-700">Κατανομή Κατηγοριών</h3>
          {/* Explicit height and overflow hidden to fix Recharts width calculation */}
          <div className="w-full h-[300px] overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{fontSize: 12}} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Settings View */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4 text-slate-700">Τρέχουσες Τιμές</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Τιμή Ασημιού (Ag925)</span>
              <span className="font-mono font-bold text-lg text-slate-800">{settings.silver_price_gram} €/g</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Ποσοστό Απώλειας</span>
              <span className="font-mono font-bold text-lg text-slate-800">{settings.loss_percentage}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ title, value, icon, bg }: { title: string, value: string, icon: React.ReactNode, bg: string }) => (
  <div className={`p-6 rounded-xl border border-slate-100 shadow-sm ${bg} flex items-center justify-between`}>
    <div>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
    <div className="p-3 bg-white rounded-full shadow-sm">{icon}</div>
  </div>
);