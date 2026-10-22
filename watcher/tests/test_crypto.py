import json

import pytest

from arbitrage_watcher.crypto import EnvelopeError, decrypt_json, encrypt_json, read_encrypted, write_encrypted


def test_decrypts_shared_vector(vector):
    plain = decrypt_json(vector["envelope"], vector["passphrase"])
    assert plain == json.loads(vector["plaintext"])


def test_roundtrip_fresh_salt_and_iv(tmp_path):
    obj = {"ä": "ü", "n": [1, 2.5, None]}
    a, b = encrypt_json(obj, "pw", iterations=1000), encrypt_json(obj, "pw", iterations=1000)
    assert a["salt"] != b["salt"] and a["iv"] != b["iv"]
    assert decrypt_json(a, "pw") == obj
    path = tmp_path / "x.enc"
    write_encrypted(path, obj, "pw")
    env = json.loads(path.read_text())
    assert set(env) == {"v", "alg", "kdf", "iter", "salt", "iv", "ct"} and env["iter"] == 600000
    assert read_encrypted(path, "pw") == obj


def test_wrong_passphrase_raises(vector):
    with pytest.raises(EnvelopeError):
        decrypt_json(vector["envelope"], "nope")


def test_missing_file_is_none(tmp_path):
    assert read_encrypted(tmp_path / "missing.enc", "pw") is None
