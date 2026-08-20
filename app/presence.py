"""In-process registry of connected browser tabs ("visitors").

Drives the live "who's online" sidebar. Nothing here touches the database —
it only reflects live SSE connections (see file_server.routes.event_stream),
so a closed tab naturally drops out and restarting the server naturally
starts with an empty registry.
"""
import threading
from datetime import datetime

from .events import publish

_lock = threading.Lock()
_visitors = {}  # visitor_id -> {"name": str|None, "connected_at": iso str}


def _serialize(visitor_id, info):
    return {
        "id": visitor_id,
        "name": info["name"] or "Anonymous",
        "connected_at": info["connected_at"],
    }


def add_visitor(visitor_id, name=None):
    with _lock:
        _visitors[visitor_id] = {
            "name": (name or "").strip() or None,
            "connected_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        info = _visitors[visitor_id]
    publish("presence-added", _serialize(visitor_id, info))


def remove_visitor(visitor_id):
    with _lock:
        existed = _visitors.pop(visitor_id, None) is not None
    if existed:
        publish("presence-removed", {"id": visitor_id})


def rename_visitor(visitor_id, name):
    with _lock:
        if visitor_id not in _visitors:
            return
        _visitors[visitor_id]["name"] = (name or "").strip() or None
        info = _visitors[visitor_id]
    publish("presence-renamed", _serialize(visitor_id, info))


def list_visitors():
    with _lock:
        return [_serialize(vid, info) for vid, info in _visitors.items()]
