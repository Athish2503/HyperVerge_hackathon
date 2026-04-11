import asyncio
import os
import sys

# Ensure we can import from the api package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from api.db.migration import run_migrations

async def main():
    print("Running migrations...")
    await run_migrations()
    print("Migrations completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
