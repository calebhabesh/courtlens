"""Bound assistant request bytes before FastAPI JSON/schema parsing."""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_ASSISTANT_REQUEST_BYTES = 160 * 1024


class AssistantRequestLimit:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] not in (
            "/api/workbench/assistant/turn",
            "/api/workbench/assistant/v2/turn",
            "/api/workbench/assistant/query",
        ):
            await self.app(scope, receive, send)
            return
        messages: list[Message] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > MAX_ASSISTANT_REQUEST_BYTES:
                await JSONResponse(
                    {"detail": "Assistant request byte limit exceeded."}, status_code=413
                )(scope, receive, send)
                return
            messages.append(message)
            if not message.get("more_body", False):
                break
        index = 0

        async def replay() -> Message:
            nonlocal index
            if index < len(messages):
                item = messages[index]
                index += 1
                return item
            return await receive()

        await self.app(scope, replay, send)
