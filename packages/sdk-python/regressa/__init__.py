"""Regressa SDK for Python.

from regressa import Regressa, wrap_openai, wrap_anthropic

regressa = Regressa(api_key="rgsa_live_...")
client = wrap_openai(OpenAI(), regressa)
"""

from .anthropic import wrap_anthropic
from .client import KEY_HEADER, SDK_NAME, SDK_VERSION, Regressa
from .openai import wrap_openai
from .template import infer_template

__all__ = ["Regressa", "wrap_openai", "wrap_anthropic", "infer_template", "SDK_NAME", "SDK_VERSION", "KEY_HEADER"]
