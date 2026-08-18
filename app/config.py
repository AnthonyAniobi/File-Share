import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    """Base configuration shared by every environment."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me-in-production")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'db.sqlite3'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Media (user uploads), kept separate from static assets like Django's
    # MEDIA_ROOT/STATIC_ROOT split.
    MEDIA_ROOT = BASE_DIR / "media"
    SHARED_UPLOAD_DIR = MEDIA_ROOT / "shared"

    # Shared files (and their DB rows) are removed this long after upload,
    # so the server doesn't accumulate files/rows over time.
    FILE_EXPIRY_SECONDS = int(os.environ.get("FILE_EXPIRY_SECONDS", 300))
    CLIPBOARD_EXPIRY_SECONDS = int(os.environ.get("CLIPBOARD_EXPIRY_SECONDS", 300))
    CLEANUP_INTERVAL_SECONDS = int(os.environ.get("CLEANUP_INTERVAL_SECONDS", 30))


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
