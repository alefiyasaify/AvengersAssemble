from typing import Annotated

from fastapi import Depends

from app.core.deps import DbSession
from app.modules._template.repository import ExampleRepository
from app.modules._template.service import ExampleService


def get_example_service(session: DbSession) -> ExampleService:
    return ExampleService(ExampleRepository(session))


ExampleServiceDep = Annotated[ExampleService, Depends(get_example_service)]
