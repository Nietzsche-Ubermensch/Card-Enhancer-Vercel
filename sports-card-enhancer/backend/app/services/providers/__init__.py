"""Provider package — optional AI augmentation with fallback."""
from app.services.providers.manager import (
    BaseProvider,
    GeminiProvider,
    OpenAIProvider,
    OpenRouterProvider,
    ProviderError,
    ProviderManager,
    ProviderName,
    ProviderNotConfigured,
    ProviderResult,
    ProviderTransientError,
    VeniceProvider,
    XAIProvider,
    provider_manager,
)

__all__ = [
    "BaseProvider",
    "GeminiProvider",
    "OpenAIProvider",
    "OpenRouterProvider",
    "ProviderError",
    "ProviderManager",
    "ProviderName",
    "ProviderNotConfigured",
    "ProviderResult",
    "ProviderTransientError",
    "VeniceProvider",
    "XAIProvider",
    "provider_manager",
]
