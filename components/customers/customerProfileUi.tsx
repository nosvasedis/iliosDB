import React, { useMemo, useState } from 'react';
import {
  CalendarRange,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  Mail,
  MapPinned,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
  Youtube,
} from 'lucide-react';
import type { Customer, CustomerContact, CustomerExclusivityScope, CustomerProfile, CustomerSocialKey } from '../../types';
import {
  CLIENTELE_META,
  CONTACT_ROLES,
  internationalPhoneDigits,
  isExclusivityActive,
  MONTH_LABELS,
  newContactId,
  normalizeSocialUrl,
  PAYMENT_METHODS,
  POSITIONING_META,
  readCustomerProfile,
  savedSocials,
  seasonLabel,
  SHOP_TYPES,
  SOCIAL_NETWORKS,
  socialDisplayHandle,
  viberLink,
  whatsappLink,
  type SocialNetworkMeta,
} from '../../features/customers/customerProfile';
import { JEWELRY_KIND_OPTIONS, jewelryKindLabel } from '../../features/customers/jewelryKinds';
import { formatRadius, RADIUS_OPTIONS } from '../../features/customers/customerAssortment';
import { useCollections } from '../../hooks/api/useCollections';
import { formatCurrency } from '../../utils/numberFormat';

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function TikTokGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z" />
    </svg>
  );
}

function PinterestGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.64 19.31c-.09-.79-.17-2 .03-2.86l1.17-4.97s-.3-.6-.3-1.48c0-1.39.81-2.43 1.81-2.43.85 0 1.27.64 1.27 1.41 0 .86-.55 2.14-.83 3.33-.24 1 .5 1.81 1.48 1.81 1.78 0 3.15-1.88 3.15-4.58 0-2.39-1.72-4.07-4.18-4.07-2.85 0-4.52 2.14-4.52 4.35 0 .86.33 1.78.74 2.28.08.1.09.19.07.29l-.28 1.13c-.04.18-.15.22-.33.13-1.25-.58-2.03-2.4-2.03-3.87 0-3.15 2.29-6.04 6.6-6.04 3.46 0 6.15 2.47 6.15 5.76 0 3.44-2.17 6.2-5.18 6.2-1.01 0-1.96-.52-2.29-1.15l-.62 2.38c-.23.87-.84 1.96-1.25 2.62A10 10 0 1 0 12 2Z" />
    </svg>
  );
}

export function SocialIcon({ network, size = 16 }: { network: CustomerSocialKey; size?: number }) {
  switch (network) {
    case 'instagram': return <Instagram size={size} />;
    case 'facebook': return <Facebook size={size} />;
    case 'tiktok': return <TikTokGlyph size={size} />;
    case 'youtube': return <Youtube size={size} />;
    case 'pinterest': return <PinterestGlyph size={size} />;
    case 'eshop': return <ShoppingCart size={size} />;
    case 'google_maps': return <MapPinned size={size} />;
    default: return <Globe size={size} />;
  }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export function CollapsiblePane({ icon: Icon, title, badge, preview, defaultOpen = false, open: controlledOpen, onToggle, children, tone = 'slate' }: {
  icon: typeof Users;
  title: string;
  badge?: React.ReactNode;
  /** Shown in the header while collapsed. */
  preview?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
  tone?: 'slate' | 'pink' | 'violet' | 'emerald';
}) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = controlledOpen ?? innerOpen;
  const toggle = () => { const next = !open; setInnerOpen(next); onToggle?.(next); };
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    pink: 'bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white',
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-slate-50/70">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[13px] font-black text-slate-800">{title}{badge}</span>
          {!open && preview && <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{preview}</span>}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-slate-100 px-3.5 py-3.5 animate-in fade-in slide-in-from-top-1 duration-150">{children}</div>}
    </section>
  );
}

function CountBadge({ value }: { value: number }) {
  if (!value) return null;
  return <span className="rounded-full bg-slate-900 px-1.5 py-px text-[10px] font-black text-white">{value}</span>;
}

