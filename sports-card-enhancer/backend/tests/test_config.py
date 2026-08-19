"""Tests for application configuration parsing."""
from app.core.config import Settings


def test_cors_origins_list_parses_comma_separated_values():
    settings = Settings(CORS_ORIGINS="https://a.example, https://b.example , ,")

    assert settings.cors_origins_list == [
        "https://a.example",
        "https://b.example",
    ]


def test_cors_origins_list_defaults_to_wildcard_when_empty():
    settings = Settings(CORS_ORIGINS=" , ")

    assert settings.cors_origins_list == ["*"]
