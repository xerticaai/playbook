import os
from typing import Optional, Dict, Any


def _build_model_candidates(model_name: str) -> list[str]:
    configured_fallbacks = [
        item.strip()
        for item in str(os.getenv("GEMINI_MODEL_FALLBACKS", "")).split(",")
        if item.strip()
    ]

    defaults = [
        model_name,
        "gemini-2.5-pro",
        "gemini-3.0-pro",
        "gemini-3.0-flash",
        "gemini-2.5-flash",
        "gemini-2.5-pro-latest",
        "gemini-2.5-flash-latest",
    ]

    candidates: list[str] = []
    for candidate in defaults + configured_fallbacks:
        normalized = str(candidate or "").strip()
        lowered = normalized.lower()
        if not normalized:
            continue
        if "1.5" in lowered or "2.0" in lowered:
            continue
        if normalized not in candidates:
            candidates.append(normalized)

    if not candidates:
        candidates = [
            "gemini-2.5-pro",
            "gemini-3.0-pro",
            "gemini-3.0-flash",
            "gemini-2.5-flash",
        ]
    return candidates


def generate_gemini_text_with_status(
    prompt: str,
    *,
    model_name: str,
    api_key: Optional[str],
    project_id: Optional[str],
    location: Optional[str],
) -> Dict[str, Any]:
    use_vertex = str(os.getenv("USE_VERTEX_AI", "true")).strip().lower() in {"1", "true", "yes", "on"}

    model_candidates = _build_model_candidates(
        os.getenv("VERTEX_GEMINI_MODEL") or model_name or "gemini-2.5-pro"
    )

    if use_vertex and project_id:
        vertex_location = location or os.getenv("VERTEX_AI_LOCATION", "us-central1")
        vertex_errors = []
        for vertex_model in model_candidates:
            try:
                import vertexai
                from vertexai.generative_models import GenerativeModel

                vertexai.init(project=project_id, location=vertex_location)
                model = GenerativeModel(vertex_model)
                response = model.generate_content(prompt)
                if response and getattr(response, "text", None):
                    return {
                        "ok": True,
                        "text": str(response.text),
                        "provider": "vertex_ai",
                        "model": vertex_model,
                        "error": "",
                    }
                vertex_errors.append(f"{vertex_model}: empty response")
            except Exception as exc:
                vertex_errors.append(f"{vertex_model}: {str(exc)}")

        vertex_error = "Vertex AI error: " + " | ".join(vertex_errors[-2:])
    else:
        vertex_error = "Vertex AI disabled or missing project_id"

    if api_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            api_errors = []
            for api_model in model_candidates:
                try:
                    model = genai.GenerativeModel(api_model)
                    response = model.generate_content(prompt)
                    if response and getattr(response, "text", None):
                        return {
                            "ok": True,
                            "text": str(response.text),
                            "provider": "gemini_api_key",
                            "model": api_model,
                            "error": "",
                        }
                    api_errors.append(f"{api_model}: empty response")
                except Exception as exc:
                    api_errors.append(f"{api_model}: {str(exc)}")
            return {
                "ok": False,
                "text": "",
                "provider": "gemini_api_key",
                "model": model_name,
                "error": "Gemini API error: " + " | ".join(api_errors[-2:]),
            }
        except Exception as exc:
            return {
                "ok": False,
                "text": "",
                "provider": "gemini_api_key",
                "model": model_name,
                "error": f"Gemini API setup error: {str(exc)}",
            }

    return {
        "ok": False,
        "text": "",
        "provider": "none",
        "model": model_name,
        "error": vertex_error or "No LLM credentials configured",
    }


def generate_gemini_text(
    prompt: str,
    *,
    model_name: str,
    api_key: Optional[str],
    project_id: Optional[str],
    location: Optional[str],
) -> str:
    result = generate_gemini_text_with_status(
        prompt,
        model_name=model_name,
        api_key=api_key,
        project_id=project_id,
        location=location,
    )
    return str(result.get("text") or "")
