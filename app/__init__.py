import os

from flask import Flask

from .admin import init_admin
from .cleanup import start_cleanup_thread
from .config import config_map
from .extensions import csrf, db, migrate


def create_app(config_name=None):
    config_name = config_name or os.environ.get("FLASK_CONFIG", "development")

    app = Flask(__name__)
    app.config.from_object(config_map.get(config_name, config_map["default"]))

    db.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)
    init_admin(app)

    from .file_server import bp as file_server_bp

    app.register_blueprint(file_server_bp)

    # Skip during tests, and skip the debug reloader's parent process so the
    # cleanup timer only ever runs once per real server process.
    if not app.config.get("TESTING") and (
        not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    ):
        start_cleanup_thread(app)

    return app
