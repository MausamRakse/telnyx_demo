from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class VoiceSettings(BaseModel):
    voice: str = "Telnyx.KokoroTTS.af_heart"
    voice_speed: Optional[float] = 1.0
    background_audio: Optional[Dict[str, Any]] = None
    temperature: Optional[float] = None
    repetition_penalty: Optional[float] = None
    top_p: Optional[float] = None
    similarity_boost: Optional[float] = None
    style: Optional[float] = None
    use_speaker_boost: Optional[bool] = None
    language_boost: Optional[float] = None
    expressive_mode: Optional[bool] = None
    pronunciation_dict_id: Optional[str] = None

class TranscriptionSettings(BaseModel):
    model: str = "deepgram/flux"
    language: str = "en"
    api_key_ref: Optional[str] = None
    region: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None

class CreateAssistantRequest(BaseModel):
    name: str
    instructions: str
    model: Optional[str] = "moonshotai/Kimi-K2.6"
    description: Optional[str] = None
    greeting: Optional[str] = None
    tool_ids: Optional[List[str]] = None
    tools: Optional[List[Dict[str, Any]]] = None
    mcp_servers: Optional[List[Dict[str, Any]]] = None
    llm_api_key_ref: Optional[str] = None
    external_llm: Optional[Dict[str, Any]] = None
    fallback_config: Optional[Dict[str, Any]] = None
    voice_settings: Optional[VoiceSettings] = None
    transcription: Optional[TranscriptionSettings] = None
    dynamic_variables: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None

class UpdateAssistantRequest(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    greeting: Optional[str] = None
    tool_ids: Optional[List[str]] = None
    tools: Optional[List[Dict[str, Any]]] = None
    mcp_servers: Optional[List[Dict[str, Any]]] = None
    llm_api_key_ref: Optional[str] = None
    external_llm: Optional[Dict[str, Any]] = None
    fallback_config: Optional[Dict[str, Any]] = None
    voice_settings: Optional[VoiceSettings] = None
    transcription: Optional[TranscriptionSettings] = None
    dynamic_variables: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
