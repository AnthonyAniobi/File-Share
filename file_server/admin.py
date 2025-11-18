from django.contrib import admin

from file_server.models import SharedItem

admin.site.site_header = "File Share Admin"
admin.site.site_title = "File Share Admin Portal"
admin.site.index_title = "Welcome to File Share Admin Portal"

admin.site.register(SharedItem)