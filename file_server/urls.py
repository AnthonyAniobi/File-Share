from django.urls import path
from file_server import views

urlpatterns = [
    path('', views.home, name='home'),
    path('share/', views.share, name='share'),
    path('delete/<int:pk>/', views.delete_file, name='delete_file'),
]