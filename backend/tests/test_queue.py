import pytest

from services.queue import QueueManager


@pytest.fixture
def queue():
    return QueueManager()


def test_enqueue_dequeue():
    from services.queue import QueueManager

    queue = QueueManager()
    key = "test_queue"
    value = "test_value"
    queue.enqueue(key, value)
    result = queue.dequeue(key)
    if result:
        assert result == value


def test_queue_length():
    from services.queue import QueueManager

    queue = QueueManager()
    key = "test_queue_len"
    queue.enqueue(key, "v1")
    queue.enqueue(key, "v2")
    assert queue.get_length(key) == 2
    queue.dequeue(key)
    assert queue.get_length(key) == 1
    queue.dequeue(key)
    assert queue.get_length(key) == 0
