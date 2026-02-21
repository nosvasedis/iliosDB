<div align="center">
  <img width="1200" height="auto" alt="Ilios ERP Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  
# ☀️ Ilios ERP

## **The Intelligent Jewelry Manufacturing & Inventory Platform**
  
  [![Vite](https://img.shields.io/badge/Frontend-Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
  [![React](https://img.shields.io/badge/Library-React-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
  [![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
  [![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-8E75C2?logo=google-gemini&logoColor=white)](https://ai.google.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-06B6D4?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

  **Ilios ERP** is a professional-grade Enterprise Resource Planning system specifically engineered for the jewelry manufacturing industry. It bridges the gap between artisan craft and modern digital management.

</div>

---

## 💎 Core Capabilities

### 🧪 Advanced Pricing & Recipe Engine

Calculates product costs in real-time by aggregating:

- **Live Metal Tracking**: Automatic price adjustments based on silver/gold spot prices.
- **Material Recipes**: Detailed BOM (Bill of Materials) tracking for stones, cords, and findings.
- **Labor Breakdown**: Granular costing for Casting, Setting, Technicians, and Plating.
- **Wastage Management**: Configurable loss percentages for precise accounting.

### 🏭 Production Lifecycle Management

Full visibility into the workshop floor:

- **Batch Tracking**: Manage production from "Mold to Finished Good".
- **Mold Registry**: Digital management of production molds ("Lascitica") with location tracking.
- **Workforce Assignment**: Specific views for Technicians, Sellers, and Clerks.
- **Stage Tracking**: Monitor Preparation, Setting, and Quality Control phases.

### 📦 Smart Inventory & Logistics

- **Code Registry**: Sophisticated SKU management with gender, category, and finish indexing.
- **QR/Barcode Ecosystem**: Instant label generation (JSBarcode/QRCode) and mobile scanning.
- **Stock Intelligence**: Real-time alerts for low stock and sample quantities.
- **Collections**: Organizing products into marketing-ready sets and catalogs.

### 🤖 AI Studio & Analytics

- **Gemini AI Integration**: Intelligent automation and data insights powered by Google’s LLMs.
- **Business Intelligence**: Deep-dive analytics into sales performance and material utilization.
- **Financial Reporting**: Automatic generation of price lists, offers, and invoices.

---

## 🛠️ Technical Excellence

- **Frontend**: High-performance SPA built with **React 18** and **TypeScript**.
- **Data Flow**: Reactive synchronization using **TanStack Query**.
- **Persistence**: Hybrid strategy with **Supabase (PostgreSQL)** and **IndexedDB** for offline-first resilience.
- **Cloud Edge**: Image handling and global delivery via **Cloudflare Workers**.
- **UI/UX**: Premium aesthetic with **Tailwind CSS** and **Lucide** icons, optimized for both Desktop and Mobile.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v24+ recommended)
- Supabase Account (for Database/Auth)
- Google AI Studio API Key (for AI Studio)

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment:
   Create a `.env.local` file with your credentials:

   ```env
   VITE_SUPABASE_URL=your_url
   VITE_SUPABASE_ANON_KEY=your_key
   VITE_GEMINI_API_KEY=your_google_ai_key
   ```

4. Launch development server:

   ```bash
   npm run dev
   ```

---

<div align="center">
  <p>Built for the future of jewelry craftsmanship.</p>
  <img src="https://ilios-image-handler.iliosdb.workers.dev/collapsed-logo.png" width="40" alt="Ilios Icon" />
</div>
