from dataclasses import dataclass, field
from datetime import date
from typing import Dict, Optional
import numpy as np


@dataclass(frozen=True)
class Event:
    id: str
    date: date
    text: str
    outcomes: Dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class Neighbour:
    event: Event
    similarity: float


@dataclass(frozen=True)
class NewsItem:
    title: str
    url: str
    seen_date: date
    domain: str = ""
    language: str = ""
    country: str = ""
