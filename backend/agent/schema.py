from typing import Literal

from pydantic import BaseModel, Field


class MusicWindowSummary(BaseModel):
    windowSeconds: int = Field(ge=1, le=300)
    bpm: float = Field(ge=0)
    energy: float = Field(ge=0, le=1)
    bassEnergy: float = Field(ge=0, le=1)
    midEnergy: float = Field(ge=0, le=1)
    highEnergy: float = Field(ge=0, le=1)
    beatDensity: float = Field(ge=0, le=1)
    moodHint: str = Field(min_length=1, max_length=64)


class VisualModuleEnvelope(BaseModel):
    type: Literal["visual_module"]
    apiVersion: Literal["1"]
    moduleId: str = Field(min_length=1, max_length=128)
    targetLayer: Literal["foreground"]
    duration: int = Field(ge=1, le=300)
    transitionSeconds: int = Field(ge=0, le=30)
    code: str = Field(min_length=1, max_length=12000)
