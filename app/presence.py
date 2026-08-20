"""In-process registry of connected browser tabs ("visitors").

Drives the live "who's online" sidebar. Nothing here touches the database —
it only reflects live SSE connections (see file_server.routes.event_stream),
so a closed tab naturally drops out and restarting the server naturally
starts with an empty registry.

A visitor_id can briefly have more than one live SSE connection at once —
a page refresh opens a new connection before the server has noticed the old
one died (SSE disconnects are only detected on the next failed write, which
can lag a couple of seconds), and browsers that clone sessionStorage into a
duplicated tab produce the same situation deliberately. Connections are
therefore reference-counted per visitor_id: the visitor is only actually
removed (and broadcast as such) once its *last* connection goes away.
"""
import threading
from datetime import datetime

from .events import publish

_lock = threading.Lock()
_visitors = {}  # visitor_id -> {"name": str|None, "connected_at": iso str, "connections": int}


def _serialize(visitor_id, info):
    return {
        "id": visitor_id,
        "name": info["name"] or "Anonymous",
        "connected_at": info["connected_at"],
    }


def add_visitor(visitor_id, name=None):
    clean_name = (name or "").strip() or None

    with _lock:
        info = _visitors.get(visitor_id)
        if info is None:
            info = {
                "name": clean_name,
                "connected_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "connections": 1,
            }
            _visitors[visitor_id] = info
            event = "presence-added"
        else:
            info["connections"] += 1
            renamed = clean_name is not None and clean_name != info["name"]
            if renamed:
                info["name"] = clean_name
            event = "presence-renamed" if renamed else None
        payload = _serialize(visitor_id, info)

    if event:
        publish(event, payload)


def remove_visitor(visitor_id):
    with _lock:
        info = _visitors.get(visitor_id)
        if info is None:
            return
        info["connections"] -= 1
        should_remove = info["connections"] <= 0
        if should_remove:
            del _visitors[visitor_id]

    if should_remove:
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
