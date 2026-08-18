import json

from app.events import publish, subscribe, unsubscribe


def test_subscribers_receive_published_messages():
    q = subscribe()
    try:
        publish("file-added", {"id": 1, "html": "<div></div>"})

        message = q.get(timeout=1)
        assert message.startswith("event: file-added\n")

        _, data_line = message.strip().split("\n")
        payload = json.loads(data_line[len("data: "):])
        assert payload == {"id": 1, "html": "<div></div>"}
    finally:
        unsubscribe(q)


def test_unsubscribed_queue_receives_nothing():
    q = subscribe()
    unsubscribe(q)

    publish("file-removed", {"id": 42})

    assert q.empty()


def test_publish_fans_out_to_multiple_subscribers():
    q1 = subscribe()
    q2 = subscribe()
    try:
        publish("file-removed", {"id": 7})

        assert q1.get(timeout=1) == q2.get(timeout=1)
    finally:
        unsubscribe(q1)
        unsubscribe(q2)


def test_publish_with_no_subscribers_does_not_raise():
    publish("file-added", {"id": 1, "html": "<div></div>"})
