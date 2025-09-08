from django.http import JsonResponse, HttpResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
import os
import tempfile
from .audio_utils import transcribe_audio, text_to_speech
from .db_utils import register_database, test_connection, get_schema, run_sql
from .services import generate_sql
from .sql_utils import validate_sql

def connect_db(request):
    """Register DB connection dynamically"""
    params = {
        "NAME": request.GET.get("name"),
        "USER": request.GET.get("user"),
        "PASSWORD": request.GET.get("password"),
        "HOST": request.GET.get("host"),
        "PORT": request.GET.get("port"),
    }
    alias = request.GET.get("alias", "dynamic")
    register_database(alias, params)
    success = test_connection(alias)
    return JsonResponse({"connected": success, "alias": alias})

def query_db(request):
    """Run natural language query"""
    user_query = request.GET.get("query")
    alias = request.GET.get("alias", "dynamic")

    schema = get_schema(alias)
    sql = generate_sql(user_query, schema)
    # validate_sql(sql, schema)
    result = run_sql(sql, alias)

    return JsonResponse({"sql": sql, "result": result})

def schema_view(request):
    """Return schema for connected DB"""
    alias = request.GET.get("alias", "dynamic")
    schema = get_schema(alias)
    return JsonResponse({"schema": schema})


import subprocess
import tempfile
import os
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

# Helper: convert any audio to 16-bit PCM, mono, 16kHz WAV
def convert_to_wav_16k(input_path):
    output_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
    subprocess.run([
        "ffmpeg", "-y", "-i", input_path,
        "-ac", "1",        # mono
        "-ar", "16000",    # 16kHz sample rate
        "-sample_fmt", "s16",  # 16-bit PCM
        output_path
    ], check=True)
    return output_path

@csrf_exempt
def speech_to_text(request):
    if request.method == "POST" and request.FILES.get("audio"):
        audio_file = request.FILES["audio"]

        # Save upload to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            for chunk in audio_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            # Convert to safe format
            normalized_path = convert_to_wav_16k(tmp_path)

            # Transcribe
            text = transcribe_audio(normalized_path)

        finally:
            # Clean up both files
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            if "normalized_path" in locals() and os.path.exists(normalized_path):
                os.remove(normalized_path)

        return JsonResponse({"text": text})

    return JsonResponse({"error": "No audio file provided."}, status=400)


# --- Text-to-Speech Endpoint ---
@csrf_exempt
def text_to_speech_api(request):
    if request.method == "POST":
        text = request.POST.get("text")
        if not text:
            return JsonResponse({"error": "No text provided."}, status=400)
        output_path = text_to_speech(text)
        with open(output_path, "rb") as f:
            response = HttpResponse(f.read(), content_type="audio/wav")
            response["Content-Disposition"] = "attachment; filename=tts.wav"
        os.remove(output_path)
        return response
    return JsonResponse({"error": "POST request required."}, status=400)
