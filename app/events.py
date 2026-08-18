"""In-process pub/sub used to push live updates to browsers over SSE.

Each connected browser holds one Queue (see file_server.routes.event_stream).
publish() fans a message out to every queue; nothing is persisted, so a
browser that isn't connected at publish time simply won't see that event
(the next page load / reconnect picks up current state via the DB).
"""
import json
import queue
import threading

_lock = threading.Lock()
_subscribers = set()


def subscribe():
    q = queue.Queue()
    with _lock:
        _subscribers.add(q)
    return q


def unsubscribe(q):
    with _lock:
        _subscribers.discard(q)


def publish(event, data):
    message = f"event: {event}\ndata: {json.dumps(data)}\n\n"
    with _lock:
        subscribers = list(_subscribers)
    for q in subscribers:
        q.put(message)
