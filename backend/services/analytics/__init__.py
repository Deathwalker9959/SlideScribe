"""
Analytics Service - Telemetry collection for thesis research.

This service provides endpoints for:
- Recording job performance metrics
- Capturing user feedback and SUS scores
- Exporting telemetry data for analysis
- Generating summary statistics

Usage:
    from services.analytics import app as analytics_app
    # Mount analytics routes in main application
"""

from .app import app
from .service import AnalyticsService

__all__ = ["app", "AnalyticsService"]