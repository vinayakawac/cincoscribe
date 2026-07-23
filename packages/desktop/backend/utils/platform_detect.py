import platform

def get_backend_type() -> str:
    """Detect platform backend type ('mlx' on Apple Silicon macOS, 'pytorch' elsewhere)."""
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return "mlx"
    return "pytorch"
