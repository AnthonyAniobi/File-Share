from app.events import subscribe, unsubscribe
from app.presence import add_visitor, list_visitors, remove_visitor, rename_visitor


def test_add_visitor_appears_in_list():
    add_visitor("v1", "Alice")
    try:
        visitors = list_visitors()
        assert any(v["id"] == "v1" and v["name"] == "Alice" for v in visitors)
    finally:
        remove_visitor("v1")


def test_add_visitor_without_name_defaults_to_anonymous():
    add_visitor("v2", "")
    try:
        visitors = list_visitors()
        assert any(v["id"] == "v2" and v["name"] == "Anonymous" for v in visitors)
    finally:
        remove_visitor("v2")


def test_remove_visitor_drops_from_list():
    add_visitor("v3", "Bob")
    remove_visitor("v3")
    assert not any(v["id"] == "v3" for v in list_visitors())


def test_rename_visitor_updates_name():
    add_visitor("v4", "Carol")
    try:
        rename_visitor("v4", "Caroline")
        visitors = list_visitors()
        assert any(v["id"] == "v4" and v["name"] == "Caroline" for v in visitors)
    finally:
        remove_visitor("v4")


def test_rename_visitor_without_name_falls_back_to_anonymous():
    add_visitor("v4b", "Carol")
    try:
        rename_visitor("v4b", "")
        visitors = list_visitors()
        assert any(v["id"] == "v4b" and v["name"] == "Anonymous" for v in visitors)
    finally:
        remove_visitor("v4b")


def test_rename_unknown_visitor_is_a_noop():
    rename_visitor("does-not-exist", "Whoever")
    assert not any(v["id"] == "does-not-exist" for v in list_visitors())


def test_add_visitor_publishes_presence_added():
    q = subscribe()
    try:
        add_visitor("v5", "Dana")
        message = q.get(timeout=1)
        assert message.startswith("event: presence-added\n")
        assert "Dana" in message
    finally:
        remove_visitor("v5")
        unsubscribe(q)


def test_remove_visitor_publishes_presence_removed():
    add_visitor("v6", "Eve")
    q = subscribe()
    try:
        remove_visitor("v6")
        message = q.get(timeout=1)
        assert message.startswith("event: presence-removed\n")
        assert '"id": "v6"' in message
    finally:
        unsubscribe(q)


def test_rename_visitor_publishes_presence_renamed():
    add_visitor("v7", "Frank")
    q = subscribe()
    try:
        rename_visitor("v7", "Franklin")
        message = q.get(timeout=1)
        assert message.startswith("event: presence-renamed\n")
        assert "Franklin" in message
    finally:
        remove_visitor("v7")
        unsubscribe(q)


def test_remove_unknown_visitor_does_not_publish():
    q = subscribe()
    try:
        remove_visitor("never-added")
        assert q.empty()
    finally:
        unsubscribe(q)


def test_reconnecting_visitor_does_not_duplicate_or_republish_added():
    # Simulates a page refresh: the new SSE connection registers before the
    # old one's disconnect has been noticed.
    add_visitor("v8", "Henry")
    q = subscribe()
    try:
        add_visitor("v8", "Henry")

        visitors = [v for v in list_visitors() if v["id"] == "v8"]
        assert len(visitors) == 1

        assert q.empty()  # no second "presence-added" for the same visitor
    finally:
        remove_visitor("v8")
        remove_visitor("v8")
        unsubscribe(q)


def test_reconnect_with_different_name_publishes_renamed():
    add_visitor("v9", "Iris")
    q = subscribe()
    try:
        add_visitor("v9", "Irene")

        message = q.get(timeout=1)
        assert message.startswith("event: presence-renamed\n")
        assert "Irene" in message
        assert any(v["id"] == "v9" and v["name"] == "Irene" for v in list_visitors())
    finally:
        remove_visitor("v9")
        remove_visitor("v9")
        unsubscribe(q)


def test_stale_connection_closing_does_not_remove_still_connected_visitor():
    # Old connection (refresh source) + new connection both register...
    add_visitor("v10", "Jack")
    add_visitor("v10", "Jack")

    q = subscribe()
    try:
        # ...then the *old* connection's delayed disconnect is detected.
        remove_visitor("v10")

        assert any(v["id"] == "v10" for v in list_visitors())
        assert q.empty()  # must NOT have been announced as removed yet
    finally:
        unsubscribe(q)

    # The new (still-live) connection eventually closes for real.
    remove_visitor("v10")
    assert not any(v["id"] == "v10" for v in list_visitors())


def test_profile_route_renames_visitor(client):
    add_visitor("web-1", "")
    try:
        response = client.post("/profile/", json={"visitor_id": "web-1", "name": "Grace"})
        assert response.status_code == 200
        assert response.json == {"ok": True}
        assert any(v["id"] == "web-1" and v["name"] == "Grace" for v in list_visitors())
    finally:
        remove_visitor("web-1")


def test_profile_route_requires_visitor_id(client):
    response = client.post("/profile/", json={"name": "Nobody"})
    assert response.status_code == 400
