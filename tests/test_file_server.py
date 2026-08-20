import io
from datetime import datetime, timedelta

from app.cleanup import delete_expired_items
from app.events import subscribe, unsubscribe
from app.extensions import db
from app.models import SharedItem


def test_home_page_loads(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"Shared Files" in response.data


def test_home_page_shows_empty_state_with_no_files(client):
    response = client.get("/")
    assert b"No files shared yet" in response.data


def test_share_page_loads(client):
    response = client.get("/share/")
    assert response.status_code == 200
    assert b"Share a File" in response.data


def test_share_without_file_redirects_with_error(client):
    response = client.post("/share/", data={"name": "Tester"}, follow_redirects=True)
    assert response.status_code == 200
    assert b"Please choose a file to share" in response.data


def test_upload_without_name_defaults_to_anonymous(client, app):
    data = {"file": (io.BytesIO(b"hello"), "anon.txt")}
    response = client.post(
        "/share/", data=data, content_type="multipart/form-data", follow_redirects=True
    )
    assert response.status_code == 200
    assert b"Anonymous" in response.data

    with app.app_context():
        item = SharedItem.query.first()
        assert item.shared_by == "Anonymous"


def test_upload_lists_and_deletes_file(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "test.txt"),
    }
    response = client.post(
        "/share/", data=data, content_type="multipart/form-data", follow_redirects=True
    )
    assert response.status_code == 200
    assert b"test.txt" in response.data
    assert b"Tester" in response.data

    with app.app_context():
        item = SharedItem.query.first()
        assert item is not None
        assert item.shared_by == "Tester"
        item_id = item.id
        stored_path = app.config["MEDIA_ROOT"] / item.file_path
        assert stored_path.is_file()

    response = client.post(f"/delete/{item_id}/", follow_redirects=True)
    assert response.status_code == 200
    assert b"File deleted successfully" in response.data
    assert not stored_path.is_file()

    with app.app_context():
        assert SharedItem.query.count() == 0


def test_shared_file_is_downloadable(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "download.txt"),
    }
    client.post("/share/", data=data, content_type="multipart/form-data")

    with app.app_context():
        item = SharedItem.query.first()
        download_url = f"/media/{item.file_path}"

    response = client.get(download_url)
    assert response.status_code == 200
    assert response.data == b"hello world"


def test_expired_files_are_deleted(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "expiring.txt"),
    }
    client.post("/share/", data=data, content_type="multipart/form-data")

    with app.app_context():
        item = SharedItem.query.first()
        stored_path = app.config["MEDIA_ROOT"] / item.file_path
        assert stored_path.is_file()

        # Backdate the upload so it's already past the expiry window.
        item.uploaded_at = datetime.utcnow() - timedelta(
            seconds=app.config["FILE_EXPIRY_SECONDS"] + 1
        )
        db.session.commit()

        delete_expired_items(app)

        assert SharedItem.query.count() == 0
        assert not stored_path.is_file()


def test_home_page_purges_expired_files(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "expiring.txt"),
    }
    client.post("/share/", data=data, content_type="multipart/form-data")

    with app.app_context():
        item = SharedItem.query.first()
        item.uploaded_at = datetime.utcnow() - timedelta(
            seconds=app.config["FILE_EXPIRY_SECONDS"] + 1
        )
        db.session.commit()

    response = client.get("/")
    assert b"expiring.txt" not in response.data

    with app.app_context():
        assert SharedItem.query.count() == 0


def test_upload_publishes_file_added_event(client, app):
    q = subscribe()
    try:
        data = {
            "name": "Tester",
            "file": (io.BytesIO(b"hello world"), "live.txt"),
        }
        client.post("/share/", data=data, content_type="multipart/form-data")

        message = q.get(timeout=1)
        assert message.startswith("event: file-added\n")
        assert "live.txt" in message
    finally:
        unsubscribe(q)


def test_delete_publishes_file_removed_event(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "todelete.txt"),
    }
    client.post("/share/", data=data, content_type="multipart/form-data")

    with app.app_context():
        item_id = SharedItem.query.first().id

    q = subscribe()
    try:
        client.post(f"/delete/{item_id}/")

        message = q.get(timeout=1)
        assert message.startswith("event: file-removed\n")
        assert f'"id": {item_id}' in message
    finally:
        unsubscribe(q)


def test_expiry_publishes_file_removed_event(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "expiring2.txt"),
    }
    client.post("/share/", data=data, content_type="multipart/form-data")

    with app.app_context():
        item = SharedItem.query.first()
        item_id = item.id
        item.uploaded_at = datetime.utcnow() - timedelta(
            seconds=app.config["FILE_EXPIRY_SECONDS"] + 1
        )
        db.session.commit()

    q = subscribe()
    try:
        delete_expired_items(app)

        message = q.get(timeout=1)
        assert message.startswith("event: file-removed\n")
        assert f'"id": {item_id}' in message
    finally:
        unsubscribe(q)


def test_file_card_renders_countdown_attributes(client, app):
    data = {
        "name": "Tester",
        "file": (io.BytesIO(b"hello world"), "countdown_test.txt"),
    }
    response = client.post(
        "/share/", data=data, content_type="multipart/form-data", follow_redirects=True
    )
    assert response.status_code == 200
    assert b'name="server-time"' in response.data
    assert b'data-created-at=' in response.data
    assert b'data-expiry-seconds=' in response.data
    assert b'class="countdown-display"' in response.data

