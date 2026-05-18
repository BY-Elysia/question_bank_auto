import argparse
import os
from pathlib import Path

from huggingface_hub import snapshot_download


DEFAULT_REPO_ID = "openai/clip-vit-base-patch32"
DEFAULT_MODEL_DIR = r"D:\model\clip-vit-base-patch32"
DEFAULT_CACHE_DIR = r"D:\model\hf_cache"
DEFAULT_PATTERNS = [
    "config.json",
    "preprocessor_config.json",
    "tokenizer_config.json",
    "tokenizer.json",
    "special_tokens_map.json",
    "vocab.json",
    "merges.txt",
    "pytorch_model.bin",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download the minimum CLIP files needed for the local training workflow."
    )
    parser.add_argument("--repo-id", default=DEFAULT_REPO_ID)
    parser.add_argument("--model-dir", default=DEFAULT_MODEL_DIR)
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    parser.add_argument(
        "--token",
        default=os.environ.get("HF_TOKEN", ""),
        help="Hugging Face token. If omitted, HF_TOKEN from the environment is used.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    token = str(args.token or "").strip()
    if not token:
        raise SystemExit(
            "Missing Hugging Face token. Pass --token or set HF_TOKEN in the current shell."
        )

    model_dir = Path(args.model_dir)
    cache_dir = Path(args.cache_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"repo_id: {args.repo_id}", flush=True)
    print(f"model_dir: {model_dir}", flush=True)
    print(f"cache_dir: {cache_dir}", flush=True)
    print("download started...", flush=True)

    snapshot_download(
        repo_id=args.repo_id,
        local_dir=str(model_dir),
        cache_dir=str(cache_dir),
        token=token,
        allow_patterns=DEFAULT_PATTERNS,
    )

    print("download finished", flush=True)
    print(str(model_dir), flush=True)


if __name__ == "__main__":
    main()
