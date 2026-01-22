import socket
import os
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from .models import SharedItem

def home(request):
    shared_items = SharedItem.objects.all().order_by('-uploaded_at')
    # server
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)

    return render(request, "home.html", {"items": shared_items, "ip_address": ip_address})

def share(request):
    if request.method == "POST":
        f = request.FILES["file"]
        user = request.POST.get("name", "Unknown")

        SharedItem.objects.create(file=f, shared_by=user)
        return redirect("/")
    return render(request, "share.html")

def delete_file(request, pk):
    if request.method == "POST":
        item = get_object_or_404(SharedItem, pk=pk)
        
        # Delete the actual file from storage
        if item.file and os.path.isfile(item.file.path):
            os.remove(item.file.path)
        
        # Delete the database record
        item.delete()
        
        messages.success(request, "File deleted successfully!")
    
    return redirect("/")