"""Dashboard endpoint (ARD sections 8 and 10)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.auth import PrincipalDep
from app.core.errors import error_responses
from app.modules.claims.schemas import Category
from app.modules.reports.deps import ReportsServiceDep
from app.modules.reports.schemas import DashboardSummary

router = APIRouter(tags=["reports"])


@router.get(
    "/dashboard/summary",
    response_model=DashboardSummary,
    status_code=status.HTTP_200_OK,
    operation_id="reports_get_dashboard_summary",
    summary="Spend, violations and approval time, scoped to own / team / company by role",
    responses=error_responses(400, 401, 500),
)
def get_dashboard_summary(
    principal: PrincipalDep,
    service: ReportsServiceDep,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    department: Annotated[str | None, Query(max_length=36)] = None,
    category: Category | None = None,
) -> DashboardSummary:
    return service.summary(principal, date_from, date_to, department, category)
