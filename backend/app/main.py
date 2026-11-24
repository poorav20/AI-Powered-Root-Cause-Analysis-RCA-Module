import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.limiter import limiter, HAS_SLOWAPI
try:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
except ImportError:
    _rate_limit_exceeded_handler = None
    RateLimitExceeded = None
from app.core.config import settings
from app.api.routes import router as api_router
from app.rag.api.rag_routes import router as rag_router
from app.db.session import engine
from app.models.models import Base
from app.rag.models.vector_models import Base as RagBase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Database bootstrap
# ---------------------------------------------------------------------------
Base.metadata.create_all(bind=engine)
RagBase.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Rate limiter
# Keyed by client IP; imported from app.core.limiter
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Root Cause Analysis Module for Pharmaceutical Manufacturing with RAG",
    version="1.0.0",
    debug=settings.DEBUG,
)

# Attach rate-limit error handler if available
app.state.limiter = limiter
if HAS_SLOWAPI and RateLimitExceeded and _rate_limit_exceeded_handler:
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(api_router, prefix="/api/v1")
app.include_router(rag_router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Utility endpoints
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {
        "message": "AI-Powered RCA Module API with RAG",
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
