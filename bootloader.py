import argparse
import uvicorn

SERVICES = {
    "ai-refinement": "backend.services.ai_refinement.app:app",
    "tts-service": "backend.services.tts_service.app:app"
}

def main():
    parser = argparse.ArgumentParser(description="Bootloader for pptx-tts FastAPI microservices.")
    parser.add_argument("service", choices=SERVICES.keys(), help="Service to start")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev mode)")
    args = parser.parse_args()

    app_path = SERVICES[args.service]
    print(f"[BOOTLOADER] Starting {args.service} on {args.host}:{args.port} ...")
    uvicorn.run(app_path, host=args.host, port=args.port, reload=args.reload)

if __name__ == "__main__":
    main()
