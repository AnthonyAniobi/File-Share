"""Shared Flask extension instances.

Instantiated here (unbound) and wired to the app in the factory, so any
module can import them without triggering a circular import.
"""
from flask_admin import Admin
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect

db = SQLAlchemy()
migrate = Migrate()
csrf = CSRFProtect()
admin = Admin(name="File Share Admin", template_mode="bootstrap4")
