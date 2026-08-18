from app import create_app

app = create_app()

if __name__ == "__main__":
    # threaded=True: the live-updates page holds a long-lived connection per
    # browser (see /events/stream), which would otherwise stall every other
    # request on the dev server's single worker thread.
    app.run(
        host="0.0.0.0",
        port=8000,
        debug=app.config.get("DEBUG", False),
        threaded=True,
    )
