"""Thin LLM adapters. Keys come from the environment (ANTHROPIC_API_KEY / OPENAI_API_KEY), never from files.

    NEWS_LLM_PROVIDER = anthropic | openai        (default anthropic)
    NEWS_LLM_MODEL    = model name                (default claude-haiku-5-5; required for openai)
Responses are cached on disk so a rerun costs nothing and the evaluated outputs stay fixed."""
import hashlib, json, os, threading, time
from concurrent.futures import Future
from pathlib import Path


class AnthropicLLM:
    def __init__(self, model, max_tokens=200):
        from anthropic import Anthropic
        self.client, self.model, self.max_tokens, self.name = Anthropic(), model, max_tokens, f"anthropic:{model}"

    def complete(self, system, user):
        r = self.client.messages.create(model=self.model, max_tokens=self.max_tokens, system=system,
                                        messages=[{"role": "user", "content": user}])
        return r.content[0].text


class OpenAILLM:
    def __init__(self, model, max_tokens=200):
        from openai import OpenAI
        self.client, self.model, self.max_tokens, self.name = OpenAI(), model, max_tokens, f"openai:{model}"

    def complete(self, system, user):
        r = self.client.chat.completions.create(model=self.model, max_tokens=self.max_tokens,
                                                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        return r.choices[0].message.content


class CachedLLM:
    """Wraps any adapter: JSONL cache keyed by (model, system, user), retries with backoff, thread-safe."""
    def __init__(self, llm, path, tries=4, base_delay=2.0, sleep=time.sleep):
        if tries < 1:
            raise ValueError("tries must be at least 1")
        self.llm, self.path, self.tries, self.base, self.sleep = llm, Path(path), tries, base_delay, sleep
        self.name, self.calls, self._lock, self._cache = llm.name, 0, threading.Lock(), {}
        self._inflight = {}
        if self.path.exists():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    r = json.loads(line); self._cache[r["k"]] = r["v"]

    def _key(self, system, user):
        return hashlib.sha256(f"{self.name}\n{system}\n{user}".encode()).hexdigest()

    def complete(self, system, user):
        k = self._key(system, user)
        with self._lock:
            if k in self._cache:
                return self._cache[k]
            pending = self._inflight.get(k)
            if pending is None:
                pending = Future()
                self._inflight[k] = pending
                owner = True
            else:
                owner = False
        if not owner:
            return pending.result()

        try:
            failed = False
            for attempt in range(self.tries):
                try:
                    out = self.llm.complete(system, user)
                    break
                except Exception:
                    if attempt == self.tries - 1:
                        out = json.dumps({
                            "category": "invalid",
                            "confidence": None,
                            "reason": f"LLM request failed after {self.tries} attempts",
                        })
                        failed = True
                        break
                    self.sleep(self.base * 2 ** attempt)
            if failed:
                pending.set_result(out)
                return out
            with self._lock:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with open(self.path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"k": k, "v": out}) + "\n")
                self._cache[k] = out
                self.calls += 1
            pending.set_result(out)
            return out
        except Exception as exc:
            pending.set_exception(exc)
            raise
        finally:
            with self._lock:
                if self._inflight.get(k) is pending:
                    del self._inflight[k]


def build_llm(cache_path=None):
    provider = os.environ.get("NEWS_LLM_PROVIDER", "anthropic").lower()
    if provider == "anthropic":
        llm = AnthropicLLM(os.environ.get("NEWS_LLM_MODEL", "claude-haiku-5-5"))
    elif provider == "openai":
        llm = OpenAILLM(os.environ["NEWS_LLM_MODEL"])
    else:
        raise ValueError(f"Unknown NEWS_LLM_PROVIDER {provider!r}")
    root = Path(__file__).resolve().parents[1] / "artifacts"
    return CachedLLM(llm, cache_path or root / f"llm_cache_{llm.name.replace(':', '_')}.jsonl")
