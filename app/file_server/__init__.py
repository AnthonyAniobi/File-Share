from flask import Blueprint

bp = Blueprint("file_server", __name__)

from . import routes  # noqa: E402,F401  registers routes on import
