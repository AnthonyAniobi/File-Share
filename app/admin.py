from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView

from .extensions import db
from .models import SharedItem


class SharedItemAdmin(ModelView):
    column_list = ("id", "filename", "shared_by", "uploaded_at")
    column_searchable_list = ("shared_by",)
    column_default_sort = ("uploaded_at", True)
    # Raw file uploads/replacements go through the Share page; the admin
    # panel manages metadata only so records never get orphaned from disk.
    form_excluded_columns = ("file_path",)
    can_create = False


def init_admin(app):
    admin = Admin(app, name="File Share Admin", template_mode="bootstrap4")
    admin.add_view(SharedItemAdmin(SharedItem, db.session, name="Shared Items"))
