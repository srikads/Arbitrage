"""Encryption envelope (contract §2): PBKDF2-SHA256 + AES-256-GCM."""

from __future__ import annotations

import base64
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERATIONS = 600_000
SALT_LEN = 16
IV_LEN = 12


class EnvelopeError(ValueError):
    """Raised when an envelope is malformed or cannot be decrypted."""


@lru_cache(maxsize=16)
def derive_key(passphrase: str, salt: bytes, iterations: int = ITERATIONS) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    return kdf.derive(passphrase.encode("utf-8"))


def _b64e(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64d(data: str) -> bytes:
    return base64.b64decode(data, validate=True)


def encrypt_json(obj: Any, passphrase: str, iterations: int = ITERATIONS) -> dict[str, Any]:
    """Encrypt a JSON-serialisable object into a fresh envelope."""
    salt, iv = os.urandom(SALT_LEN), os.urandom(IV_LEN)
    plaintext = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(derive_key(passphrase, salt, iterations)).encrypt(iv, plaintext, None)
    return {
        "v": 1,
        "alg": "AES-256-GCM",
        "kdf": "PBKDF2-SHA256",
        "iter": iterations,
        "salt": _b64e(salt),
        "iv": _b64e(iv),
        "ct": _b64e(ct),
    }


def decrypt_bytes(envelope: dict[str, Any], passphrase: str) -> bytes:
    if envelope.get("v") != 1 or envelope.get("alg") != "AES-256-GCM" or envelope.get("kdf") != "PBKDF2-SHA256":
        raise EnvelopeError("unsupported envelope")
    try:
        salt, iv, ct = _b64d(envelope["salt"]), _b64d(envelope["iv"]), _b64d(envelope["ct"])
        key = derive_key(passphrase, salt, int(envelope["iter"]))
        return AESGCM(key).decrypt(iv, ct, None)
    except EnvelopeError:
        raise
    except Exception as exc:  # InvalidTag, KeyError, binascii.Error
        raise EnvelopeError("decryption failed (wrong passphrase or corrupt file)") from exc


def decrypt_json(envelope: dict[str, Any], passphrase: str) -> Any:
    return json.loads(decrypt_bytes(envelope, passphrase).decode("utf-8"))


def read_encrypted(path: Path, passphrase: str) -> Any | None:
    """Read and decrypt a `.enc` file; None if it does not exist."""
    if not path.exists():
        return None
    envelope = json.loads(path.read_text(encoding="utf-8"))
    return decrypt_json(envelope, passphrase)


def write_encrypted(path: Path, obj: Any, passphrase: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(encrypt_json(obj, passphrase), indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
