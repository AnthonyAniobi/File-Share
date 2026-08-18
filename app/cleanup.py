import logging
import threading
import time
from datetime import datetime, timedelta

from .events import publish
from .extensions import db
from .models import SharedItem

logger = logging.getLogger(__name__)


def delete_expired_items(app):
    """Delete SharedItem rows (and their files on disk) past FILE_EXPIRY_SECONDS."""
    cutoff = datetime.utcnow() - timedelta(seconds=app.config["FILE_EXPIRY_SECONDS"])

    with app.app_context():
        expired = SharedItem.query.filter(SharedItem.uploaded_at < cutoff).all()
        expired_ids = [item.id for item in expired]
        for item in expired:
            file_full_path = app.config["MEDIA_ROOT"] / item.file_path
            if file_full_path.is_file():
                file_full_path.unlink()
            db.session.delete(item)

        if expired:
            db.session.commit()
            for item_id in expired_ids:
                publish("file-removed", {"id": item_id})
            logger.info("Cleaned up %d expired shared file(s)", len(expired))


def start_cleanup_thread(app):
    """Run delete_expired_items() on a background timer for the life of the app."""
    interval = app.config["CLEANUP_INTERVAL_SECONDS"]

    def run():
        while True:
            time.sleep(interval)
            try:
                delete_expired_items(app)
            except Exception:
                logger.exception("Expired file cleanup failed")

    threading.Thread(target=run, name="file-expiry-cleanup", daemon=True).start()
