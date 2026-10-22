"""Web Push delivery via pywebpush using the VAPID keys stored in Config.push."""

from __future__ import annotations

import base64
import json
from typing import Any

from arbitrage_watcher import log
from arbitrage_watcher.util import stable_hash

PAYLOAD_MAX = 3000


def b64url_decode(value: str) -> bytes:
    value = value.strip().replace("+", "-").replace("/", "_").rstrip("=")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def vapid_from_raw(private_b64url: str) -> Any:
    """Build a py_vapid Vapid object from the raw 32-byte P-256 scalar (base64url)."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from py_vapid import Vapid02

    raw = b64url_decode(private_b64url)
    if len(raw) != 32:
        raise ValueError("VAPID private key must be 32 raw bytes")
    key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
    return Vapid02(private_key=key)


def endpoint_id(target: dict[str, Any]) -> str:
    return stable_hash(str(((target or {}).get("subscription") or {}).get("endpoint", "")))


def build_payload(title: str, body: str, alert_id: str, instrument_id: str | None, severity: str) -> str:
    payload = {"title": title, "body": body, "alertId": alert_id, "instrumentId": instrument_id, "severity": severity}
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    while len(data.encode("utf-8")) > PAYLOAD_MAX and len(payload["body"]) > 20:
        payload["body"] = payload["body"][: len(payload["body"]) // 2] + "…"
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return data


def send(target: dict[str, Any] | None, payload: str) -> str:
    """Send one push. Returns "ok", "expired" (404/410), "error" or "disabled"."""
    if not target or not target.get("subscription") or not target.get("vapidPrivateKey"):
        return "disabled"
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return "disabled"
    try:
        webpush(
            subscription_info=target["subscription"],
            data=payload,
            vapid_private_key=vapid_from_raw(target["vapidPrivateKey"]),
            vapid_claims={"sub": target.get("contact") or "mailto:noreply@example.com"},
            ttl=12 * 3600,
            timeout=15,
        )
        return "ok"
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            log.warn("push: subscription expired (%s)", status)
            return "expired"
        log.warn("push failed with status %s", status)
        return "error"
    except Exception as exc:
        log.error("push", exc)
        return "error"
