import pytest

from app import create_app
from app.extensions import db as _db


@pytest.fixture
def app(tmp_path):
    flask_app = create_app("testing")
    flask_app.config["MEDIA_ROOT"] = tmp_path
    flask_app.config["SHARED_UPLOAD_DIR"] = tmp_path / "shared"
    flask_app.config["SHARED_UPLOAD_DIR"].mkdir(parents=True, exist_ok=True)

    with flask_app.app_context():
        _db.create_all()
        yield flask_app
        _db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()
