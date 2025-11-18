from django.urls import path
from file_server import views

urlpatterns = [
    path('', views.home, name='home'),
    path('share/', views.share, name='share'),
]