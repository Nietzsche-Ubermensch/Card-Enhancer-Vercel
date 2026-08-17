"""Mocked provider tests: success, timeout, 5xx, fallback, all-unavailable.

These tests never perform live network calls — providers are mocked. The point
is to prove the failover logic and that absence of credentials degrades
gracefully (AI_AUGMENTATION_UNAVAILABLE) rather than blocking the product.
"""
from app.services.providers import (
    BaseProvider, ProviderManager, ProviderName, ProviderNotConfigured,
    ProviderTransientError,
)


class FakeProvider(BaseProvider):
    """A scriptable fake provider for testing failover."""
    name = ProviderName.OPENAI
    env_key = "FAKE_KEY"

    def __init__(self, api_key="x", behavior="success", name=None):
        super().__init__(api_key=api_key)
        self.behavior = behavior
        if name is not None:
            self.name = name

    def _call(self, prompt, **kwargs):
        if self.behavior == "success":
            return {"echo": prompt}
        if self.behavior == "timeout":
            raise ProviderTransientError("timeout")
        if self.behavior == "5xx":
            raise ProviderTransientError("500 server error")
        if self.behavior == "unconfigured":
            raise ProviderNotConfigured("no key")
        raise RuntimeError("unexpected")


class TestProviderManager:
    def test_primary_success(self):
        mgr = ProviderManager(providers=[FakeProvider(behavior="success")])
        result = mgr.call("hello", requested=ProviderName.OPENAI)
        assert result.success is True
        assert result.actual_provider == "openai"
        assert result.fallback_used is False
        assert result.data == {"echo": "hello"}

    def test_primary_timeout_falls_back(self):
        primary = FakeProvider(behavior="timeout", name=ProviderName.OPENAI)
        fallback = FakeProvider(behavior="success", name=ProviderName.OPENROUTER)
        mgr = ProviderManager(providers=[primary, fallback])
        result = mgr.call("hi", requested=ProviderName.OPENAI)
        assert result.success is True
        assert result.actual_provider == "openrouter"
        assert result.fallback_used is True

    def test_primary_5xx_falls_back(self):
        primary = FakeProvider(behavior="5xx", name=ProviderName.GEMINI)
        fallback = FakeProvider(behavior="success", name=ProviderName.OPENROUTER)
        mgr = ProviderManager(providers=[primary, fallback])
        result = mgr.call("hi", requested=ProviderName.GEMINI)
        assert result.success is True
        assert result.actual_provider == "openrouter"
        assert result.fallback_used is True

    def test_fallback_to_openrouter(self):
        # Gemini + OpenAI fail, OpenRouter succeeds (the designated fallback).
        providers = [
            FakeProvider(behavior="timeout", name=ProviderName.GEMINI),
            FakeProvider(behavior="5xx", name=ProviderName.OPENAI),
            FakeProvider(behavior="success", name=ProviderName.OPENROUTER),
        ]
        mgr = ProviderManager(providers=providers)
        result = mgr.call("hi")
        assert result.success is True
        assert result.actual_provider == "openrouter"

    def test_all_providers_unavailable(self):
        # No credentials anywhere -> configured is False for all.
        providers = [
            FakeProvider(api_key=None, behavior="success", name=ProviderName.GEMINI),
            FakeProvider(api_key=None, behavior="success", name=ProviderName.OPENROUTER),
        ]
        mgr = ProviderManager(providers=providers)
        result = mgr.call("hi")
        assert result.success is False
        assert result.failure_reason == "AI_AUGMENTATION_UNAVAILABLE"
        assert result.actual_provider is None

    def test_all_providers_fail(self):
        providers = [
            FakeProvider(behavior="timeout", name=ProviderName.GEMINI),
            FakeProvider(behavior="5xx", name=ProviderName.OPENROUTER),
        ]
        mgr = ProviderManager(providers=providers)
        result = mgr.call("hi")
        assert result.success is False
        assert result.failure_reason is not None

    def test_no_providers_configured_reports_cleanly(self):
        mgr = ProviderManager(providers=[
            FakeProvider(api_key=None, name=ProviderName.GEMINI)
        ])
        assert mgr.any_configured() is False
        assert mgr.configured_providers() == []
