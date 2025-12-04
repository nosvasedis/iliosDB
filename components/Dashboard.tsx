

import React, { useState, useEffect } from 'react';
import { Product, GlobalSettings } from '../types';
import { TrendingUp, Package, AlertTriangle, Layers, ArrowUpRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';

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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[#060b00] tracking-tight">Πίνακας Ελέγχου</h1>
        <p className="text-slate-500 mt-2">Επισκόπηση της παραγωγής και της αποθήκης.</p>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Αξία Αποθήκης" 
          value={formatCurrency(totalValue)} 
          icon={<TrendingUp className="text-emerald-600" size={24} />} 
          bg="bg-emerald-50"
          border="border-emerald-100"
        />
        <StatCard 
          title="Κωδικοί (SKUs)" 
          value={products.length.toString()} 
          icon={<Layers className="text-[#060b00]" size={24} />} 
          bg="bg-slate-50"
          border="border-slate-100"
        />
        <StatCard 
          title="Σύνολο Τεμαχίων" 
          value={totalStock.toString()} 
          icon={<Package className="text-amber-600" size={24} />} 
          bg="bg-amber-50"
          border="border-amber-100"
        />
        <StatCard 
          title="Χαμηλό Απόθεμα" 
          value={lowStock.toString()} 
          icon={<AlertTriangle className="text-rose-600" size={24} />} 
          bg="bg-rose-50"
          border="border-rose-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100 min-w-0 transition-all hover:shadow-md">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#060b00]">Κατανομή Κατηγοριών</h3>
          </div>
          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{fontSize: 12, fill: '#64748b'}} 
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis 
                  tick={{fontSize: 12, fill: '#64748b'}} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar 
                  dataKey="count" 
                  name="Πλήθος" 
                  fill="#f59e0b" 
                  radius={[6, 6, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Settings View */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 h-fit transition-all hover:shadow-md">
          <h3 className="text-xl font-bold mb-6 text-[#060b00]">Τρέχουσες Τιμές</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-slate-600 font-medium">Τιμή Ασημιού</span>
              <span className="font-mono font-bold text-xl text-[#060b00]">{formatDecimal(settings.silver_price_gram, 3)} €/g</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-slate-600 font-medium">Ποσοστό Απώλειας</span>
              <span className="font-mono font-bold text-xl text-[#060b00]">{formatDecimal(settings.loss_percentage)}%</span>
            </div>
            
            <div className="pt-4 border-t border-slate-100 mt-4">
               <div className="text-sm text-slate-400 flex items-center gap-2">
                 <ArrowUpRight size={16} />
                 <span>Τελευταία ενημέρωση: Σήμερα</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ title, value, icon, bg, border }: { title: string, value: string, icon: React.ReactNode, bg: string, border: string }) => (
  <div className={`p-6 rounded-3xl border shadow-sm ${bg} ${border} flex items-center justify-between transition-transform hover:-translate-y-1`}>
    <div>
      <p className="text-slate-600 text-sm font-semibold tracking-wide uppercase opacity-80">{title}</p>
      <p className="text-3xl font-black text-[#060b00] mt-2 tracking-tight">{value}</p>
    </div>
    <div className="p-4 bg-white rounded-2xl shadow-sm bg-opacity-60 backdrop-blur-sm">{icon}</div>
  </div>
);
