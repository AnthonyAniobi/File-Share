import os
import uuid

from werkzeug.utils import secure_filename


def get_unique_filename(directory, original_filename):
    """Return a filesystem-safe filename that doesn't collide with an
    existing file in `directory`, appending a short random suffix on
    collision (mirrors Django's FileSystemStorage.get_available_name)."""
    filename = secure_filename(original_filename) or "file"
    name, ext = os.path.splitext(filename)

    candidate = filename
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{name}_{uuid.uuid4().hex[:7]}{ext}"

    return candidate
