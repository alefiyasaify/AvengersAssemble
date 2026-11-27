"""HTTP only: parse, call service, return schema. No SQL, no business rules."""

from fastapi import APIRouter, Response, status

from app.core.deps import PageDep
from app.core.errors import error_responses
from app.core.pagination import Page
from app.modules._template.deps import ExampleServiceDep
from app.modules._template.schemas import ExampleCreate, ExampleRead, ExampleUpdate

router = APIRouter(prefix="/examples", tags=["examples"])


@router.get(
    "",
    response_model=Page[ExampleRead],
    status_code=status.HTTP_200_OK,
    operation_id="examples_list_examples",
    responses=error_responses(422, 500),
)
def list_examples(service: ExampleServiceDep, page: PageDep) -> Page[ExampleRead]:
    return service.list_examples(page)


@router.post(
    "",
    response_model=ExampleRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="examples_create_example",
    responses=error_responses(422, 500),
)
def create_example(
    body: ExampleCreate, service: ExampleServiceDep, response: Response
) -> ExampleRead:
    created = service.create_example(body)
    response.headers["Location"] = f"/api/v1/examples/{created.id}"
    return created


@router.get(
    "/{example_id}",
    response_model=ExampleRead,
    status_code=status.HTTP_200_OK,
    operation_id="examples_get_example",
    responses=error_responses(404, 500),
)
def get_example(example_id: str, service: ExampleServiceDep) -> ExampleRead:
    return service.get_example(example_id)


@router.patch(
    "/{example_id}",
    response_model=ExampleRead,
    status_code=status.HTTP_200_OK,
    operation_id="examples_update_example",
    responses=error_responses(404, 409, 422, 500),
)
def update_example(example_id: str, body: ExampleUpdate, service: ExampleServiceDep) -> ExampleRead:
    return service.update_example(example_id, body)


@router.delete(
    "/{example_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="examples_delete_example",
    responses=error_responses(404, 500),
)
def delete_example(example_id: str, service: ExampleServiceDep) -> Response:
    service.delete_example(example_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
