import os
from datetime import datetime

from .extensions import db


class SharedItem(db.Model):
    __tablename__ = "shared_items"

    id = db.Column(db.Integer, primary_key=True)
    # Path relative to MEDIA_ROOT, e.g. "shared/report.pdf" - mirrors Django's FileField.name.
    file_path = db.Column(db.String(255), nullable=False)
    shared_by = db.Column(db.String(100), nullable=True)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    @property
    def filename(self):
        return os.path.basename(self.file_path)

    def __repr__(self):
        return f"<SharedItem {self.filename!r}>"


class ClipboardEntry(db.Model):
    __tablename__ = "clipboard_entries"

    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    shared_by = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<ClipboardEntry {self.id}>"
