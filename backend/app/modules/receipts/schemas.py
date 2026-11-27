from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sha256: str
    mime: str
    size_bytes: int
    original_name: str
    uploaded_at: datetime
