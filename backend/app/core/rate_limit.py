"""Shared slowapi Limiter instance.

Lives here (not in main.py) so route modules can import and apply
@limiter.limit(...) without a circular import back into main.py.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
