#!/usr/bin/env python3
"""
API Documentation Generator

This script extracts OpenAPI schemas from FastAPI services and generates
comprehensive API documentation using multiple formats.
"""

import json
import sys
import os
from pathlib import Path
from typing import Dict, Any, List, Union

# Add the backend path to Python path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))


def extract_openapi_schema(app_module: str, app_instance: str = "app") -> Dict[str, Any]:
    """
    Extract OpenAPI schema from a FastAPI application.
    
    Args:
        app_module: Python module path (e.g., 'services.ai_refinement.app')
        app_instance: FastAPI app instance name (default: 'app')
        
    Returns:
        OpenAPI schema as dictionary
    """
    try:
        # Import the FastAPI app
        module = __import__(app_module, fromlist=[app_instance])
        app = getattr(module, app_instance)
        
        # Extract OpenAPI schema
        schema = app.openapi()
        return schema
    except Exception as e:
        print(f"Error extracting schema from {app_module}: {e}")
        return {}


def save_schema(schema: Dict[str, Any], output_path: str) -> None:
    """Save OpenAPI schema to JSON file."""
    with open(output_path, 'w') as f:
        json.dump(schema, f, indent=2)
    print(f"Schema saved to: {output_path}")


def generate_redoc_html(schema_path: str, output_path: str, title: str) -> None:
    """Generate ReDoc HTML documentation from OpenAPI schema."""
    try:
        # Create ReDoc HTML template
        html_template = f"""
<!DOCTYPE html>
<html>
<head>
    <title>{title} - API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
        body {{
            margin: 0;
            padding: 0;
        }}
    </style>
</head>
<body>
    <redoc spec-url='{os.path.basename(schema_path)}' theme="idea"></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@2.0.0/bundles/redoc.standalone.js"></script>
</body>
</html>
"""
        
        # Save HTML file
        with open(output_path, 'w') as f:
            f.write(html_template)
        
        print(f"ReDoc documentation generated: {output_path}")
    except Exception as e:
        print(f"Error generating ReDoc documentation: {e}")


def generate_swagger_ui_html(schema_path: str, output_path: str, title: str) -> None:
    """Generate Swagger UI HTML documentation from OpenAPI schema."""
    try:
        # Read the schema
        with open(schema_path, 'r') as f:
            schema = json.load(f)
        
        # Create Swagger UI HTML
        html_template = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />
    <style>
        html {{
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }}
        *, *:before, *:after {{
            box-sizing: inherit;
        }}
        body {{
            margin:0;
            background: #fafafa;
        }}
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-standalone-preset.js"></script>
    <script>
        const ui = SwaggerUIBundle({{
            url: '{os.path.basename(schema_path)}',
            spec: {json.dumps(schema)},
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
            ],
            plugins: [
                SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout"
        }});
    </script>
