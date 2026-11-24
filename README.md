# AIVOA.AI Quality Investigation Workspace

AIVOA.AI is a human-reviewed quality investigation workspace for API pharmaceutical manufacturing. It supports a controlled workflow from deviation intake to evidence review, root-cause analysis, and CAPA planning.

The system is designed for quality professionals. It does not make release, disposition, or compliance decisions on its own. AI output is a suggestion that must be reviewed, edited, evidenced, and approved by an authorized person.

## Product workflow

```text
Source record -> AI extraction -> Investigator review -> 5 Whys / Fishbone
-> Root causes + evidence gaps -> Corrective and preventive actions -> CAPA review
```

## Design principles

- Evidence before inference: every suggested cause includes supporting evidence or is marked as an evidence gap.
- Human-in-the-loop: AI results are editable and never treated as approval.
- Least data: only information needed for the quality record should be submitted.
- No dark patterns: cookie choices have equal prominence, optional analytics are not required, and there are no hidden fees or fabricated reviews.
- Accessible by default: semantic headings, keyboard focus states, skip navigation, labelled controls, visible validation, and contrast-conscious colors.
- Traceable work: the source input, investigation, AI confidence, missing evidence, and CAPA actions are stored separately.

## Technology

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | React 18, React Router, Redux Toolkit, React Hook Form, Zod, Tailwind, Vite | Forms, navigation, review UI, local state, validation |
| API | Python, FastAPI, Pydantic | HTTP endpoints, validation, upload handling, orchestration |
| Workflow | LangGraph, LangChain, Groq | Extraction, RCA reasoning, CAPA synthesis, validation |
| Persistence | PostgreSQL, SQLAlchemy, JSONB | Deviations, investigations, CAPAs, source text, audit fields |
| Retrieval | pgvector, sentence-transformers, RAG routes | Knowledge-base search and evidence retrieval |
| Runtime | Docker Compose, Redis | Repeatable local services and future background work |

## Repository map

```text
AIVOA_AI/
├── backend/app/
│   ├── api/routes.py              # Deviation, investigation, CAPA endpoints
│   ├── core/config.py             # Environment-backed settings
│   ├── db/session.py              # SQLAlchemy engine and sessions
│   ├── models/models.py            # Database models
│   ├── schemas/schemas.py          # Request and response validation
│   ├── services/document_processor.py
│   ├── workflows/rca_workflow.py  # LangGraph state machine and fallbacks
│   ├── rag/                        # Knowledge bases and retrieval
│   └── main.py                     # FastAPI bootstrap
├── frontend/src/
│   ├── App.jsx                     # Routes and global consent banner
│   ├── components/Layout.jsx       # Shell, navigation, footer, skip link
│   ├── components/CookieConsent.jsx
│   ├── pages/Dashboard.jsx
│   ├── pages/DeviationCreate.jsx   # Intake and consent-aware form
│   ├── pages/InvestigationPage.jsx # 5 Whys, Fishbone, evidence review
│   ├── pages/CAPAPage.jsx
│   ├── pages/LegalPage.jsx         # Privacy, terms, refund, cookie policies
│   ├── store/                      # Redux slices and async thunks
│   └── services/api.js              # Axios client
├── database/init.sql                # PostgreSQL schema
├── database/demo_run.sql            # Repeatable local quality records
├── docker-compose.yml
└── README.md
```

## Quick start with Docker

Prerequisites: Docker Desktop with Compose enabled and a Groq API key for live model calls.

```powershell
cd D:\C\AIVOA_AI
docker compose up --build -d
```

Open:

- Frontend: http://localhost:3000
- API root: http://localhost:8000
- Health: http://localhost:8000/health
- OpenAPI docs: http://localhost:8000/docs

Load the local quality records into PostgreSQL:

```powershell
Get-Content -Raw database/demo_run.sql | docker exec -i rca_postgres psql -U postgres -d rca_db
```

The SQL is idempotent for the investigation and CAPA records. It supplies three realistic API manufacturing quality records with source evidence and structured analysis. The application presents them as normal workspace records; they are intended for local validation and must not be confused with production records.

