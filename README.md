# SmartBDX - Enterprise Data Ingestion Platform

SmartBDX is a full-featured, production-quality frontend for an enterprise data ingestion platform that processes complex Excel bordereaux files in insurance/reinsurance.

## Features

- **Selection Dashboard**: Browse, search, and select files for processing with status indicators
- **Processing Dashboard**: Monitor batch jobs with real-time progress tracking and configuration options
- **Monitoring Dashboard**: View visual summaries of all batches with status charts and download options
- **Mapping Approval Dashboard**: Review and approve column mappings with confidence scores

## Tech Stack

- **Framework**: Next.js with TypeScript
- **UI Libraries**: Combination of Ant Design and Material UI
- **Authentication**: Azure AD integration (placeholder)
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/smartbdx.git
cd smartbdx
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Run the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Authentication routes
│   │   └── login/            # Login page
│   ├── selection/            # Selection dashboard
│   ├── processing/           # Processing dashboard
│   ├── monitoring/           # Monitoring dashboard
│   ├── mapping/              # Mapping approval dashboard
│   ├── layout.tsx            # Root layout with navigation
│   └── page.tsx              # Home/landing page
├── components/               # Reusable components
│   ├── layout/               # Layout components
│   ├── selection/            # Selection page components
│   ├── processing/           # Processing page components
│   ├── monitoring/           # Monitoring page components
│   ├── mapping/              # Mapping page components
│   └── common/               # Common UI components
├── hooks/                    # Custom React hooks
├── services/                 # Service layer
│   ├── api.ts                # API client
│   └── auth.tsx              # Auth service
├── types/                    # TypeScript type definitions
└── utils/                    # Utility functions
```

## API Integration

The frontend is designed to connect to a Python FastAPI backend with the following endpoints:

- `/api/files` - Get list of files
- `/api/process` - Process selected files
- `/api/status` - Get batch job status
- `/api/mapping` - Get mapping suggestions
- `/api/mapping/approve` - Approve/reject mappings

For development purposes, the application includes mock data to simulate API responses.

## Authentication

The application includes a placeholder for Azure AD authentication. In a production environment, you would need to:

1. Register your application in the Azure portal
2. Update the authentication configuration in `src/services/auth.tsx`
3. Set the appropriate environment variables

## Customization

### Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```
NEXT_PUBLIC_API_URL=http://your-api-url
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your-client-id
NEXT_PUBLIC_AZURE_AD_TENANT_ID=your-tenant-id
```

### Theming

The application uses Tailwind CSS for styling. You can customize the theme in the `tailwind.config.js` file.

## Deployment

The application can be deployed to any platform that supports Next.js applications, such as Vercel, Netlify, or a custom server.

```bash
# Build for production
npm run build

# Start production server
npm start
```

## License

[MIT](LICENSE)
