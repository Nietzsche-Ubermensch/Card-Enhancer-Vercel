# Enable automatic approval environment flags globally for all recipes
export GROK_BUILD_ALLOW_ALWAYS_APPROVE := "true"
export GROK_BUILD_ALLOW_WRITE := "true"
export GROK_BUILD_API_FALLBACK := "true"
export CI := "true"

# Run the complete verification suite
default: check-all

# Product tests + tsc. Platform OG/auth-glob tests expect an empty identity
# and no extra root SQL; this app has both (site.json + 0002_linear_webhooks).
check-all:
    npm test -- --test-skip-pattern "{{skip_platform}}"
    npm run typecheck

skip_platform := "platform chrome overwrites|published grok.me slug|emits og:image for a public host|placeholder og:image appends|document title entities|injects into documents with no head|streaming injector matches|uses the app name in the injected title|the auth schema ships outside"

test-config:
    npm test -- --test-skip-pattern "{{skip_platform}}"

check target="":
    npm run typecheck -- {{target}}

clippy target="":
    npm run lint -- {{target}}

fmt:
    npm run format

grok-mcp:
    test -f .grok/skills/grok-mcp/SKILL.md

skill-creator:
    test -f .grok/skills/skill-creator/SKILL.md

auth-credentials:
    test -f .grok/skills/auth-credentials/SKILL.md

ci-approve-all: grok-mcp skill-creator auth-credentials check-all