## Environment configuration

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/rca_db
GROQ_API_KEY=replace-with-a-new-secret
SECRET_KEY=replace-with-a-long-random-secret
DEBUG=False
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
```

Never commit API keys. Rotate any key that has appeared in source control, logs, screenshots, or chat history. Production secrets should live in a secret manager.

## Frontend implementation

### Routing and layout

`frontend/src/App.jsx` owns the route table. `Layout.jsx` provides the persistent shell and renders route content through `children`. The shell includes keyboard-accessible skip navigation, a persistent sidebar, labelled icon buttons, and legal links.

Legal pages are served at:

```text
/legal/privacy
/legal/terms
/legal/refund
/legal/cookies
```

The legal text is intentionally conservative and should be reviewed by counsel before production use. Replace the contact addresses and business details with verified information.

### Consent and data minimization

`CookieConsent.jsx` stores only the choice `necessary` or `all` in browser storage. There is no advertising tracker or forced opt-in. The intake form requires an authorization checkbox and tells the user not to submit patient data, credentials, or unrelated personal information.

The form strips the consent-only field before sending the deviation record to the API. This keeps consent evidence in the UI flow without adding unnecessary consent metadata to the quality record.

### Investigation page

`InvestigationPage.jsx` uses React Hook Form and Redux:

1. Fetch the deviation, investigation, and CAPA actions.
2. Display the original source evidence.
3. Set the active method from the saved record.
4. Let the investigator switch between 5 Whys and Fishbone 6M.
5. Allow editing root causes, confidence, evidence, factors, and missing information.
6. Run the RCA API workflow when requested.
7. Normalize model confidence values from `0..1` to percentage display values.
8. Convert editable missing-evidence objects back into the backend string array.
9. Save as a human-reviewed investigation.

The review banner is deliberate: an AI confidence score is an evidence-completeness signal, not an approval or a probability that a cause is true.

## Redux state and API service

`frontend/src/store/index.js` combines slices for deviations and document processing, investigation data and AI suggestions, CAPA actions, and UI state. `frontend/src/services/api.js` uses `VITE_API_BASE_URL` when provided and otherwise defaults to `/api/v1`. Async thunks translate API errors into user-readable notifications.

## Backend implementation

### Document lifecycle

`POST /api/v1/deviations/{id}/process-document` accepts a PDF, DOCX, TXT, or pasted text. The service validates type and size, stores file metadata, extracts text, records source input, runs LangGraph, returns structured extraction/RCA/CAPA output, and persists the same result using a separate database session.

`POST /api/v1/deviations/{id}/run-rca` runs RCA on an existing source record. The request includes `deviation_id`, the selected method, and optional investigator context.

### LangGraph workflow

`backend/app/workflows/rca_workflow.py` defines a typed state object and four sequential nodes:

1. `extract_deviation_info`: extracts title, product, batch, equipment, severity, department, and description.
2. `analyze_investigation`: produces 5 Whys, Fishbone 6M factors, root causes, contributing factors, evidence, and missing evidence.
3. `generate_capa`: maps causes to corrective and preventive actions.
4. `validate_and_score`: checks completeness and calculates a bounded confidence score.

When Groq is configured, LangChain uses `openai/gpt-oss-120b` by default through `GROQ_MODEL`. Deviation extraction uses a Pydantic structured-output contract, then deterministic normalization verifies exact identifiers, quantities, dates, and expected-vs-actual statements. If the model is unavailable, the workflow uses a domain-specific heuristic engine for extraction, RCA patterns, CAPA generation, and confidence scoring. This fallback is explicit in logs and should be reviewed before production validation.

The extraction prompt is tuned only with the de-identified pharmaceutical examples in `backend/app/workflows/rca_examples.py`. These cover appearance defects, OOS assay/moisture, yield loss, temperature and vacuum excursions, foreign matter, packaging seal damage, and batch-record timing deviations. Add new approved examples there and update `backend/evals/rca_extraction_cases.json` when extending the supported vocabulary.

### Human review boundary

The API marks AI-created investigations and CAPAs with `ai_generated=true`. When an investigator edits and saves an investigation, the backend sets `ai_generated=false`. This distinguishes generated suggestions from reviewed records.

## Database model

- `deviations`: source event, product, batch, severity, status, source text, and ownership.
- `documents`: uploaded file metadata and extracted text.
- `investigations`: 5 Whys, six Fishbone categories, root causes, evidence gaps, summary, notes, and confidence.
- `capa_actions`: corrective/preventive type, description, owner, due date, status, and effectiveness check.
- `knowledge_bases`, `knowledge_documents`, `document_chunks`: retrieval corpus metadata and vector chunks.
- `rca_query_logs`: query, retrieved chunks, response, confidence, and timing for operational review.

Production recommendations: use Alembic migrations, add organization/user tenancy, encrypt object storage, apply retention and legal-hold policies, add immutable audit events, enforce authentication/authorization, and require least-privilege service accounts.

## API reference

### Deviations

- `GET /api/v1/deviations`
- `POST /api/v1/deviations`
- `GET /api/v1/deviations/{id}`
- `PUT /api/v1/deviations/{id}`
- `POST /api/v1/deviations/{id}/process-document`
- `POST /api/v1/deviations/{id}/run-rca`

### Investigations

- `GET /api/v1/deviations/{id}/investigation`
- `PUT /api/v1/deviations/{id}/investigation`

### CAPA

- `GET /api/v1/deviations/{id}/capa`
- `POST /api/v1/deviations/{id}/capa`
- `PUT /api/v1/capa/{id}`

### Retrieval

Knowledge-base and document routes live under `/api/v1/rag`. The OpenAPI page at `/docs` is the source of truth for complete request and response schemas.

## Accessibility and content review

The application includes a skip link, visible `:focus-visible` states, labelled icon buttons, semantic headings, keyboard-operable tabs and forms, and text alternatives for decorative icons through `aria-hidden`. No product photography or external font is required, so there are no unlicensed image or font assets.

Before launch, run keyboard-only navigation, axe or Lighthouse, screen-reader, 200% zoom, narrow viewport, and WCAG 2.2 AA contrast checks.

## Privacy, legal, and operational checklist

- Replace legal contact addresses with verified business addresses.
- Have Privacy, Terms, Refund, and Cookie policies reviewed by counsel.
- Confirm data-processing agreements and regions for Groq, hosting, storage, email, and monitoring providers.
- Keep optional analytics disabled unless consent is recorded.
- Provide a verified data-access/deletion process; do not delete records that must be retained for GMP, regulatory, safety, or legal reasons.
- Add unsubscribe handling to any future operational email workflow.
- Do not publish testimonials, performance percentages, compliance claims, or security claims without evidence and approval.
- Do not collect date of birth or age data unless a real requirement exists. If it does, document purpose, lawful basis, retention, and consent.

## Verification commands

```powershell
cd frontend
npm run build

cd ..\backend
python -m compileall app

Invoke-RestMethod http://localhost:8000/health
```

## Production readiness gaps

This repository is a working product foundation, not a declaration of GMP, GxP, GDPR, HIPAA, or 21 CFR Part 11 compliance. Before production use, add validated infrastructure, identity and role management, electronic signatures, immutable audit trails, controlled releases, documented validation, disaster recovery, monitoring, and legal review.
