import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Search,
  ShoppingBag,
  StickyNote,
  User,
  Wallet,
} from 'lucide-react';
import { Customer, Order, OrderStatus } from '../../types';
import { formatCurrency } from '../../utils/pricingEngine';
import { getSpecialCreationDisplayNote } from '../../utils/specialCreationSku';
import { getOrderStatusClasses, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import CustomerAnalyticsPanel from '../customers/CustomerAnalyticsPanel';

type DetailTab = 'overview' | 'analytics' | 'orders';

interface Props {
  customer: Customer;
  orders: Order[];
  onClose: () => void;
  onEdit: () => void;
}

const tabs: Array<{ id: DetailTab; label: string; icon: typeof User }> = [
  { id: 'overview', label: 'Επισκόπηση', icon: User },
  { id: 'analytics', label: 'Ανάλυση', icon: BarChart3 },
  { id: 'orders', label: 'Παραγγελίες', icon: ShoppingBag },
];

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function MobileCustomerDetails({ customer, orders, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [orderQuery, setOrderQuery] = useState('');
  const customerOrders = useMemo(() => orders
    .filter(order => order.status !== OrderStatus.Cancelled && (order.customer_id === customer.id || order.customer_name === customer.full_name))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [customer, orders]);
  const filteredOrders = useMemo(() => {
    const query = normalize(orderQuery.trim());
    if (!query) return customerOrders;
    return customerOrders.filter(order => normalize([
      order.id,
      new Date(order.created_at).toLocaleDateString('el-GR'),
      ...order.items.flatMap(item => [item.sku, item.variant_suffix || '', item.product_details?.category || '', item.notes || '']),
    ].join(' ')).includes(query));
  }, [customerOrders, orderQuery]);
  const totalNet = customerOrders.reduce((sum, order) => sum + order.total_price / (1 + (order.vat_rate ?? 0.24)), 0);
  const latestOrder = customerOrders[0];
  const initials = customer.full_name.trim().split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <header className="shrink-0 border-b border-slate-100 bg-white px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onClose} className="mt-0.5 rounded-xl bg-slate-100 p-2.5 text-slate-500 active:scale-95" aria-label="Επιστροφή στους πελάτες"><ArrowLeft size={19} /></button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-100 bg-cyan-50 text-sm font-black text-cyan-700">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Καρτέλα πελάτη</p>
            <h1 className="truncate text-lg font-black tracking-tight text-slate-900">{customer.full_name}</h1>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{customerOrders.length} παραγγελίες · {formatCurrency(totalNet)} καθαρή αξία παραγγελιών</p>
          </div>
          <button type="button" onClick={onEdit} className="rounded-xl bg-slate-900 p-2.5 text-white shadow-sm active:scale-95" aria-label="Επεξεργασία πελάτη"><Edit3 size={18} /></button>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 custom-scrollbar" role="tablist" aria-label="Καρτέλα πελάτη">
          {tabs.map(item => {
            const Icon = item.icon;
            return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`mobile-customer-${item.id}`} onClick={() => setTab(item.id)} className={`inline-flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[10px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Icon size={14} />{item.label}</button>;
          })}
        </div>
      </header>

      <main id={`mobile-customer-${tab}`} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 custom-scrollbar">
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700"><Wallet size={11} /> Καθαρή αξία</p><p className="mt-2 font-mono text-xl font-black text-emerald-950">{formatCurrency(totalNet)}</p></div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-blue-700"><ShoppingBag size={11} /> Παραγγελίες</p><p className="mt-2 font-mono text-xl font-black text-blue-950">{customerOrders.length}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-slate-400"><Receipt size={11} /> Μ.Ο. αξίας</p><p className="mt-2 font-mono text-lg font-black text-slate-900">{formatCurrency(customerOrders.length ? totalNet / customerOrders.length : 0)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-slate-400"><Calendar size={11} /> Τελευταία</p><p className="mt-2 text-base font-black text-slate-900">{latestOrder ? new Date(latestOrder.created_at).toLocaleDateString('el-GR') : '—'}</p></div>
            </div>
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-xs font-black text-slate-900"><Building2 size={15} className="text-cyan-600" /> Στοιχεία επικοινωνίας και τιμολόγησης</h2>
              <div className="mt-4 space-y-3">
                {[{ icon: Phone, label: 'Τηλέφωνο', value: customer.phone }, { icon: Mail, label: 'Email', value: customer.email }, { icon: MapPin, label: 'Διεύθυνση', value: customer.address }, { icon: Receipt, label: 'ΑΦΜ', value: customer.vat_number }].map(row => { const Icon = row.icon; return <div key={row.label} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><Icon size={15} className="mt-0.5 shrink-0 text-slate-400" /><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{row.label}</p><p className="mt-0.5 break-words text-xs font-bold text-slate-700">{row.value || 'Δεν έχει καταχωρηθεί'}</p></div></div>; })}
              </div>
            </section>
            {customer.notes && <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><h2 className="flex items-center gap-2 text-xs font-black text-amber-950"><StickyNote size={15} /> Σημειώσεις</h2><p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-relaxed text-amber-900">{customer.notes}</p></section>}
          </div>
        )}

        {tab === 'analytics' && <CustomerAnalyticsPanel customer={customer} orders={orders} compact onOpenOrders={query => { setOrderQuery(query || ''); setTab('orders'); }} />}

        {tab === 'orders' && (
          <div className="space-y-3">
            <div className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={orderQuery} onChange={event => setOrderQuery(event.target.value)} placeholder="Κωδικός, ημερομηνία, SKU, κατηγορία…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15" /></div>
              <p className="mt-2 text-[10px] font-semibold text-slate-500">{filteredOrders.length} από {customerOrders.length} παραγγελίες</p>
            </div>
            {filteredOrders.length > 0 ? filteredOrders.map(order => {
              const net = order.total_price / (1 + (order.vat_rate ?? 0.24));
              return <article key={order.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-[11px] font-black text-slate-800">{order.id}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} τεμ.</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${getOrderStatusClasses(order.status)}`}>{getOrderStatusLabel(order.status)}</span></div><div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3"><div className="flex min-w-0 flex-wrap gap-1">{order.items.slice(0, 4).map((item, index) => { const spNote = getSpecialCreationDisplayNote(item.sku, item.notes); return <span key={item.line_id || `${item.sku}-${index}`} className="max-w-full whitespace-normal break-words rounded-md bg-slate-100 px-1.5 py-1 font-mono text-[9px] font-bold text-slate-500">{item.sku}{spNote ? ` — ${spNote}` : ''}</span>; })}{order.items.length > 4 && <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-500">+{order.items.length - 4}</span>}</div><p className="shrink-0 font-mono text-sm font-black text-slate-900">{formatCurrency(net)}</p></div></article>;
            }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs font-semibold text-slate-500">Δεν βρέθηκαν παραγγελίες.</div>}
          </div>
        )}
      </main>
    </div>
  );
}
