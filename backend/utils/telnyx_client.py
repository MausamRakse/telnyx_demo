import asyncio
import httpx
from config import settings


class RetryingAsyncClient(httpx.AsyncClient):
    async def request(self, method: str, url: str, **kwargs):
        retries = 3
        for attempt in range(retries):
            try:
                return await super().request(method, url, **kwargs)
            except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.WriteError) as e:
                if attempt == retries - 1:
                    print(f"❌ RetryingAsyncClient: Request failed after {retries} attempts: {e}")
                    raise
                print(f"⚠️  RetryingAsyncClient: Request {method} {url} failed with {e}. Retrying {attempt + 1}/{retries}...")
                await asyncio.sleep(0.5 * (attempt + 1))


# Set keepalive_expiry to 5.0 seconds to prevent reusing stale idle connections closed by Telnyx/Cloudflare
limits = httpx.Limits(keepalive_expiry=5.0)

telnyx = RetryingAsyncClient(
    base_url=settings.TELNYX_BASE_URL,
    headers={
        "Authorization": f"Bearer {settings.TELNYX_API_KEY}",
        "Content-Type": "application/json",
    },
    limits=limits,
    timeout=30.0,
)

