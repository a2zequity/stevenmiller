# Deal-by-Deal Waterfall Calculator

A comprehensive private equity waterfall calculator that models deal-level profit distributions with support for multiple investors, complex waterfall structures, and real-time calculations.

## Features

- **State Persistence**: All data is automatically saved to localStorage and persists across page reloads
- **Multiple Investors**: Support for both General Partners (GPs) and Limited Partners (LPs)
- **Complex Waterfall Structures**: Configurable preferred returns, catch-up provisions, and tiered profit splits
- **Real-time Calculations**: Instant updates as you modify inputs
- **Deal Management**: Add, edit, and toggle deals on/off
- **Comprehensive Reporting**: Charts and tables showing distributions, MOIC, IRR, and more

## Technology Stack

- **React 19** with TypeScript
- **Zustand** for state management with localStorage persistence
- **Recharts** for data visualization
- **Tailwind CSS** for styling
- **Vite** for development and building

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the app:

   ```bash
   npm run dev
   ```

3. Open your browser to the local development server (usually `http://localhost:5173`)

## Data Persistence

The app uses Zustand with localStorage persistence to automatically save all your data. This means:

- Your investors, deals, and configurations are saved automatically
- Data persists across browser sessions and page reloads
- You can reset to default data using the "Reset" button in the header

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.