</body>
</html>
"""
        
        # Save HTML file
        with open(output_path, 'w') as f:
            f.write(html_template)
        
        print(f"Swagger UI documentation generated: {output_path}")
    except Exception as e:
        print(f"Error generating Swagger UI documentation: {e}")


def generate_postman_collection(schema: Dict[str, Any], output_path: str) -> None:
    """Generate Postman collection from OpenAPI schema."""
    try:
        collection: Dict[str, Any] = {
            "info": {
                "name": schema.get("info", {}).get("title", "API Collection"),
                "description": schema.get("info", {}).get("description", ""),
                "version": schema.get("info", {}).get("version", "1.0.0"),
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": []
        }
        
        # Extract server URL
        servers = schema.get("servers", [{"url": "http://localhost:8000"}])
        base_url = servers[0]["url"]
        
        # Process paths
        for path, methods in schema.get("paths", {}).items():
            for method, details in methods.items():
                if method.upper() in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
                    request_item: Dict[str, Any] = {
                        "name": details.get("summary", f"{method.upper()} {path}"),
                        "request": {
                            "method": method.upper(),
                            "header": [],
                            "url": {
                                "raw": f"{base_url}{path}",
                                "protocol": "http",
                                "host": [base_url.replace("http://", "").replace("https://", "").split(":")[0]],
                                "port": base_url.split(":")[-1] if ":" in base_url else "80",
                                "path": path.strip("/").split("/")
                            },
                            "description": details.get("description", "")
                        }
                    }
                    
                    # Add request body if present
                    if "requestBody" in details:
                        request_item["request"]["body"] = {
                            "mode": "raw",
                            "raw": "{}",
                            "options": {
                                "raw": {
                                    "language": "json"
                                }
                            }
                        }
                        request_item["request"]["header"].append({
                            "key": "Content-Type",
                            "value": "application/json"
                        })
                    
                    collection["item"].append(request_item)
        
        # Save Postman collection
        with open(output_path, 'w') as f:
            json.dump(collection, f, indent=2)
        
        print(f"Postman collection generated: {output_path}")
    except Exception as e:
        print(f"Error generating Postman collection: {e}")


def generate_index_html(docs_dir: Path) -> None:
    """Generate main documentation index page."""
    try:
        html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PPTX-TTS API Documentation</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
        }
        .service-section {
            margin: 30px 0;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background-color: #fafafa;
        }
        .service-title {
            color: #34495e;
            margin-bottom: 15px;
        }
        .doc-links {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .doc-link {
            padding: 10px 15px;
            background-color: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background-color 0.3s;
        }
        .doc-link:hover {
            background-color: #2980b9;
        }
        .schema-link {
            background-color: #27ae60;
        }
        .schema-link:hover {
            background-color: #219a52;
        }
        .postman-link {
            background-color: #e67e22;
        }
        .postman-link:hover {
            background-color: #d35400;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 PPTX-TTS API Documentation</h1>
        <p>Welcome to the comprehensive API documentation for the PPTX-TTS system. 
           This system provides AI-powered text refinement and text-to-speech services.</p>

        <div class="service-section">
            <h2 class="service-title">🤖 AI Refinement Service</h2>
            <p>Advanced text refinement using AI models for improving presentation content.</p>
            <div class="doc-links">
                <a href="ai_refinement_service_redoc.html" class="doc-link">📖 ReDoc</a>
                <a href="ai_refinement_service_swagger.html" class="doc-link">⚡ Swagger UI</a>
                <a href="ai_refinement_openapi.json" class="doc-link schema-link">📄 OpenAPI Schema</a>
                <a href="ai_refinement_service_postman.json" class="doc-link postman-link">📮 Postman Collection</a>
            </div>
        </div>

        <div class="service-section">
            <h2 class="service-title">🔊 Text-to-Speech Service</h2>
            <p>Professional text-to-speech conversion with multiple voice options and formats.</p>
            <div class="doc-links">
                <a href="tts_service_redoc.html" class="doc-link">📖 ReDoc</a>
                <a href="tts_service_swagger.html" class="doc-link">⚡ Swagger UI</a>
                <a href="tts_service_openapi.json" class="doc-link schema-link">📄 OpenAPI Schema</a>
                <a href="tts_service_postman.json" class="doc-link postman-link">📮 Postman Collection</a>
            </div>
        </div>

        <div class="footer">
            <p>Generated automatically using the API Documentation Generator</p>
            <p>For more information, see the project repository</p>
        </div>
    </div>
</body>
</html>
"""
        
        # Save index file
        index_path = docs_dir / "index.html"
        with open(index_path, 'w') as f:
            f.write(html_content)
        
        print(f"Documentation index generated: {index_path}")
    except Exception as e:
        print(f"Error generating documentation index: {e}")


def main() -> None:
    """Main function to generate API documentation."""
    print("🚀 Generating API Documentation...")
    
    # Create docs directory
    docs_dir = Path("docs")
    docs_dir.mkdir(exist_ok=True)
    
    # Services to document
    services: List[Dict[str, Union[str, int]]] = [
        {
            "name": "AI Refinement Service",
            "module": "services.ai_refinement.app",
            "schema_file": "ai_refinement_openapi.json",
            "port": 8001
        },
        {
            "name": "TTS Service", 
            "module": "services.tts_service.app",
            "schema_file": "tts_service_openapi.json",
            "port": 8002
        }
    ]
    
    # Generate documentation for each service
    for service in services:
        print(f"\n📝 Processing {service['name']}...")
        
        # Extract OpenAPI schema
        schema = extract_openapi_schema(str(service["module"]))
        if not schema:
            continue
        
        # Update server URLs
        schema["servers"] = [{"url": f"http://localhost:{service['port']}"}]
        
        # Save schema
        schema_path = docs_dir / str(service["schema_file"])
        save_schema(schema, str(schema_path))
        
        # Generate ReDoc HTML
        service_name = str(service["name"]).lower().replace(' ', '_')
        redoc_path = docs_dir / f"{service_name}_redoc.html"
        generate_redoc_html(str(schema_path), str(redoc_path), str(service["name"]))
        
        # Generate Swagger UI HTML
        swagger_path = docs_dir / f"{service_name}_swagger.html"
        generate_swagger_ui_html(str(schema_path), str(swagger_path), str(service["name"]))
        
        # Generate Postman collection
        postman_path = docs_dir / f"{service_name}_postman.json"
        generate_postman_collection(schema, str(postman_path))
    
    # Generate combined documentation index
    generate_index_html(docs_dir)
    
    print(f"\n✅ API documentation generated successfully!")
    print(f"📁 Documentation available in: {docs_dir.absolute()}")
    print("\n📖 Available documentation formats:")
    print("   • Interactive ReDoc: *_redoc.html")
    print("   • Swagger UI: *_swagger.html") 
    print("   • OpenAPI Schema: *_openapi.json")
    print("   • Postman Collection: *_postman.json")
    print("   • Documentation Index: index.html")


if __name__ == "__main__":
    main()
