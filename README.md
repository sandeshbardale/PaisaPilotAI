# PaisaPilot AI 💰

PaisaPilot AI — an intelligent personal finance platform built with React, FastAPI & SQLite. Upload bank statements for AI analysis, track expenses, get investment advice, plan trips with real road distances via OpenStreetMap/OSRM, find nearby places, analyze restaurant menus, and manage dues with Khatabook.

---

## Features

- **JWT Authentication** — Register, login, protected routes
- **Bank Statement Upload** — PDF & CSV parsing with auto-categorisation
- **AI Spending Insights** — Category breakdown, savings plan, subscription detection
- **Investment Advisor** — Personalised portfolio suggestions (SIP, FD, Gold, PPF)
- **Trip Planner** — Real road distances via OpenStreetMap + OSRM, all transport modes
- **Restaurant Budget** — Menu OCR + best meal combination within budget
- **Travel Copilot** — Nearby places (tourist spots, hotels, restaurants, hospitals, ATMs) via OpenStreetMap Overpass API
- **AI Financial Chat** — Ask anything about your money, grounded in real transactions
- **Khatabook** — Digital ledger to track who owes you and who you owe
- **Goal Planner** — Calculate timeline for any financial goal
- **Dark / Light mode**, fully responsive UI

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Recharts, Lucide |
| Backend | FastAPI, SQLAlchemy, SQLite, JWT (python-jose), bcrypt |
| AI / Parsing | pdfplumber, pytesseract, rule-based NLP |
| Maps | OpenStreetMap Nominatim, OSRM, Overpass API |

---

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

```
DATABASE_URL=sqlite:///./paisapilot.db
JWT_SECRET=your-secret-key
OPENAI_API_KEY=          # optional — enables GPT answers in chat
MAX_UPLOAD_MB=10
```

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # All API endpoints (43 routes)
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── analyzer.py          # PDF/CSV parser + AI analysis engine
│   │   ├── routes.py            # Route finder (Nominatim + OSRM)
│   │   ├── travel_copilot.py    # Nearby places + travel guide
│   │   └── khatabook_models.py  # Khatabook ledger models
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/               # Dashboard, Transactions, Upload, Chat,
│       │                        # AITools, TravelGuide, Khatabook, Settings
│       ├── components/          # Sidebar, UI helpers
│       ├── api.ts               # Typed API client (auto Bearer token)
│       └── AuthContext.tsx      # JWT auth context
└── database/
    └── schema.sql
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /auth/register | Register new user |
| POST | /auth/login | Login, get JWT |
| GET | /dashboard | Full dashboard data |
| GET | /transactions | List with search/filter/pagination |
| POST | /uploads/statement | Upload PDF/CSV bank statement |
| POST | /analysis/routes | Real road distance + transport options |
| POST | /travel/guide | AI travel chat |
| POST | /travel/nearby | Nearby places via OpenStreetMap |
| POST | /travel/hotels | Smart hotel recommendations |
| GET | /khatabook/parties | List all parties with balances |
| POST | /khatabook/entries | Add give/get entry |

---

Built with ❤️ by Sandesh Bardale
