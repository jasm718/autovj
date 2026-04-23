from fastapi import FastAPI

from backend.realtime.websocket import router as websocket_router


def create_app() -> FastAPI:
    app = FastAPI(title="AutoVJ API")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(websocket_router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
