"""Injectable clock. Services take `now` so tests and the seed command can control time."""

from collections.abc import Callable
from datetime import datetime
from typing import Annotated

from fastapi import Depends, Request

from app.core.db import utcnow

Clock = Callable[[], datetime]


def get_clock(request: Request) -> Clock:
    clock: Clock = getattr(request.app.state, "clock", utcnow)
    return clock


ClockDep = Annotated[Clock, Depends(get_clock)]
