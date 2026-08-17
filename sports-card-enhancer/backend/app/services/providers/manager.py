"""AI provider abstraction for optional augmentation.

The core card-processing workflow does NOT depend on any AI provider.
These providers are an *optional augmentation* layer (e.g. for orientation
hints, OCR assists, or advanced restoration). The application must remain
fully functional when no provider credentials are configured.

Design rules (per product directive):
- If a provider is configured -> use it.
- If the primary fails transiently -> try the fallback chain.
- If no providers are configured -> core card workflow still works.
- If all providers fail -> AI augmentation degrades; card processing continues.

Every call records: requested_provider, actual_provider, fallback_used,
failure_reason.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class ProviderName(str, Enum):
    """Supported AI providers (all optional)."""
    GEMINI = "gemini"
    OPENAI = "openai"
    OPENROUTER = "openrouter"   # fallback option, not a dependency
    VENICE = "venice"
    XAI = "xai"


class ProviderError(Exception):
    """Base error for provider failures."""


class ProviderNotConfigured(ProviderError):
    """Raised when a provider has no credentials configured."""


class ProviderTransientError(ProviderError):
    """Raised for transient failures (timeouts, 5xx) that warrant fallback."""


@dataclass
class ProviderResult:
    """Result of a (possibly augmented) AI call.

    Attributes:
        success: Whether any provider produced a usable result.
        requested_provider: The provider the caller asked for (or None = auto).
        actual_provider: The provider that actually served the request.
        fallback_used: True if a fallback provider was used.
        failure_reason: Human-readable reason if success is False.
        data: Provider-specific payload (None when unavailable).
    """
    success: bool
    requested_provider: Optional[str] = None
    actual_provider: Optional[str] = None
    fallback_used: bool = False
    failure_reason: Optional[str] = None
    data: Any = None


class BaseProvider:
    """Base class for AI providers. Subclasses implement `_call`."""

    name: ProviderName = ProviderName.OPENAI
    env_key: str = ""           # env var holding the API key
    default_model: str = ""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key if api_key is not None else os.environ.get(self.env_key)
        self.model = model or self.default_model

    @property
    def configured(self) -> bool:
        """True when this provider has credentials available."""
        return bool(self.api_key)

    def _call(self, prompt: str, **kwargs) -> Any:
        """Perform the actual provider request. Must be implemented.

        Should raise ProviderTransientError for timeouts/5xx and
        ProviderNotConfigured when credentials are absent.
        """
        raise NotImplementedError

    def call(self, prompt: str, **kwargs) -> Any:
        """Public call wrapper with uniform error semantics."""
        if not self.configured:
            raise ProviderNotConfigured(
                f"{self.name.value} is not configured (missing {self.env_key})"
            )
        return self._call(prompt, **kwargs)


class GeminiProvider(BaseProvider):
    name = ProviderName.GEMINI
    env_key = "GEMINI_API_KEY"
    default_model = "gemini-1.5-flash"

    def _call(self, prompt: str, **kwargs) -> Any:  # pragma: no cover - network
        import httpx
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        try:
            resp = httpx.post(
                url,
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=30,
            )
        except httpx.TimeoutException as e:
            raise ProviderTransientError(f"gemini timeout: {e}") from e
        if resp.status_code >= 500:
            raise ProviderTransientError(f"gemini 5xx: {resp.status_code}")
        resp.raise_for_status()
        return resp.json()


class OpenAIProvider(BaseProvider):
    name = ProviderName.OPENAI
    env_key = "OPENAI_API_KEY"
    default_model = "gpt-4o-mini"

    def _call(self, prompt: str, **kwargs) -> Any:  # pragma: no cover - network
        import httpx
        try:
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"******"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
        except httpx.TimeoutException as e:
            raise ProviderTransientError(f"openai timeout: {e}") from e
        if resp.status_code >= 500:
            raise ProviderTransientError(f"openai 5xx: {resp.status_code}")
        resp.raise_for_status()
        return resp.json()


class OpenRouterProvider(BaseProvider):
    """OpenRouter — a fallback option, not a product dependency."""
    name = ProviderName.OPENROUTER
    env_key = "OPENROUTER_API_KEY"
    default_model = "openai/gpt-4o-mini"

    def _call(self, prompt: str, **kwargs) -> Any:  # pragma: no cover - network
        import httpx
        try:
            resp = httpx.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"******"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
        except httpx.TimeoutException as e:
            raise ProviderTransientError(f"openrouter timeout: {e}") from e
        if resp.status_code >= 500:
            raise ProviderTransientError(f"openrouter 5xx: {resp.status_code}")
        resp.raise_for_status()
        return resp.json()


class VeniceProvider(BaseProvider):
    name = ProviderName.VENICE
    env_key = "VENICE_API_KEY"
    default_model = "llama-3.3-70b"

    def _call(self, prompt: str, **kwargs) -> Any:  # pragma: no cover - network
        import httpx
        try:
            resp = httpx.post(
                "https://api.venice.ai/api/v1/chat/completions",
                headers={"Authorization": f"******"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
        except httpx.TimeoutException as e:
            raise ProviderTransientError(f"venice timeout: {e}") from e
        if resp.status_code >= 500:
            raise ProviderTransientError(f"venice 5xx: {resp.status_code}")
        resp.raise_for_status()
        return resp.json()


class XAIProvider(BaseProvider):
    name = ProviderName.XAI
    env_key = "XAI_API_KEY"
    default_model = "grok-2-latest"

    def _call(self, prompt: str, **kwargs) -> Any:  # pragma: no cover - network
        import httpx
        try:
            resp = httpx.post(
                "https://api.x.ai/v1/chat/completions",
                headers={"Authorization": f"******"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
        except httpx.TimeoutException as e:
            raise ProviderTransientError(f"xai timeout: {e}") from e
        if resp.status_code >= 500:
            raise ProviderTransientError(f"xai 5xx: {resp.status_code}")
        resp.raise_for_status()
        return resp.json()


# Registry of provider classes. Order = default fallback priority; OpenRouter
# is placed last as the designated fallback option.
PROVIDER_CLASSES: Dict[ProviderName, type] = {
    ProviderName.GEMINI: GeminiProvider,
    ProviderName.OPENAI: OpenAIProvider,
    ProviderName.VENICE: VeniceProvider,
    ProviderName.XAI: XAIProvider,
    ProviderName.OPENROUTER: OpenRouterProvider,
}


class ProviderManager:
    """Coordinates optional AI providers with fallback.

    The manager never raises for missing providers; it returns a
    ProviderResult with success=False and an appropriate failure_reason so
    the calling card workflow can continue without AI augmentation.
    """

    def __init__(self, providers: Optional[List[BaseProvider]] = None):
        if providers is not None:
            self.providers = providers
        else:
            self.providers = [cls() for cls in PROVIDER_CLASSES.values()]

    def configured_providers(self) -> List[ProviderName]:
        """Return the list of providers that have credentials."""
        return [p.name for p in self.providers if p.configured]

    def any_configured(self) -> bool:
        return any(p.configured for p in self.providers)

    def _get(self, name: ProviderName) -> Optional[BaseProvider]:
        for p in self.providers:
            if p.name == name:
                return p
        return None

    def call(self, prompt: str,
             requested: Optional[ProviderName] = None,
             **kwargs) -> ProviderResult:
        """Call a provider with fallback.

        Args:
            prompt: The prompt/task to send.
            requested: Preferred provider. When None, the first configured
                       provider in priority order is used.

        Returns:
            ProviderResult describing the outcome. Never raises for
            configuration or transient provider failures.
        """
        requested_name = requested.value if requested else None

        # Build the attempt order: requested first (if configured), then the
        # remaining configured providers in priority order.
        order: List[BaseProvider] = []
        if requested is not None:
            req = self._get(requested)
            if req is not None:
                order.append(req)
        order.extend(p for p in self.providers if p not in order)

        attempted_configured = [p for p in order if p.configured]
        if not attempted_configured:
            logger.info("No AI providers configured; augmentation unavailable")
            return ProviderResult(
                success=False,
                requested_provider=requested_name,
                actual_provider=None,
                fallback_used=False,
                failure_reason="AI_AUGMENTATION_UNAVAILABLE",
                data=None,
            )

        first = True
        last_error: Optional[str] = None
        for provider in attempted_configured:
            try:
                data = provider.call(prompt, **kwargs)
                return ProviderResult(
                    success=True,
                    requested_provider=requested_name,
                    actual_provider=provider.name.value,
                    fallback_used=(not first),
                    failure_reason=None,
                    data=data,
                )
            except ProviderTransientError as e:
                last_error = str(e)
                logger.warning(
                    "Provider %s failed transiently (%s); trying fallback",
                    provider.name.value, e,
                )
            except ProviderNotConfigured as e:
                last_error = str(e)
                logger.warning("Provider %s not configured: %s", provider.name.value, e)
            except Exception as e:  # pragma: no cover - defensive
                last_error = str(e)
                logger.warning("Provider %s error: %s", provider.name.value, e)
            first = False

        return ProviderResult(
            success=False,
            requested_provider=requested_name,
            actual_provider=None,
            fallback_used=False,
            failure_reason=last_error or "ALL_PROVIDERS_FAILED",
            data=None,
        )


# Global manager instance (providers are optional; absence is fine).
provider_manager = ProviderManager()
