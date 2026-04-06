import React from 'react';
import {
  CalendarRange,
  Database as DatabaseIcon,
  DollarSign,
  Factory as FactoryIcon,
  FileBadge,
  FolderKanban as FolderKanbanIcon,
  Globe,
  LayoutDashboard,
  Layers,
  Menu,
  Printer,
  Package,
  ShoppingCart,
  Sparkles,
  ScrollText,
  Settings as SettingsIcon,
  Users,
  Warehouse,
  type LucideIcon,
  BookOpen,
} from 'lucide-react';
import type { AdminPage, EmployeePage, MobileAdminPage, SellerPage } from './pageIds';

export interface SurfaceNavItem<TPage extends string> {
  id: TPage;
  icon: LucideIcon;
  label: string;
}

export interface NavSection<TPage extends string> {
  items: SurfaceNavItem<TPage>[];
}

export const adminNavSections: NavSection<AdminPage>[] = [
  {
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Πίνακας Ελέγχου' },
    ],
  },
  {
    items: [
      { id: 'registry', icon: DatabaseIcon, label: 'Μητρώο Κωδικών' },
      { id: 'deliveries', icon: CalendarRange, label: 'Ημερολόγιο' },
      { id: 'orders', icon: ShoppingCart, label: 'Παραγγελίες' },
      { id: 'offers', icon: FileBadge, label: 'Προσφορές' },
      { id: 'production', icon: FactoryIcon, label: 'Παραγωγή' },
      { id: 'customers', icon: Users, label: 'Πελάτες' },
      { id: 'suppliers', icon: Globe, label: 'Προμηθευτές' },
    ],
  },
  {
    items: [
      { id: 'inventory', icon: Warehouse, label: 'Αποθήκη & Στοκ' },
    ],
  },
  {
    items: [
      { id: 'resources', icon: Layers, label: 'Υλικά & Λάστιχα' },
      { id: 'collections', icon: FolderKanbanIcon, label: 'Συλλογές' },
    ],
  },
  {
    items: [
      { id: 'pricing', icon: DollarSign, label: 'Τιμολόγηση' },
      { id: 'batch-print', icon: Printer, label: 'Μαζική Εκτύπωση' },
      { id: 'pricelist', icon: ScrollText, label: 'Τιμοκατάλογος' },
    ],
  },
];

export const adminFooterNavItems: SurfaceNavItem<AdminPage>[] = [
  { id: 'settings', icon: SettingsIcon, label: 'Ρυθμίσεις' },
];

export const adminQuickActionNavItems: SurfaceNavItem<AdminPage>[] = [
  { id: 'ai-studio', icon: Sparkles, label: 'AI Studio' },
];

/** Fixed mobile admin bottom bar: Αρχική → … → Μενού (υπόλοιπες σελίδες από το μενού). */
export const mobileAdminNavItems: SurfaceNavItem<MobileAdminPage>[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Αρχική' },
  { id: 'registry', icon: DatabaseIcon, label: 'Μητρώο' },
  { id: 'production', icon: FactoryIcon, label: 'Παραγωγή' },
  { id: 'orders', icon: ShoppingCart, label: 'Παραγγελίες' },
  { id: 'customers', icon: Users, label: 'Πελάτες' },
  { id: 'menu', icon: Menu, label: 'Μενού' },
];

export const employeeDesktopNavItems: SurfaceNavItem<EmployeePage>[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Πίνακας Ελέγχου' },
  { id: 'orders', icon: ShoppingCart, label: 'Παραγγελίες' },
  { id: 'production', icon: FactoryIcon, label: 'Ροή Παραγωγής' },
  { id: 'deliveries', icon: CalendarRange, label: 'Ημερολόγιο' },
  { id: 'collections', icon: FolderKanbanIcon, label: 'Συλλογές' },
  { id: 'inventory', icon: Package, label: 'Διαχείριση Αποθήκης' },
  { id: 'registry', icon: DatabaseIcon, label: 'Προϊόντα & Τιμές' },
  { id: 'customers', icon: Users, label: 'Πελάτες' },
];

export const employeeMobileNavItems: SurfaceNavItem<EmployeePage>[] = [
  { id: 'deliveries', icon: CalendarRange, label: 'Παραδόσεις' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Αρχική' },
  { id: 'orders', icon: ShoppingCart, label: 'Παραγγελίες' },
  { id: 'production', icon: FactoryIcon, label: 'Παραγωγή' },
  { id: 'collections', icon: FolderKanbanIcon, label: 'Συλλογές' },
  { id: 'inventory', icon: Package, label: 'Αποθήκη' },
  { id: 'registry', icon: DatabaseIcon, label: 'Προϊόντα' },
  { id: 'customers', icon: Users, label: 'Πελάτες' },
];

export const sellerNavItems: SurfaceNavItem<SellerPage>[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Αρχική' },
  { id: 'catalog', icon: BookOpen, label: 'Κατάλογος' },
  { id: 'collections', icon: FolderKanbanIcon, label: 'Συλλογές' },
  { id: 'orders', icon: ShoppingCart, label: 'Παραγγελίες' },
  { id: 'customers', icon: Users, label: 'Πελάτες' },
];

export function renderNavIcon(Icon: LucideIcon, size = 18, strokeWidth = 2) {
  return React.createElement(Icon, { size, strokeWidth });
}
