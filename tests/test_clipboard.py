from datetime import datetime, timedelta

from app.cleanup import delete_expired_items
from app.events import subscribe, unsubscribe
from app.extensions import db
from app.models import ClipboardEntry


def test_home_page_shows_clipboard_empty_state(client):
    response = client.get("/")
    assert b"Nothing on the clipboard yet" in response.data


def test_pasting_text_lists_and_deletes_it(client, app):
    response = client.post(
        "/clipboard/",
        data={"name": "Tester", "text": "hello from another device"},
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"hello from another device" in response.data
    assert b"Tester" in response.data

    with app.app_context():
        entry = ClipboardEntry.query.first()
        assert entry is not None
        assert entry.content == "hello from another device"
        assert entry.shared_by == "Tester"
        entry_id = entry.id

    response = client.post(f"/clipboard/{entry_id}/delete/", follow_redirects=True)
    assert response.status_code == 200
    assert b"Text removed" in response.data

    with app.app_context():
        assert ClipboardEntry.query.count() == 0


def test_pasting_empty_text_redirects_with_error(client):
    response = client.post(
        "/clipboard/", data={"name": "Tester", "text": "   "}, follow_redirects=True
    )
    assert response.status_code == 200
    assert b"Please enter some text to share" in response.data


def test_pasted_text_is_html_escaped(client):
    response = client.post(
        "/clipboard/",
        data={"name": "Tester", "text": "<script>alert(1)</script>"},
        follow_redirects=True,
    )
    assert b"<script>alert(1)</script>" not in response.data
    assert b"&lt;script&gt;alert(1)&lt;/script&gt;" in response.data


def test_expired_clipboard_entries_are_deleted(client, app):
    client.post("/clipboard/", data={"name": "Tester", "text": "expiring text"})

    with app.app_context():
        entry = ClipboardEntry.query.first()
        entry.created_at = datetime.utcnow() - timedelta(
            seconds=app.config["CLIPBOARD_EXPIRY_SECONDS"] + 1
        )
        db.session.commit()

        delete_expired_items(app)

        assert ClipboardEntry.query.count() == 0


def test_home_page_purges_expired_clipboard_entries(client, app):
    client.post("/clipboard/", data={"name": "Tester", "text": "expiring text"})

    with app.app_context():
        entry = ClipboardEntry.query.first()
        entry.created_at = datetime.utcnow() - timedelta(
            seconds=app.config["CLIPBOARD_EXPIRY_SECONDS"] + 1
        )
        db.session.commit()

    response = client.get("/")
    assert b"expiring text" not in response.data

    with app.app_context():
        assert ClipboardEntry.query.count() == 0


def test_paste_publishes_clip_added_event(client, app):
    q = subscribe()
    try:
        client.post("/clipboard/", data={"name": "Tester", "text": "live paste"})

        message = q.get(timeout=1)
        assert message.startswith("event: clip-added\n")
        assert "live paste" in message
    finally:
        unsubscribe(q)


def test_delete_publishes_clip_removed_event(client, app):
    client.post("/clipboard/", data={"name": "Tester", "text": "to delete"})

    with app.app_context():
        entry_id = ClipboardEntry.query.first().id

    q = subscribe()
    try:
        client.post(f"/clipboard/{entry_id}/delete/")

        message = q.get(timeout=1)
        assert message.startswith("event: clip-removed\n")
        assert f'"id": {entry_id}' in message
    finally:
        unsubscribe(q)


def test_expiry_publishes_clip_removed_event(client, app):
    client.post("/clipboard/", data={"name": "Tester", "text": "expiring live"})

    with app.app_context():
        entry = ClipboardEntry.query.first()
        entry_id = entry.id
        entry.created_at = datetime.utcnow() - timedelta(
            seconds=app.config["CLIPBOARD_EXPIRY_SECONDS"] + 1
        )
        db.session.commit()

    q = subscribe()
    try:
        delete_expired_items(app)

        message = q.get(timeout=1)
        assert message.startswith("event: clip-removed\n")
        assert f'"id": {entry_id}' in message
    finally:
        unsubscribe(q)


def test_clip_card_renders_countdown_attributes(client, app):
    response = client.post(
        "/clipboard/",
        data={"name": "Tester", "text": "countdown clip text"},
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b'name="server-time"' in response.data
    assert b'data-created-at=' in response.data
    assert b'data-expiry-seconds=' in response.data
    assert b'class="countdown-display"' in response.data

