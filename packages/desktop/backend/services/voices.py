"""
services/voices.py — Business logic for Voice management, sample validation, timeline cropping, auto-transcription, and voice prompt assembly.
"""

import asyncio
import hashlib
import logging
import shutil
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import config
from utils.audio import save_audio, validate_and_load_reference_audio

logger = logging.getLogger(__name__)

CLONING_ENGINES = {"sherpa_onnx", "chatterbox"}


def clear_voice_cache(voice_id: Optional[str] = None, profile_id: Optional[str] = None) -> None:
    """Invalidate all cached prompt audio files for a voice."""
    v_id = voice_id or profile_id
    if not v_id:
        return
    cache_dir = config.get_voice_cache_dir()
    if cache_dir.exists():
        for p in cache_dir.glob(f"{v_id}_*.wav"):
            try:
                p.unlink()
            except Exception as exc:
                logger.warning("[voices_service] Failed to delete cache file %s: %s", p, exc)


def create_voice(data: Dict[str, Any], conn: sqlite3.Connection) -> Dict[str, Any]:
    """Create a new Voice and initialize its per-voice directory."""
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("Voice name is required.")

    row = conn.execute("SELECT id FROM voices WHERE name = ?", (name,)).fetchone()
    if not row:
        row = conn.execute("SELECT id FROM voice_profiles WHERE name = ?", (name,)).fetchone()
    if row:
        raise ValueError(f"A voice named '{name}' already exists.")

    voice_id = str(uuid.uuid4())
    now_str = datetime.utcnow().isoformat()

    conn.execute(
        """
        INSERT INTO voices
        (id, name, description, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            voice_id,
            name,
            data.get("description"),
            data.get("language") or "en",
            now_str,
            now_str,
        ),
    )
    conn.commit()

    voice_dir = config.get_voices_dir() / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)

    return get_voice(voice_id, conn)


async def add_voice_sample(
    voice_id: Optional[str] = None,
    audio_path: str | Path = None,
    reference_text: Optional[str] = None,
    conn: sqlite3.Connection = None,
    start_time: float = 0.0,
    end_time: Optional[float] = None,
    auto_transcribe: bool = True,
    profile_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Validate, crop to timeline [start_time, end_time] (default first 30s), normalize to WAV,
    and auto-transcribe with Whisper AI if reference_text is omitted or auto_transcribe is True.
    """
    target_id = voice_id or profile_id
    if not target_id:
        raise ValueError("Voice ID is required.")

    v_row = conn.execute("SELECT id FROM voices WHERE id = ?", (target_id,)).fetchone()
    if not v_row:
        v_row = conn.execute("SELECT id FROM voice_profiles WHERE id = ?", (target_id,)).fetchone()
    if not v_row:
        raise ValueError(f"Voice with ID '{target_id}' not found.")

    is_valid, error_msg, audio_array, sample_rate = await asyncio.to_thread(
        validate_and_load_reference_audio, audio_path, start_time, end_time
    )
    if not is_valid or audio_array is None or sample_rate is None:
        raise ValueError(error_msg or "Invalid reference audio clip.")

    sample_id = str(uuid.uuid4())
    voice_dir = config.get_voices_dir() / target_id
    voice_dir.mkdir(parents=True, exist_ok=True)

    dest_path = voice_dir / f"{sample_id}.wav"
    await asyncio.to_thread(save_audio, audio_array, dest_path, sample_rate)

    ref_text = (reference_text or "").strip()

    if auto_transcribe or not ref_text:
        try:
            from router.asr import asr_engine
            asr_res = await asyncio.to_thread(
                asr_engine.transcribe,
                str(dest_path),
                "auto",
                "base",
            )
            if isinstance(asr_res, dict):
                ref_text = (asr_res.get("text") or "").strip()
            elif isinstance(asr_res, str):
                ref_text = asr_res.strip()
        except Exception as exc:
            logger.warning("[voices_service] Auto-transcription failed: %s", exc)
            if not ref_text:
                ref_text = f"Audio clip sample ({len(audio_array)/float(sample_rate):.1f}s)"

    if not ref_text:
        raise ValueError("Reference text transcript is required for the audio sample.")

    stored_rel_path = config.to_storage_path(dest_path)
    duration_sec = float(len(audio_array)) / float(sample_rate)
    now_str = datetime.utcnow().isoformat()

    conn.execute(
        """
        INSERT INTO voice_samples (id, voice_id, audio_path, reference_text, duration_sec, sample_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (sample_id, target_id, stored_rel_path, ref_text, duration_sec, sample_rate, now_str),
    )
    conn.execute("UPDATE voices SET updated_at = ? WHERE id = ?", (now_str, target_id))
    conn.commit()

    clear_voice_cache(target_id)

    return {
        "id": sample_id,
        "voice_id": target_id,
        "audio_path": stored_rel_path,
        "full_audio_path": str(config.resolve_storage_path(stored_rel_path)),
        "reference_text": ref_text,
        "duration_sec": duration_sec,
        "sample_rate": sample_rate,
        "created_at": now_str,
    }


def get_voice(voice_id: Optional[str] = None, conn: sqlite3.Connection = None, profile_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve voice details with samples."""
    target_id = voice_id or profile_id
    if not target_id or not conn:
        return None

    row = conn.execute("SELECT * FROM voices WHERE id = ?", (target_id,)).fetchone()
    if not row:
        row = conn.execute("SELECT * FROM voice_profiles WHERE id = ?", (target_id,)).fetchone()
    if not row:
        return None

    sample_rows = conn.execute(
        "SELECT * FROM voice_samples WHERE voice_id = ? ORDER BY created_at", (target_id,)
    ).fetchall()
    if not sample_rows:
        sample_rows = conn.execute(
            "SELECT * FROM profile_samples WHERE profile_id = ? ORDER BY created_at", (target_id,)
        ).fetchall()

    samples = [
        {
            "id": s["id"],
            "voice_id": s["voice_id"] if "voice_id" in s.keys() else s["profile_id"],
            "audio_path": s["audio_path"],
            "full_audio_path": str(config.resolve_storage_path(s["audio_path"])),
            "reference_text": s["reference_text"],
            "duration_sec": s["duration_sec"] if "duration_sec" in s.keys() else None,
            "sample_rate": s["sample_rate"] if "sample_rate" in s.keys() else None,
            "created_at": s["created_at"],
        }
        for s in sample_rows
    ]

    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "language": row["language"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "sample_count": len(samples),
        "samples": samples,
    }


def list_voices(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """List all voices with batch-fetched sample counts."""
    query = """
        SELECT v.*, COUNT(vs.id) AS sample_count
        FROM voices v
        LEFT JOIN voice_samples vs ON v.id = vs.voice_id
        GROUP BY v.id
        ORDER BY v.name
    """
    try:
        rows = conn.execute(query).fetchall()
    except sqlite3.OperationalError:
        rows = []

    if not rows:
        fallback_query = """
            SELECT vp.*, COUNT(ps.id) AS sample_count
            FROM voice_profiles vp
            LEFT JOIN profile_samples ps ON vp.id = ps.profile_id
            GROUP BY vp.id
            ORDER BY vp.name
        """
        try:
            rows = conn.execute(fallback_query).fetchall()
        except sqlite3.OperationalError:
            rows = []

    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "language": r["language"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "sample_count": r["sample_count"],
        }
        for r in rows
    ]


def update_voice(voice_id: Optional[str] = None, data: Dict[str, Any] = None, conn: sqlite3.Connection = None, profile_id: Optional[str] = None) -> Dict[str, Any]:
    """Update voice metadata (excluding samples)."""
    target_id = voice_id or profile_id
    v_row = conn.execute("SELECT id, name FROM voices WHERE id = ?", (target_id,)).fetchone()
    if not v_row:
        v_row = conn.execute("SELECT id, name FROM voice_profiles WHERE id = ?", (target_id,)).fetchone()
    if not v_row:
        raise ValueError(f"Voice '{target_id}' not found.")

    fields = []
    values = []

    if "name" in data and data["name"]:
        new_name = data["name"].strip()
        if new_name != v_row["name"]:
            dup = conn.execute(
                "SELECT id FROM voices WHERE name = ? AND id != ?", (new_name, target_id)
            ).fetchone()
            if dup:
                raise ValueError(f"Voice name '{new_name}' is already taken.")
            fields.append("name = ?")
            values.append(new_name)

    for col in ("description", "language"):
        if col in data:
            fields.append(f"{col} = ?")
            values.append(data[col])

    if fields:
        now_str = datetime.utcnow().isoformat()
        fields.append("updated_at = ?")
        values.append(now_str)

        values.append(target_id)
        sql = f"UPDATE voices SET {', '.join(fields)} WHERE id = ?"
        try:
            conn.execute(sql, values)
            conn.commit()
        except sqlite3.OperationalError:
            sql_fallback = f"UPDATE voice_profiles SET {', '.join(fields)} WHERE id = ?"
            conn.execute(sql_fallback, values)
            conn.commit()

    return get_voice(target_id, conn)


def delete_voice(voice_id: Optional[str] = None, conn: sqlite3.Connection = None, profile_id: Optional[str] = None) -> bool:
    """Delete voice DB records first, then remove directory on disk."""
    target_id = voice_id or profile_id
    v_row = conn.execute("SELECT id FROM voices WHERE id = ?", (target_id,)).fetchone()
    if not v_row:
        v_row = conn.execute("SELECT id FROM voice_profiles WHERE id = ?", (target_id,)).fetchone()
    if not v_row:
        raise ValueError(f"Voice '{target_id}' not found.")

    conn.execute("DELETE FROM voice_samples WHERE voice_id = ?", (target_id,))
    conn.execute("DELETE FROM profile_samples WHERE profile_id = ?", (target_id,))
    conn.execute("DELETE FROM voices WHERE id = ?", (target_id,))
    conn.execute("DELETE FROM voice_profiles WHERE id = ?", (target_id,))
    conn.commit()

    voice_dir = config.get_voices_dir() / target_id
    if voice_dir.exists():
        try:
            shutil.rmtree(voice_dir)
        except Exception as exc:
            logger.warning("[voices_service] Failed to remove voice dir %s: %s", voice_dir, exc)

    clear_voice_cache(target_id)
    return True


def delete_voice_sample(sample_id: str, conn: sqlite3.Connection) -> bool:
    """Delete a single voice sample record and its WAV file."""
    s_row = conn.execute("SELECT voice_id, audio_path FROM voice_samples WHERE id = ?", (sample_id,)).fetchone()
    if not s_row:
        s_row = conn.execute("SELECT profile_id AS voice_id, audio_path FROM profile_samples WHERE id = ?", (sample_id,)).fetchone()
    if not s_row:
        raise ValueError(f"Sample '{sample_id}' not found.")

    voice_id = s_row["voice_id"]
    full_path = config.resolve_storage_path(s_row["audio_path"])

    if full_path and full_path.exists():
        try:
            full_path.unlink()
        except Exception as exc:
            logger.warning("[voices_service] Failed to unlink sample file %s: %s", full_path, exc)

    conn.execute("DELETE FROM voice_samples WHERE id = ?", (sample_id,))
    conn.execute("DELETE FROM profile_samples WHERE id = ?", (sample_id,))
    conn.commit()

    clear_voice_cache(voice_id)
    return True


def create_voice_prompt_for_voice(
    voice_id: Optional[str] = None,
    conn: sqlite3.Connection = None,
    use_cache: bool = True,
    profile_id: Optional[str] = None,
) -> Dict[str, str]:
    """
    Assemble reference audio and text for TTS generation.
    Single sample: passes through directly.
    Multiple samples: concatenates with silence gaps, caches prompt audio using hash of sorted sample IDs.
    """
    target_id = voice_id or profile_id
    samples = conn.execute(
        "SELECT id, audio_path, reference_text FROM voice_samples WHERE voice_id = ? ORDER BY created_at",
        (target_id,),
    ).fetchall()

    if not samples:
        samples = conn.execute(
            "SELECT id, audio_path, reference_text FROM profile_samples WHERE profile_id = ? ORDER BY created_at",
            (target_id,),
        ).fetchall()

    if not samples:
        raise ValueError(f"Voice '{target_id}' has no reference audio samples uploaded.")

    if len(samples) == 1:
        s = samples[0]
        full_path = config.resolve_storage_path(s["audio_path"])
        if full_path is None or not full_path.exists():
            raise ValueError(
                f"Sample audio file missing for voice {target_id}. "
                f"Stored path: {s['audio_path']}"
            )
        return {
            "ref_audio": str(full_path),
            "audio_path": str(full_path),
            "reference_text": s["reference_text"],
        }

    sorted_ids = sorted([s["id"] for s in samples])
    hash_str = hashlib.md5("".join(sorted_ids).encode("utf-8")).hexdigest()[:12]

    cache_dir = config.get_voice_cache_dir()
    cache_path = cache_dir / f"{target_id}_{hash_str}.wav"
    combined_text = " ".join([s["reference_text"].strip() for s in samples])

    if use_cache and cache_path.exists():
        return {
            "ref_audio": str(cache_path),
            "audio_path": str(cache_path),
            "reference_text": combined_text,
        }

    import soundfile as sf

    combined_audio = []
    target_sr = None

    for s in samples:
        path = config.resolve_storage_path(s["audio_path"])
        if not path or not path.exists():
            continue

        data, sr = sf.read(str(path), dtype="float32")
        if len(data.shape) > 1 and data.shape[1] > 1:
            data = np.mean(data, axis=1)

        if target_sr is None:
            target_sr = sr

        if sr != target_sr:
            num_samples = int(round(len(data) * target_sr / float(sr)))
            x_old = np.linspace(0, 1, len(data), endpoint=False)
            x_new = np.linspace(0, 1, num_samples, endpoint=False)
            data = np.interp(x_new, x_old, data)

        combined_audio.append(data.astype(np.float32))
        gap_samples = int(round(0.3 * target_sr))
        combined_audio.append(np.zeros(gap_samples, dtype=np.float32))

    if not combined_audio or target_sr is None:
        raise ValueError("Failed to load reference sample files for concatenation.")

    final_data = np.concatenate(combined_audio, axis=0)
    save_audio(final_data, cache_path, target_sr)

    return {
        "audio_path": str(cache_path),
        "reference_text": combined_text,
    }
