import base64
import json

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from arbitrage_watcher import push


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def test_vapid_from_raw_scalar_matches_public_key():
    key = ec.generate_private_key(ec.SECP256R1())
    raw = key.private_numbers().private_value.to_bytes(32, "big")
    vapid = push.vapid_from_raw(_b64url(raw))
    fmt = (serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    assert vapid.public_key.public_bytes(*fmt) == key.public_key().public_bytes(*fmt)


def test_payload_shape_and_size():
    data = json.loads(push.build_payload("Title", "x" * 5000, "a1", None, "important"))
    assert set(data) == {"title", "body", "alertId", "instrumentId", "severity"}
    assert len(json.dumps(data).encode()) <= push.PAYLOAD_MAX


def test_send_handles_gone(monkeypatch):
    import pywebpush

    class Resp:
        status_code = 410

    def fake(**kwargs):
        raise pywebpush.WebPushException("gone", response=Resp())

    monkeypatch.setattr(pywebpush, "webpush", fake)
    key = ec.generate_private_key(ec.SECP256R1()).private_numbers().private_value.to_bytes(32, "big")
    target = {"subscription": {"endpoint": "https://push.example/x", "keys": {"p256dh": "a", "auth": "b"}},
              "vapidPrivateKey": _b64url(key), "vapidPublicKey": "", "contact": "mailto:noreply@example.com"}
    assert push.send(target, "{}") == "expired"
    assert push.send(None, "{}") == "disabled"
