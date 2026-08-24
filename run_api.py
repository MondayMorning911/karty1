#!/usr/bin/env python3
"""Start the Karty Publisher API server."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        # The Node gateway is the only public entry point for the Python API.
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_level="info",
    )
