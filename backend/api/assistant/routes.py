from fastapi import APIRouter
from schemas.assistant import CreateAssistantRequest, UpdateAssistantRequest
from services.assistant_service import (
    create_assistant,
    list_assistants,
    get_assistant,
    update_assistant,
    delete_assistant,
)

router = APIRouter()

@router.post("")
async def create_assistant_endpoint(payload: CreateAssistantRequest):
    """Create a new AI assistant."""
    return await create_assistant(payload)


@router.get("")
async def list_assistants_endpoint():
    """List all AI assistants."""
    return await list_assistants()


@router.get("/{assistant_id}")
async def get_assistant_endpoint(
    assistant_id: str,
    fetch_dynamic_variables_from_webhook: bool = False,
    from_number: str = None,
    to_number: str = None,
    call_control_id: str = None,
):
    """Get a specific AI assistant."""
    return await get_assistant(
        assistant_id,
        fetch_dynamic_variables_from_webhook=fetch_dynamic_variables_from_webhook,
        from_number=from_number,
        to_number=to_number,
        call_control_id=call_control_id,
    )


@router.post("/{assistant_id}")
async def update_assistant_endpoint(assistant_id: str, payload: UpdateAssistantRequest):
    """Update a specific AI assistant."""
    return await update_assistant(assistant_id, payload)


@router.delete("/{assistant_id}")
async def delete_assistant_endpoint(assistant_id: str):
    """Delete a specific AI assistant."""
    return await delete_assistant(assistant_id)
