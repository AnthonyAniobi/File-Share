import io

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
