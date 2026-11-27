from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.auth import PrincipalDep
from app.core.deps import PageDep
from app.core.errors import error_responses
from app.core.pagination import Page
from app.modules.org.deps import OrgServiceDep
from app.modules.org.schemas import (
    CategoryRead,
    CityRead,
    DepartmentRead,
    MeRead,
    UserCreate,
    UserRead,
    UserSummary,
    UserUpdate,
)

router = APIRouter(tags=["org"])


@router.get(
    "/me",
    response_model=MeRead,
    status_code=status.HTTP_200_OK,
    operation_id="org_get_me",
    summary="Current user, role and the permissions the UI uses to show actions",
    responses=error_responses(401, 500),
)
def get_me(principal: PrincipalDep, service: OrgServiceDep) -> MeRead:
    return service.me(principal.id)


@router.get(
    "/departments",
    response_model=list[DepartmentRead],
    status_code=status.HTTP_200_OK,
    operation_id="org_list_departments",
    responses=error_responses(401, 500),
)
def list_departments(principal: PrincipalDep, service: OrgServiceDep) -> list[DepartmentRead]:
    return service.departments()


@router.get(
    "/cities",
    response_model=list[CityRead],
    status_code=status.HTTP_200_OK,
    operation_id="org_list_cities",
    summary="Cities with tier (hotel limits depend on the tier)",
    responses=error_responses(401, 500),
)
def list_cities(principal: PrincipalDep, service: OrgServiceDep) -> list[CityRead]:
    return service.cities()


@router.get(
    "/categories",
    response_model=list[CategoryRead],
    status_code=status.HTTP_200_OK,
    operation_id="org_list_categories",
    responses=error_responses(401, 500),
)
def list_categories(principal: PrincipalDep, service: OrgServiceDep) -> list[CategoryRead]:
    return service.categories()


@router.get(
    "/users",
    response_model=Page[UserSummary],
    status_code=status.HTTP_200_OK,
    operation_id="org_search_users",
    summary="Search colleagues by name or employee code (e.g. to pick a delegate)",
    responses=error_responses(400, 401, 500),
)
def search_users(
    principal: PrincipalDep,
    service: OrgServiceDep,
    page: PageDep,
    q: Annotated[str, Query(max_length=100)] = "",
) -> Page[UserSummary]:
    return service.search(q, page)


@router.get(
    "/admin/users",
    response_model=Page[UserRead],
    status_code=status.HTTP_200_OK,
    operation_id="org_admin_list_users",
    responses=error_responses(400, 401, 403, 500),
)
def admin_list_users(
    principal: PrincipalDep,
    service: OrgServiceDep,
    page: PageDep,
    q: Annotated[str, Query(max_length=100)] = "",
) -> Page[UserRead]:
    return service.admin_list(principal, q, page)


@router.post(
    "/admin/users",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="org_admin_create_user",
    responses=error_responses(400, 401, 403, 409, 500),
)
def admin_create_user(
    body: UserCreate, principal: PrincipalDep, service: OrgServiceDep, response: Response
) -> UserRead:
    created = service.admin_create(principal, body)
    response.headers["Location"] = f"/api/v1/admin/users/{created.id}"
    return created


@router.patch(
    "/admin/users/{user_id}",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
    operation_id="org_admin_update_user",
    summary="Change role, manager (acyclic, audited), department or active flag",
    responses=error_responses(400, 401, 403, 404, 500),
)
def admin_update_user(
    user_id: str, body: UserUpdate, principal: PrincipalDep, service: OrgServiceDep
) -> UserRead:
    return service.admin_update(principal, user_id, body)
