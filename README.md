# Audit Management System

A comprehensive Quality Audit Management Platform designed for managing branches, suppliers, and quality audits.

## Features

- **Dashboard**: Real-time analytics and overview for different management levels (Audit Manager, BCK Manager, Branch Manager, Regional Manager).
- **Audit Planning**: Create and manage audit plans.
- **Audit Execution**: Conduct audits with checklist items, scoring, and evidence collection.
- **Entity Management**: Manage branches, regions, suppliers, and BCKs.
- **CAPA Management**: Track Corrective and Preventive Actions.
- **Incident Reporting**: Create and track incidents.
- **Reports**: Generate detailed audit reports.
- **Template Builder**: Custom audit templates.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **UI Components**: shadcn/ui, Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form, Zod
- **Backend/Database**: Supabase
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or bun

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd audit-management-system
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Running the Application

To start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:8080`.

## Testing

Run tests with Vitest:
```bash
npm test
```
