# Modular Backend Refactor Tasks

## Setup
- [x] Clarify database (no DB, Telnyx API only, stubs) and auth (not needed)

## Config & Entry
- [x] Create `config.py`
- [x] Create `main.py`

## Utilities
- [x] Create `utils/__init__.py`
- [x] Create `utils/telnyx_client.py`
- [x] Create `utils/helpers.py`

## Schemas
- [x] Create `schemas/__init__.py`
- [x] Create `schemas/assistant.py`
- [x] Create `schemas/call.py`

## Services
- [x] Create `services/__init__.py`
- [x] Create `services/assistant_service.py`
- [x] Create `services/call_service.py`

## API - Call Module
- [x] Create `api/__init__.py`
- [x] Create `api/call/__init__.py`
- [x] Create `api/call/routes.py`

## API - Assistant Module
- [x] Create `api/assistant/__init__.py`
- [x] Create `api/assistant/routes.py`

## API - Placeholder Modules
- [x] Create `api/agent/routes.py` (stub)
- [x] Create `api/user/routes.py` (stub)

## Central Router
- [x] Create `api/router.py`

## Stubs
- [x] Create `models/__init__.py`
- [x] Create `database/__init__.py`

## Verify
- [x] Test `bash start.sh` starts correctly
- [x] Test `/ai/assistants` CRUD endpoints
- [x] Test `/dial` and `/webhook` still work
