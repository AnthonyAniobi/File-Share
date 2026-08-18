import os
import queue
import socket

from flask import (
    Response,
    current_app,
    flash,
    redirect,
    render_template,
    request,
    send_from_directory,
    url_for,
)

from ..cleanup import delete_expired_items
from ..events import publish, subscribe, unsubscribe
from ..extensions import db
from ..models import ClipboardEntry, SharedItem
from ..utils import get_unique_filename
from . import bp


@bp.route("/")
def home():
    delete_expired_items(current_app._get_current_object())

    items = SharedItem.query.order_by(SharedItem.uploaded_at.desc()).all()
    clips = ClipboardEntry.query.order_by(ClipboardEntry.created_at.desc()).all()

    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)

    return render_template("home.html", items=items, clips=clips, ip_address=ip_address)


@bp.route("/share/", methods=["GET", "POST"])
def share():
    if request.method == "POST":
        uploaded_file = request.files.get("file")
        if uploaded_file is None or uploaded_file.filename == "":
            flash("Please choose a file to share.", "error")
            return redirect(url_for("file_server.share"))

        shared_by = request.form.get("name") or "Unknown"

        upload_dir = current_app.config["SHARED_UPLOAD_DIR"]
        upload_dir.mkdir(parents=True, exist_ok=True)

        filename = get_unique_filename(upload_dir, uploaded_file.filename)
        uploaded_file.save(upload_dir / filename)

        item = SharedItem(file_path=f"shared/{filename}", shared_by=shared_by)
        db.session.add(item)
        db.session.commit()

        publish("file-added", {
            "id": item.id,
            "html": render_template("_file_card.html", item=item),
        })

        return redirect(url_for("file_server.home"))

    return render_template("share.html")


@bp.route("/delete/<int:pk>/", methods=["POST"])
def delete_file(pk):
    item = db.get_or_404(SharedItem, pk)

    file_full_path = current_app.config["MEDIA_ROOT"] / item.file_path
    if os.path.isfile(file_full_path):
        os.remove(file_full_path)

    db.session.delete(item)
    db.session.commit()

    publish("file-removed", {"id": pk})

    flash("File deleted successfully!", "success")
    return redirect(url_for("file_server.home"))


@bp.route("/clipboard/", methods=["POST"])
def clipboard_add():
    text = (request.form.get("text") or "").strip()
    if not text:
        flash("Please enter some text to share.", "error")
        return redirect(url_for("file_server.home"))

    shared_by = request.form.get("name") or "Unknown"

    entry = ClipboardEntry(content=text, shared_by=shared_by)
    db.session.add(entry)
    db.session.commit()

    publish("clip-added", {
        "id": entry.id,
        "html": render_template("_clip_card.html", entry=entry),
    })

    return redirect(url_for("file_server.home"))


@bp.route("/clipboard/<int:pk>/delete/", methods=["POST"])
def clipboard_delete(pk):
    entry = db.get_or_404(ClipboardEntry, pk)

    db.session.delete(entry)
    db.session.commit()

    publish("clip-removed", {"id": pk})

    flash("Text removed.", "success")
    return redirect(url_for("file_server.home"))


@bp.route("/media/<path:filename>")
def media(filename):
    return send_from_directory(current_app.config["MEDIA_ROOT"], filename)


@bp.route("/events/stream")
def event_stream():
    def generate():
        subscriber_queue = subscribe()
        try:
            while True:
                try:
                    message = subscriber_queue.get(timeout=15)
                    yield message
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            unsubscribe(subscriber_queue)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
