import io
from datetime import timedelta

from app.extensions import db
from app.models import ClipboardEntry, SharedItem


def test_board_shows_files_and_clips_together(client):
    client.post(
        "/share/",
        data={"name": "Alice", "file": (io.BytesIO(b"hi"), "notes.txt")},
        content_type="multipart/form-data",
    )
    client.post("/clipboard/", data={"name": "Bob", "text": "hello board"})

    response = client.get("/")
    assert b"notes.txt" in response.data
    assert b"hello board" in response.data


def test_board_orders_entries_by_recency(client, app):
    client.post(
        "/share/",
        data={"name": "Alice", "file": (io.BytesIO(b"hi"), "older.txt")},
        content_type="multipart/form-data",
    )

    with app.app_context():
        item = SharedItem.query.first()
        item.uploaded_at = item.uploaded_at - timedelta(minutes=1)
        db.session.commit()

    client.post("/clipboard/", data={"name": "Bob", "text": "newer text"})

    response = client.get("/")
    html = response.data.decode()
    assert html.index("newer text") < html.index("older.txt")


def test_file_board_card_has_download_and_delete_data_attributes(client, app):
    client.post(
        "/share/",
        data={"name": "Alice", "file": (io.BytesIO(b"hi"), "attrs.txt")},
        content_type="multipart/form-data",
    )
    with app.app_context():
        item_id = SharedItem.query.first().id

    html = client.get("/").data.decode()
    assert f'id="board-item-file-{item_id}"' in html
    assert 'data-download-url="/media/shared/' in html
    assert f'data-delete-url="/delete/{item_id}/"' in html
    assert 'data-filename="attrs.txt"' in html


def test_clip_board_card_has_content_and_delete_data_attributes(client, app):
    client.post("/clipboard/", data={"name": "Bob", "text": "click me for details"})
    with app.app_context():
        entry_id = ClipboardEntry.query.first().id

    html = client.get("/").data.decode()
    assert f'id="board-item-clip-{entry_id}"' in html
    assert 'data-content="click me for details"' in html
    assert f'data-delete-url="/clipboard/{entry_id}/delete/"' in html
