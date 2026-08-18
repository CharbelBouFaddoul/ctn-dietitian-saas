#!/bin/sh
# Pre/post deploy smoke checks for Coolify staging/production.
set -eu

API_URL="${API_URL:-http://localhost:3001}"
SWAGGER_PATH="${SWAGGER_PATH:-/api/docs}"

echo "Checking health at $API_URL/health"
health_code="$(curl -s -o /tmp/nutrition-health.json -w '%{http_code}' "$API_URL/health")"
if [ "$health_code" != "200" ]; then
  echo "Health check failed with HTTP $health_code" >&2
  cat /tmp/nutrition-health.json >&2 || true
  exit 1
fi

echo "Checking OpenAPI is not exposed at $API_URL$SWAGGER_PATH"
swagger_code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL$SWAGGER_PATH")"
if [ "$swagger_code" = "200" ]; then
  echo "OpenAPI is publicly reachable; set SWAGGER_ENABLED=false in production" >&2
  exit 1
fi

echo "Deploy checks passed"
