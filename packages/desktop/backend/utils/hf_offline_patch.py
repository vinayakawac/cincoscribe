"""
HuggingFace offline compatibility patch.
"""
def patch_transformers_mistral_regex():
    pass

try:
    patch_transformers_mistral_regex()
except Exception:
    pass
