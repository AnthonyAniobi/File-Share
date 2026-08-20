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
from ..events import format_message, publish, subscribe, unsubscribe
from ..extensions import db
from ..models import ClipboardEntry, SharedItem
from ..presence import add_visitor, list_visitors, remove_visitor, rename_visitor
from ..utils import get_unique_filename
from . import bp


@bp.route("/")
def home():
    delete_expired_items(current_app._get_current_object())

    items = SharedItem.query.order_by(SharedItem.uploaded_at.desc()).all()
    clips = ClipboardEntry.query.order_by(ClipboardEntry.created_at.desc()).all()

    # One merged, recency-sorted feed for the board — files and text
    # interleaved by whichever was actually shared most recently.
    board_entries = sorted(
        [("file", item) for item in items] + [("clip", clip) for clip in clips],
        key=lambda pair: pair[1].uploaded_at if pair[0] == "file" else pair[1].created_at,
        reverse=True,
    )

    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)

    return render_template("home.html", board_entries=board_entries, ip_address=ip_address)


@bp.route("/share/", methods=["GET", "POST"])
def share():
    if request.method == "GET":
        # Sharing now happens inline on the home page; send old links there.
        return redirect(url_for("file_server.home"))

    uploaded_file = request.files.get("file")
    if uploaded_file is None or uploaded_file.filename == "":
        flash("Please choose a file to share.", "error")
        return redirect(url_for("file_server.home"))

    shared_by = (request.form.get("name") or "").strip() or "Anonymous"

    upload_dir = current_app.config["SHARED_UPLOAD_DIR"]
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = get_unique_filename(upload_dir, uploaded_file.filename)
    uploaded_file.save(upload_dir / filename)

    item = SharedItem(file_path=f"shared/{filename}", shared_by=shared_by)
    db.session.add(item)
    db.session.commit()

    publish("file-added", {
        "id": item.id,
        "html": render_template("_board_card.html", kind="file", item=item),
    })

    return redirect(url_for("file_server.home"))


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

    shared_by = (request.form.get("name") or "").strip() or "Anonymous"

    entry = ClipboardEntry(content=text, shared_by=shared_by)
    db.session.add(entry)
    db.session.commit()

    publish("clip-added", {
        "id": entry.id,
        "html": render_template("_board_card.html", kind="clip", item=entry),
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
    # as_attachment forces Content-Disposition: attachment, so the browser
    # always saves the file instead of trying to display it inline — the
    # client-side `download` attribute alone isn't reliable enough (mobile
    # Safari/Chrome in particular tend to just open viewable file types).
    return send_from_directory(current_app.config["MEDIA_ROOT"], filename, as_attachment=True)


@bp.route("/events/stream")
def event_stream():
    visitor_id = (request.args.get("visitor_id") or "").strip()
    initial_name = request.args.get("name") or ""

    def generate():
        subscriber_queue = subscribe()
        if visitor_id:
            # Send the current roster to this connection only *before*
            # registering, so the caller doesn't see themselves twice
            # (once in the sync snapshot, once via the broadcast below).
            subscriber_queue.put(format_message("presence-sync", list_visitors()))
            add_visitor(visitor_id, initial_name)
        try:
            while True:
                try:
                    # A closed tab is only detected when a write to its dead
                    # socket fails, which happens on the *next* yield — so
                    # this interval doubles as the "someone left" latency
                    # for the presence sidebar. Kept short for that reason
                    # (actual TCP failure detection can still take a couple
                    # of attempts, so this is a lower bound, not a guarantee).
                    message = subscriber_queue.get(timeout=2)
                    yield message
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            unsubscribe(subscriber_queue)
            if visitor_id:
                remove_visitor(visitor_id)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@bp.route("/profile/", methods=["POST"])
def update_profile():
    payload = request.get_json(silent=True) or {}
    visitor_id = (payload.get("visitor_id") or "").strip()
    name = payload.get("name") or ""

    if not visitor_id:
        return {"error": "visitor_id is required"}, 400

    rename_visitor(visitor_id, name)
    return {"ok": True}
