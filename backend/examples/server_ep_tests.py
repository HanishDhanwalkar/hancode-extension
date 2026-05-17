import asyncio
import httpx
import json
from typing import AsyncGenerator, Callable, Optional


class AutocompleteClient:
    """Async SSE client for the autocomplete streaming endpoint."""

    def __init__(self, base_url: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()

    async def stream(
        self,
        pre_cursor: str,
        post_cursor: str = "",
        on_token: Optional[Callable[[str], None]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream autocomplete tokens asynchronously."""
        url = f"{self.base_url}/autocomplete/stream"
        payload = {
            "pre_cursor": pre_cursor,
            "post_cursor": post_cursor
        }

        if not self._client:
            raise RuntimeError(
                "Use client as context manager: async with AutocompleteClient(...)"
            )

        async with self._client.stream(
            "POST",
            url,
            json=payload,
            headers={"Accept": "text/event-stream"}
        ) as response:
            response.raise_for_status()

            async for line in response.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue

                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break

                try:
                    event = json.loads(data_str)
                    if event.get("type") == "error":
                        raise RuntimeError(
                            f"Server error: {event.get('content')}")
                    if event.get("type") in ("token", "done"):
                        token = event.get("content", "")
                        if on_token:
                            on_token(token)
                        if token:
                            yield token
                except json.JSONDecodeError:
                    continue

    async def complete(self, pre_cursor: str, post_cursor: str = "") -> str:
        """Collect all tokens and return full completion."""
        tokens = []
        async for token in self.stream(pre_cursor, post_cursor):
            tokens.append(token)
        return "".join(tokens)


# ============ TEST ENTRY POINT ============
async def main():
    async with AutocompleteClient("http://localhost:8000") as client:
        print("[TEST 1]")

        result = await client.complete(
            pre_cursor="async def hello():\n    ",
            post_cursor=""
        )
        print(f"\nResult:\n{result}")
        print("[TEST 1] DONE")

        print("\n\n[TEST 2]")
        original = """
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
        """

        async for _ in client.stream(
            pre_cursor=original,
            post_cursor="",
        ):
            print(_, end="", flush=True)

        print("\n\n✅ Stream completed successfully!")

        # Alternative: use complete() for one-shot result
        # result = await client.complete(
        #     pre_cursor="async def hello():\n    ",
        #     post_cursor=""
        # )
        # print(f"\n✅ Result:\n{result}")


if __name__ == "__main__":
    asyncio.run(main())