function Segmented<T extends string>({ value, options, onChange, allowClear = true }: {
  value: T | null | undefined;
  options: Array<{ id: T; label: string; hint?: string }>;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const active = value === opt.id;
        return (
          <button key={opt.id} type="button" title={opt.hint} aria-pressed={active}
            onClick={() => onChange(active && allowClear ? null : opt.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${active ? 'border-[#060b00] bg-[#060b00] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Label({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-bold text-slate-500">
      <span>{children}</span>
      {hint && <span className="text-[10px] font-semibold text-slate-400">{hint}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Read-only views
// ---------------------------------------------------------------------------

function SocialChip({ meta, url, large }: { meta: SocialNetworkMeta; url: string; large?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={`${meta.label}: ${url}`}
      className={`group flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${large ? 'px-3 py-2.5' : 'px-2.5 py-2'}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: meta.color }}>
        <SocialIcon network={meta.key} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{meta.label}</span>
        <span className="block truncate text-[12px] font-black text-slate-800 group-hover:text-sky-700">{socialDisplayHandle(meta.key, url)}</span>
      </span>
      <ExternalLink size={13} className="shrink-0 text-slate-300 group-hover:text-sky-600" />
    </a>
  );
}

/** Small round icons that open each saved page — for cards and headers. */
export function SocialIconRow({ customer, size = 'sm', max }: { customer: Pick<Customer, 'profile'>; size?: 'sm' | 'md'; max?: number }) {
  const links = savedSocials(readCustomerProfile(customer)).slice(0, max ?? Infinity);
  if (!links.length) return null;
  const box = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';
  return (
    <div className="flex flex-wrap items-center gap-1">
      {links.map(({ meta, url }) => (
        <a key={meta.key} href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={`${meta.label} · ${socialDisplayHandle(meta.key, url)}`}
          className={`flex ${box} items-center justify-center rounded-lg text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow`} style={{ background: meta.color }}>
          <SocialIcon network={meta.key} size={size === 'md' ? 15 : 13} />
        </a>
      ))}
    </div>
  );
}

/**
 * Social media pane for the customer card. Collapsed it shows the networks as icons; expanded
 * it lists every saved page — each click opens the page in a new tab.
 */
export function CustomerSocialsPane({ customer, onEdit, defaultOpen }: { customer: Customer; onEdit?: () => void; defaultOpen?: boolean }) {
  const profile = useMemo(() => readCustomerProfile(customer), [customer]);
  const links = savedSocials(profile);
  const mobileDigits = internationalPhoneDigits(customer.mobile_phone || customer.phone, customer.country);
  const viber = internationalPhoneDigits(profile.viber, customer.country) ?? null;
  const whatsapp = internationalPhoneDigits(profile.whatsapp, customer.country) ?? null;
  const messaging = [
    viber ? { key: 'viber', label: 'Viber', href: viberLink(viber), color: '#7360F2', text: profile.viber } : null,
    whatsapp ? { key: 'whatsapp', label: 'WhatsApp', href: whatsappLink(whatsapp), color: '#25D366', text: profile.whatsapp } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; href: string; color: string; text?: string | null }>;
  const total = links.length + messaging.length;

  return (
    <CollapsiblePane
      icon={Instagram}
      tone="pink"
      title="Social media & online"
      badge={<CountBadge value={total} />}
      defaultOpen={defaultOpen ?? total > 0}
      preview={total ? (
        <span className="flex items-center gap-1.5">
          {links.map(({ meta }) => <span key={meta.key} style={{ color: meta.color }}><SocialIcon network={meta.key} size={13} /></span>)}
          {messaging.map(m => <span key={m.key} style={{ color: m.color }}><MessageCircle size={13} /></span>)}
        </span>
      ) : 'Instagram, Facebook, TikTok, ιστοσελίδα…'}
    >
      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-[12px] text-slate-400">Δεν έχουν καταχωρηθεί σελίδες.</p>
          {onEdit && (
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black">
              <Plus size={12} /> Προσθήκη
            </button>
          )}
          {mobileDigits && (
            <div className="flex gap-1.5">
              <a href={viberLink(mobileDigits)} className="rounded-lg bg-[#7360F2]/10 px-2.5 py-1 text-[11px] font-bold text-[#5b47e0]">Viber στο κινητό</a>
              <a href={whatsappLink(mobileDigits)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-bold text-[#128C7E]">WhatsApp στο κινητό</a>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-1.5">
          {links.map(({ meta, url }) => <SocialChip key={meta.key} meta={meta} url={url} />)}
          {messaging.map(m => (
            <a key={m.key} href={m.href} target={m.key === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: m.color }}><MessageCircle size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{m.label}</span>
                <span className="block truncate text-[12px] font-black text-slate-800 group-hover:text-sky-700">{m.text}</span>
              </span>
              <ExternalLink size={13} className="text-slate-300" />
            </a>
          ))}
        </div>
      )}
    </CollapsiblePane>
  );
}

function ProfileFact({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-1.5 py-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-100"><Icon size={13} /></span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="break-words text-[12.5px] font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}

/** Contacts, shop profile, terms, tags and exclusivity — read-only. */
export function CustomerProfileSummary({ customer, collectionNames }: { customer: Customer; collectionNames?: Map<number, string> }) {
  const profile = useMemo(() => readCustomerProfile(customer), [customer]);
  const contacts = profile.contacts ?? [];
  const facts: Array<{ icon: typeof Users; label: string; value: React.ReactNode }> = [];
  if (profile.shop_type) facts.push({ icon: Store, label: 'Τύπος καταστήματος', value: profile.shop_type });
  const audience = [profile.positioning ? POSITIONING_META[profile.positioning].label : null, profile.clientele ? CLIENTELE_META[profile.clientele].label : null].filter(Boolean).join(' · ');
  if (audience) facts.push({ icon: Users, label: 'Θέση αγοράς · κοινό', value: audience });
  if (profile.season) facts.push({ icon: CalendarRange, label: 'Λειτουργία', value: seasonLabel(profile.season) });
  if (profile.opening_hours) facts.push({ icon: Clock, label: 'Ωράριο', value: <span className="whitespace-pre-wrap">{profile.opening_hours}</span> });
  const terms = [
    profile.payment_method,
    profile.credit_days ? `πίστωση ${profile.credit_days} ημ.` : null,
    profile.credit_limit ? `όριο ${formatCurrency(profile.credit_limit)}` : null,
  ].filter(Boolean).join(' · ');
  if (terms) facts.push({ icon: CreditCard, label: 'Εμπορικοί όροι', value: terms });
  const ex = profile.exclusivity;
  const exActive = isExclusivityActive(ex);

  if (!contacts.length && !facts.length && !profile.tags?.length && !ex) return null;

  return (
    <div className="space-y-3">
      {contacts.length > 0 && (
        <div className="space-y-1.5">
          {contacts.map(contact => (
            <div key={contact.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <div className="flex items-center gap-1.5">
                <UserRound size={13} className="shrink-0 text-slate-400" />
                <span className="truncate text-[13px] font-black text-slate-800">{contact.name || '—'}</span>
                {contact.role && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-black uppercase text-slate-500">{contact.role}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold">
                {contact.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-sky-700 hover:underline"><Phone size={10} /> {contact.phone}</a>}
                {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-sky-700 hover:underline"><Mail size={10} /> {contact.email}</a>}
              </div>
              {contact.notes && <div className="mt-0.5 text-[11px] text-slate-400">{contact.notes}</div>}
            </div>
          ))}
        </div>
      )}
      {facts.length > 0 && <div className="space-y-0.5">{facts.map(f => <ProfileFact key={f.label} {...f} />)}</div>}
      {profile.tags && profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.tags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-100"><Tag size={9} /> {tag}</span>)}
        </div>
      )}
      {ex && (ex.enabled || ex.scopes.length > 0) && (
        <div className={`rounded-xl border px-3 py-2.5 text-xs ${exActive ? 'border-violet-200 bg-violet-50 text-violet-950' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
          <div className="flex items-center gap-1.5 font-black">
            <ShieldCheck size={14} className={exActive ? 'text-violet-600' : 'text-slate-400'} />
            {exActive ? `Αποκλειστικότητα σε ακτίνα ${formatRadius(ex.radius_km)}` : 'Αποκλειστικότητα ανενεργή'}
          </div>
          <div className="mt-1 font-semibold">
            {ex.scopes.length === 0 ? 'Όλοι οι κωδικοί που αγοράζει ο πελάτης.' : ex.scopes.map(s => scopeText(s, collectionNames)).join(' · ')}
          </div>
          {ex.until && <div className="mt-0.5 text-[11px] opacity-70">Έως {new Date(ex.until).toLocaleDateString('el-GR')}</div>}
          {ex.notes && <div className="mt-0.5 text-[11px] opacity-80">{ex.notes}</div>}
        </div>
      )}
    </div>
  );
}

function scopeText(scope: CustomerExclusivityScope, collectionNames?: Map<number, string>) {
  if (scope.kind === 'collection') return `Συλλογή ${collectionNames?.get(Number(scope.key)) ?? `#${scope.key}`}`;
  if (scope.kind === 'jewelry_kind') return jewelryKindLabel(scope.key);
  return `Κωδικός ${scope.key}`;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

interface EditorProps {
  value: CustomerProfile;
  onChange: (next: CustomerProfile) => void;
  /** For Viber/WhatsApp «ίδιο με κινητό». */
  mobilePhone?: string | null;
  tagSuggestions?: string[];
  /** Start with the social pane open (e.g. when editing from the social pane). */
  socialsOpen?: boolean;
}

export function CustomerProfileEditor({ value, onChange, mobilePhone, tagSuggestions = [], socialsOpen }: EditorProps) {
  const set = (patch: Partial<CustomerProfile>) => onChange({ ...value, ...patch });
  const socials = value.socials ?? {};
  const filledSocials = SOCIAL_NETWORKS.filter(n => (socials[n.key] ?? '').trim()).length + (value.viber ? 1 : 0) + (value.whatsapp ? 1 : 0);
  const contacts = value.contacts ?? [];
  const { data: collections } = useCollections();
  const [tagDraft, setTagDraft] = useState('');
  const [skuDraft, setSkuDraft] = useState('');

  const updateContact = (id: string, patch: Partial<CustomerContact>) =>
    set({ contacts: contacts.map(c => (c.id === id ? { ...c, ...patch } : c)) });

  const tags = value.tags ?? [];
  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag || tags.some(t => t.toLocaleLowerCase('el-GR') === tag.toLocaleLowerCase('el-GR'))) return;
    set({ tags: [...tags, tag] });
  };

  const ex = value.exclusivity ?? { enabled: false, radius_km: 2, scopes: [] };
  const setEx = (patch: Partial<typeof ex>) => set({ exclusivity: { ...ex, ...patch } });
  const hasScope = (scope: CustomerExclusivityScope) => ex.scopes.some(s => s.kind === scope.kind && s.key === scope.key);
  const toggleScope = (scope: CustomerExclusivityScope) => setEx({
    scopes: hasScope(scope) ? ex.scopes.filter(s => !(s.kind === scope.kind && s.key === scope.key)) : [...ex.scopes, scope],
  });

  const season = value.season ?? null;

  return (
    <div className="space-y-3">
      {/* Social media */}
      <CollapsiblePane
        icon={Instagram}
        tone="pink"
        title="Social media & online"
        badge={<CountBadge value={filledSocials} />}
        defaultOpen={socialsOpen ?? filledSocials > 0}
        preview="Προαιρετικά — Instagram, Facebook, TikTok, ιστοσελίδα, Viber…"
      >
        <p className="mb-3 text-[11px] text-slate-400">Γράψτε το όνομα χρήστη (π.χ. <b>@kosmimata</b>) ή επικολλήστε τον σύνδεσμο. Μετά την αποθήκευση κάθε σελίδα ανοίγει με ένα κλικ.</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map(meta => {
            const raw = socials[meta.key] ?? '';
            const url = normalizeSocialUrl(meta.key, raw);
            return (
              <label key={meta.key} className="block">
                <Label>{meta.label}</Label>
                <div className="flex items-center gap-1.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: meta.color }}><SocialIcon network={meta.key} size={15} /></span>
                  <input
                    className={fieldClass}
                    value={raw}
                    placeholder={meta.placeholder}
                    onChange={e => set({ socials: { ...socials, [meta.key]: e.target.value } })}
                  />
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" title={`Άνοιγμα: ${url}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:text-sky-700">
                      <ExternalLink size={14} />
                    </a>
                  ) : raw.trim() ? (
                    <span className="shrink-0 text-[10px] font-bold text-rose-500" title="Μη έγκυρος σύνδεσμος">✕</span>
                  ) : null}
                </div>
              </label>
            );
          })}
          {(['viber', 'whatsapp'] as const).map(key => (
            <label key={key} className="block">
              <Label hint={mobilePhone && !value[key] ? (
                <button type="button" onClick={() => set({ [key]: mobilePhone })} className="font-bold text-sky-700 hover:underline">ίδιο με κινητό</button>
              ) : undefined}>{key === 'viber' ? 'Viber' : 'WhatsApp'}</Label>
              <div className="flex items-center gap-1.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: key === 'viber' ? '#7360F2' : '#25D366' }}><MessageCircle size={15} /></span>
                <input className={fieldClass} inputMode="tel" value={value[key] ?? ''} placeholder="Αριθμός τηλεφώνου" onChange={e => set({ [key]: e.target.value })} />
              </div>
            </label>
          ))}
        </div>
      </CollapsiblePane>

      {/* Contacts */}
      <CollapsiblePane icon={UserRound} title="Πρόσωπα επικοινωνίας" badge={<CountBadge value={contacts.length} />} defaultOpen={contacts.length > 0}
        preview="Ιδιοκτήτης, υπεύθυνος αγορών, λογιστήριο…">
        <div className="space-y-2.5">
          {contacts.map(contact => (
            <div key={contact.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={fieldClass} placeholder="Ονοματεπώνυμο" value={contact.name} onChange={e => updateContact(contact.id, { name: e.target.value })} />
                <div className="flex gap-1.5">
                  <input className={fieldClass} placeholder="Ρόλος" list="customer-contact-roles" value={contact.role ?? ''} onChange={e => updateContact(contact.id, { role: e.target.value })} />
                  <button type="button" onClick={() => set({ contacts: contacts.filter(c => c.id !== contact.id) })} className="shrink-0 rounded-xl px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Αφαίρεση επαφής"><Trash2 size={15} /></button>
                </div>
                <input className={fieldClass} placeholder="Τηλέφωνο" inputMode="tel" value={contact.phone ?? ''} onChange={e => updateContact(contact.id, { phone: e.target.value })} />
                <input className={fieldClass} placeholder="Email" type="email" value={contact.email ?? ''} onChange={e => updateContact(contact.id, { email: e.target.value })} />
                <input className={`${fieldClass} sm:col-span-2`} placeholder="Σημείωση (π.χ. καλύτερη ώρα επικοινωνίας)" value={contact.notes ?? ''} onChange={e => updateContact(contact.id, { notes: e.target.value })} />
              </div>
            </div>
          ))}
          <datalist id="customer-contact-roles">{CONTACT_ROLES.map(r => <option key={r} value={r} />)}</datalist>
          <button type="button" onClick={() => set({ contacts: [...contacts, { id: newContactId(), name: '' }] })}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 hover:border-slate-400 hover:bg-slate-50">
            <Plus size={14} /> Προσθήκη προσώπου
          </button>
        </div>
      </CollapsiblePane>

      {/* Shop profile */}
      <CollapsiblePane icon={Store} title="Προφίλ καταστήματος" defaultOpen={Boolean(value.shop_type || value.positioning || value.clientele || value.season || value.opening_hours)}
        preview="Τύπος, θέση αγοράς, κοινό, εποχικότητα, ωράριο">
        <div className="space-y-3.5">
          <label className="block">
            <Label>Τύπος καταστήματος</Label>
            <input className={fieldClass} list="customer-shop-types" value={value.shop_type ?? ''} placeholder="π.χ. Κοσμηματοπωλείο" onChange={e => set({ shop_type: e.target.value })} />
            <datalist id="customer-shop-types">{SHOP_TYPES.map(t => <option key={t} value={t} />)}</datalist>
          </label>
          <div>
            <Label>Θέση αγοράς</Label>
            <Segmented value={value.positioning} onChange={v => set({ positioning: v })}
              options={(Object.keys(POSITIONING_META) as Array<keyof typeof POSITIONING_META>).map(id => ({ id, label: POSITIONING_META[id].label, hint: POSITIONING_META[id].hint }))} />
          </div>
          <div>
            <Label>Πελατεία</Label>
            <Segmented value={value.clientele} onChange={v => set({ clientele: v })}
              options={(Object.keys(CLIENTELE_META) as Array<keyof typeof CLIENTELE_META>).map(id => ({ id, label: CLIENTELE_META[id].label }))} />
          </div>
          <div>
            <Label>Λειτουργία</Label>
            <Segmented value={season?.mode ?? null}
              onChange={mode => set({ season: mode ? { mode, open_month: season?.open_month ?? 4, close_month: season?.close_month ?? 10 } : null })}
              options={[{ id: 'year_round', label: 'Όλο τον χρόνο' }, { id: 'seasonal', label: 'Εποχική' }]} />
            {season?.mode === 'seasonal' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                Από
                <select className={`${fieldClass} w-auto`} value={season.open_month ?? 4} onChange={e => set({ season: { ...season, open_month: Number(e.target.value) } })}>
                  {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                έως
                <select className={`${fieldClass} w-auto`} value={season.close_month ?? 10} onChange={e => set({ season: { ...season, close_month: Number(e.target.value) } })}>
                  {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
          <label className="block">
            <Label>Ωράριο / ημέρα αργίας</Label>
            <textarea className={`${fieldClass} min-h-[60px] resize-y`} value={value.opening_hours ?? ''} placeholder="π.χ. Δευ–Σαβ 10:00–22:00, Κυριακή κλειστά" onChange={e => set({ opening_hours: e.target.value })} />
          </label>
        </div>
      </CollapsiblePane>

      {/* Terms */}
      <CollapsiblePane icon={CreditCard} title="Εμπορικοί όροι" defaultOpen={Boolean(value.payment_method || value.credit_days || value.credit_limit)}
        preview="Τρόπος πληρωμής, ημέρες πίστωσης, πιστωτικό όριο">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <Label>Τρόπος πληρωμής</Label>
            <input className={fieldClass} list="customer-payment-methods" value={value.payment_method ?? ''} placeholder="π.χ. Επιταγή" onChange={e => set({ payment_method: e.target.value })} />
            <datalist id="customer-payment-methods">{PAYMENT_METHODS.map(p => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="block">
            <Label>Ημέρες πίστωσης</Label>
            <input className={fieldClass} inputMode="numeric" value={value.credit_days ?? ''} placeholder="π.χ. 60"
              onChange={e => { const v = e.target.value.replace(/\D/g, ''); set({ credit_days: v ? Number(v) : null }); }} />
          </label>
          <label className="block">
            <Label>Πιστωτικό όριο (€)</Label>
            <input className={fieldClass} inputMode="decimal" value={value.credit_limit ?? ''} placeholder="π.χ. 3000"
              onChange={e => { const v = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'); set({ credit_limit: v ? Number(v) : null }); }} />
          </label>
        </div>
      </CollapsiblePane>

      {/* Tags */}
      <CollapsiblePane icon={Tag} title="Ετικέτες" badge={<CountBadge value={tags.length} />} defaultOpen={tags.length > 0}
        preview="Ελεύθερες ετικέτες για αναζήτηση (π.χ. Κρουαζιέρα, Λιμάνι)">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-1 pl-2.5 pr-1 text-[11px] font-bold text-indigo-800 ring-1 ring-indigo-100">
              {tag}
              <button type="button" onClick={() => set({ tags: tags.filter(t => t !== tag) })} className="rounded-full p-0.5 hover:bg-indigo-100" aria-label={`Αφαίρεση ${tag}`}><X size={11} /></button>
            </span>
          ))}
          <input
            className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold outline-none focus:border-slate-400"
            list="customer-tag-suggestions"
            value={tagDraft}
            placeholder="Νέα ετικέτα + Enter"
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); setTagDraft(''); } }}
            onBlur={() => { if (tagDraft.trim()) { addTag(tagDraft); setTagDraft(''); } }}
          />
          <datalist id="customer-tag-suggestions">{tagSuggestions.filter(t => !tags.includes(t)).map(t => <option key={t} value={t} />)}</datalist>
        </div>
      </CollapsiblePane>

      {/* Exclusivity */}
      <CollapsiblePane icon={ShieldCheck} tone="violet" title="Αποκλειστικότητα περιοχής"
        badge={ex.enabled ? <span className="rounded-full bg-violet-600 px-1.5 py-px text-[10px] font-black text-white">ενεργή</span> : undefined}
        defaultOpen={ex.enabled}
        preview="Προστασία του πελάτη από πωλήσεις ίδιων ειδών σε γειτονικά καταστήματα">
        <div className="space-y-3.5">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={ex.enabled} onChange={e => setEx({ enabled: e.target.checked })} />
            <span className="text-xs text-violet-950">
              <b>Έχουμε συμφωνία αποκλειστικότητας με αυτό το κατάστημα.</b>
              <span className="mt-0.5 block text-violet-800/80">Αν γειτονικός πελάτης αγοράσει προστατευμένο είδος, εμφανίζεται κρίσιμη ειδοποίηση στους Πελάτες και κατά τη δημιουργία παραγγελίας.</span>
            </span>
          </label>
          {ex.enabled && (
            <>
              <div>
                <Label>Ακτίνα προστασίας γύρω από κάθε κατάστημα</Label>
                <Segmented allowClear={false} value={String(ex.radius_km)} onChange={v => v && setEx({ radius_km: Number(v) })}
                  options={RADIUS_OPTIONS.map(r => ({ id: String(r), label: formatRadius(r) }))} />
              </div>
              <div>
                <Label hint={ex.scopes.length === 0 ? 'Χωρίς επιλογή: όλοι οι κωδικοί που αγοράζει' : `${ex.scopes.length} επιλογές`}>Τι προστατεύεται</Label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {JEWELRY_KIND_OPTIONS.map(kind => {
                      const scope = { kind: 'jewelry_kind' as const, key: kind.id };
                      const on = hasScope(scope);
                      return <button key={kind.id} type="button" onClick={() => toggleScope(scope)} aria-pressed={on}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${on ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>{kind.label}</button>;
                    })}
                  </div>
                  {collections && collections.length > 0 && (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-slate-50 p-2 custom-scrollbar">
                      {collections.map(col => {
                        const scope = { kind: 'collection' as const, key: String(col.id) };
                        const on = hasScope(scope);
                        return <button key={col.id} type="button" onClick={() => toggleScope(scope)} aria-pressed={on}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${on ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>Συλλογή {col.name}</button>;
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ex.scopes.filter(s => s.kind === 'sku').map(s => (
                      <span key={s.key} className="inline-flex items-center gap-1 rounded-full bg-violet-600 py-1 pl-2.5 pr-1 font-mono text-[11px] font-bold text-white">
                        {s.key}
                        <button type="button" onClick={() => toggleScope(s)} className="rounded-full p-0.5 hover:bg-white/20" aria-label={`Αφαίρεση ${s.key}`}><X size={11} /></button>
                      </span>
                    ))}
                    <input className="w-40 rounded-xl border border-slate-200 px-3 py-1.5 font-mono text-xs font-semibold uppercase outline-none focus:border-slate-400"
                      placeholder="Κωδικός + Enter" value={skuDraft} onChange={e => setSkuDraft(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const k = skuDraft.trim(); if (k && !hasScope({ kind: 'sku', key: k })) toggleScope({ kind: 'sku', key: k }); setSkuDraft(''); } }} />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <label className="block">
                  <Label>Ισχύει έως</Label>
                  <input type="date" className={fieldClass} value={ex.until ?? ''} onChange={e => setEx({ until: e.target.value || null })} />
                </label>
                <label className="block">
                  <Label>Σημειώσεις συμφωνίας</Label>
                  <input className={fieldClass} value={ex.notes ?? ''} placeholder="π.χ. Ελάχιστη ετήσια αγορά 5.000 €" onChange={e => setEx({ notes: e.target.value })} />
                </label>
              </div>
            </>
          )}
        </div>
      </CollapsiblePane>
    </div>
  );
}
