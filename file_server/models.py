from django.db import models

class SharedItem(models.Model):
    file = models.FileField(upload_to="shared/")
    shared_by = models.CharField(max_length=100, null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def filename(self):
        return self.file.name.split("/")[-1]