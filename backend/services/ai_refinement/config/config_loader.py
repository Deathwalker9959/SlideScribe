"""
Configuration loader for AI refinement service.
Handles loading and validation of YAML configuration files.
"""

import yaml
import os
from typing import Dict, List, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class RefinementConfig:
    """Configuration manager for AI text refinement."""
    
    def __init__(self, config_path: Optional[str] = None):
        if config_path is None:
            config_path = os.path.join(os.path.dirname(__file__), "refinement_config.yaml")
        
        self.config_path = Path(config_path)
        self._config = self._load_config()
        
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file."""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as file:
                config = yaml.safe_load(file)
                logger.info(f"Loaded configuration from {self.config_path}")
                return config
        except FileNotFoundError:
            logger.error(f"Configuration file not found: {self.config_path}")
            raise
        except yaml.YAMLError as e:
            logger.error(f"Error parsing YAML configuration: {e}")
            raise
    
    def get_refinement_step(self, step_name: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific refinement step."""
        return self._config.get("refinement_steps", {}).get(step_name)
    
    def get_all_refinement_steps(self) -> Dict[str, Any]:
        """Get all refinement steps."""
        return self._config.get("refinement_steps", {})
    
    def get_enabled_steps(self) -> List[str]:
        """Get list of enabled refinement steps."""
        steps = self._config.get("refinement_steps", {})
        return [name for name, config in steps.items() if config.get("enabled", True)]
    
    def get_default_pipeline(self) -> List[str]:
        """Get the default refinement pipeline."""
        return self._config.get("default_pipeline", [])
    
    def get_pipeline_for_content_type(self, content_type: str) -> List[str]:
        """Get pipeline for specific content type."""
        pipelines = self._config.get("content_type_pipelines", {})
        return pipelines.get(content_type, self.get_default_pipeline())
    
    def get_ai_model_config(self, model_type: str = "primary") -> Dict[str, Any]:
        """Get AI model configuration."""
        models = self._config.get("ai_models", {})
        return models.get(model_type, models.get("primary", {}))
    
    def get_quality_metrics(self) -> Dict[str, float]:
        """Get quality metrics thresholds."""
        return self._config.get("quality_metrics", {})
    
    def validate_config(self) -> bool:
        """Validate the loaded configuration."""
        required_sections = ["refinement_steps", "default_pipeline", "ai_models"]
        
        for section in required_sections:
            if section not in self._config:
                logger.error(f"Missing required configuration section: {section}")
                return False
        
        # Validate refinement steps
        steps = self._config.get("refinement_steps", {})
        for step_name, step_config in steps.items():
            required_keys = ["name", "description", "system_prompt"]
            for key in required_keys:
                if key not in step_config:
                    logger.error(f"Missing required key '{key}' in step '{step_name}'")
                    return False
        
        # Validate default pipeline references valid steps
        default_pipeline = self._config.get("default_pipeline", [])
        for step in default_pipeline:
            if step not in steps:
                logger.error(f"Default pipeline references unknown step: {step}")
                return False
        
        logger.info("Configuration validation passed")
        return True
    
    def reload_config(self):
        """Reload configuration from file."""
        self._config = self._load_config()
        logger.info("Configuration reloaded")
    
    def get_system_prompt(self, step_name: str, **kwargs: Any) -> str:
        """Get system prompt for a refinement step with optional formatting."""
        step_config = self.get_refinement_step(step_name)
        if not step_config:
            raise ValueError(f"Unknown refinement step: {step_name}")
        
        prompt = step_config.get("system_prompt", "")
        
        # Format prompt with any provided variables
        if kwargs:
            try:
                prompt = prompt.format(**kwargs)
            except KeyError as e:
                logger.warning(f"Missing format variable in prompt for {step_name}: {e}")
        
        return prompt
    
    def get_step_parameters(self, step_name: str) -> Dict[str, Any]:
        """Get AI parameters for a specific step."""
        step_config = self.get_refinement_step(step_name)
        if not step_config:
            raise ValueError(f"Unknown refinement step: {step_name}")
        
        return {
            "temperature": step_config.get("temperature", 0.3),
            "max_tokens": step_config.get("max_tokens", 2000),
            "system_prompt": step_config.get("system_prompt", "")
        }

# Global configuration instance
config = RefinementConfig()
