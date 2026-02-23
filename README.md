# Super Dashboard

Full-featured command center dashboard with CRM, Invoicing, Email Suite, Analytics, and more.

## Architecture

- **Frontend**: Static HTML/CSS/JS deployed to Cloudflare Pages
- **Backend**: Cloudflare Workers API with KV storage

## Deployment URLs

| Service | URL |
|---------|-----|
| Frontend | https://super-dashboard-aan.pages.dev |
| Backend API | https://super-dashboard-api.jalen1wa.workers.dev |

## Features

- CRM with customer management
- Invoice generation with PayPal integration
- Email suite with AI-powered replies
- Proposals and quotes
- Analytics dashboard
- Video chat with WebRTC
- Calendar with drag-drop events
- Kanban board
- E-Signature support
- Light/Dark theme
- Draggable widgets

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/customers` | GET, POST | Customers |
| `/api/invoices` | GET, POST | Invoices |
| `/api/analytics/summary` | GET | Metrics |
| `/api/emails` | GET | Emails |
| `/api/proposals` | GET, POST | Proposals |

## Local Development

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
Serve the `frontend/` directory with any static server.

## Deploy

### Backend (Cloudflare Workers)
```bash
cd backend
wrangler deploy
```

### Frontend (Cloudflare Pages)
```bash
cd frontend
wrangler pages deploy . --project-name=super-dashboard
```

## License

MIT
