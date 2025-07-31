from abc import ABC, abstractmethod
from typing import Any, Dict

class AIRefinementDriver(ABC):
    """Abstract base class for AI refinement drivers."""
    @abstractmethod
    async def refine(self, text: str, step_config: Dict[str, Any], **kwargs: Any) -> str:
        """Refine text using the given step configuration."""
        pass
