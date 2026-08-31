from __future__ import annotations

from .contracts import ReconstructionProvider
from .providers.heuristic_photo import HeuristicPhotoProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, ReconstructionProvider] = {}

    def register(self, provider: ReconstructionProvider) -> None:
        self._providers[provider.name] = provider

    def get(self, name: str, source_kind: str) -> ReconstructionProvider:
        provider = self._providers.get(name)
        if provider is None:
            available = ", ".join(sorted(self._providers))
            raise ValueError(f"unknown reconstruction provider; available: {available}")
        if source_kind not in provider.supported_source_kinds:
            raise ValueError(
                f"provider {name!r} does not support source kind {source_kind!r}"
            )
        return provider

    def capabilities(self) -> list[dict]:
        return [
            {
                "name": provider.name,
                "source_kinds": sorted(provider.supported_source_kinds),
                "local": True,
                "approximate": True,
            }
            for provider in self._providers.values()
        ]


provider_registry = ProviderRegistry()
provider_registry.register(HeuristicPhotoProvider())
