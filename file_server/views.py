from django.shortcuts import render, redirect
from .models import SharedItem

def home(request):
    shared_items = SharedItem.objects.all().order_by('-uploaded_at')
    return render(request, "home.html", {"items": shared_items})

def share(request):
    if request.method == "POST":
        f = request.FILES["file"]
        user = request.POST.get("name", "Unknown")

        SharedItem.objects.create(file=f, shared_by=user)
        return redirect("/")
    return render(request, "share.html")