import logging
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)


class MultiProviderLLM:
    """Multi-provider LLM manager with automatic fallback.

    Supports Groq, OpenAI, and Anthropic. When a provider fails (missing key,
    rate limit, network error) the next available provider in the fallback chain
    is tried. This lets any configured model fill forms by prompt.
    """

    PROVIDER_KEYS = {
        "groq": lambda: settings.GROQ_API_KEY,
        "openai": lambda: settings.OPENAI_API_KEY,
        "anthropic": lambda: settings.ANTHROPIC_API_KEY,
    }

    PROVIDER_MODELS = {
        "groq": lambda: settings.GROQ_MODEL,
        "openai": lambda: settings.OPENAI_MODEL,
        "anthropic": lambda: settings.ANTHROPIC_MODEL,
    }

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def _available_providers(self) -> List[str]:
        available = []
        for name, key_fn in self.PROVIDER_KEYS.items():
            try:
                if key_fn():
                    available.append(name)
            except Exception:
                pass
        return available

    def _build_llm(self, provider: str, model: str, temperature: float = 0.1):
        cache_key = f"{provider}:{model}:{temperature}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        llm = None
        try:
            if provider == "groq":
                from langchain_groq import ChatGroq
                llm = ChatGroq(
                    groq_api_key=settings.GROQ_API_KEY,
                    model_name=model,
                    temperature=temperature,
                )
            elif provider == "openai":
                from langchain_openai import ChatOpenAI
                llm = ChatOpenAI(
                    api_key=settings.OPENAI_API_KEY,
                    model=model,
                    temperature=temperature,
                )
            elif provider == "anthropic":
                from langchain_anthropic import ChatAnthropic
                llm = ChatAnthropic(
                    api_key=settings.ANTHROPIC_API_KEY,
                    model=model,
                    temperature=temperature,
                )
        except Exception as e:
            logger.warning("Could not build %s LLM: %s", provider, e)
            llm = None

        if llm is not None:
            self._cache[cache_key] = llm
        return llm

    def _fallback_chain(self) -> List[Dict[str, str]]:
        """Build ordered list of provider/model dicts to try."""
        chain: List[Dict[str, str]] = []

        # Primary provider from settings
        primary = (settings.LLM_PROVIDER or "auto").lower()
        if primary != "auto" and primary in self.PROVIDER_KEYS:
            model = self.PROVIDER_MODELS.get(primary, lambda: "")()
            if self.PROVIDER_KEYS[primary]():
                chain.append({"provider": primary, "model": model})

        # Auto mode: try all available providers
        if primary == "auto":
            for name in self._available_providers():
                model = self.PROVIDER_MODELS[name]()
                chain.append({"provider": name, "model": model})

        # Explicit fallbacks
        for entry in (settings.LLM_FALLBACKS or "").split(","):
            entry = entry.strip()
            if ":" in entry:
                prov, mod = entry.split(":", 1)
                prov = prov.strip()
                mod = mod.strip()
                if prov in self.PROVIDER_KEYS and self.PROVIDER_KEYS[prov]():
                    if not any(c["provider"] == prov and c["model"] == mod for c in chain):
                        chain.append({"provider": prov, "model": mod})

        # De-duplicate while preserving order
        seen = set()
        unique = []
        for c in chain:
            key = (c["provider"], c["model"])
            if key not in seen:
                seen.add(key)
                unique.append(c)
        return unique

    def get_llm(self, provider: Optional[str] = None, model: Optional[str] = None, temperature: float = 0.1):
        """Return a single LLM client. Uses settings if not specified."""
        if provider is None:
            provider = (settings.LLM_PROVIDER or "auto").lower()
            if provider == "auto":
                available = self._available_providers()
                provider = available[0] if available else "groq"
        if model is None:
            model = self.PROVIDER_MODELS.get(provider, lambda: "")()
        return self._build_llm(provider, model, temperature)

    def invoke_with_fallback(self, prompt, inputs: Dict[str, Any], temperature: float = 0.1):
        """Invoke prompt with LLM, trying fallback chain on failure."""
        last_error = None
        for cfg in self._fallback_chain():
            llm = self._build_llm(cfg["provider"], cfg["model"], temperature)
            if llm is None:
                continue
            try:
                chain = prompt | llm
                return chain.invoke(inputs), cfg
            except Exception as e:
                last_error = e
                logger.warning("Provider %s/%s failed: %s", cfg["provider"], cfg["model"], e)
                continue
        if last_error:
            raise last_error
        raise RuntimeError("No LLM provider available. Configure at least one API key.")


# Singleton
llm_provider = MultiProviderLLM()
