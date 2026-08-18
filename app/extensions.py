"""Shared Flask extension instances.

Instantiated here (unbound) and wired to the app in the factory, so any
module can import them without triggering a circular import.

Flask-Admin's `Admin` is deliberately not included here: it keeps its
registered views on the instance itself, so sharing one globally across
multiple `create_app()` calls (e.g. once per test) causes blueprint-name
collisions. It's built fresh per app in `admin.init_admin()` instead.
"""
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect

db = SQLAlchemy()
migrate = Migrate()
csrf = CSRFProtect()
