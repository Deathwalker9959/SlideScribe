"""
Tests for Analytics Service
Comprehensive test coverage for telemetry collection and thesis research metrics
"""

import json
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from services.analytics.service import AnalyticsService
from services.analytics.app import app as analytics_app
from shared.models import (
    JobMetricsRequest,
    JobMetricsResponse,
    UserFeedbackRequest,
    UserFeedbackResponse,
    TelemetryExportRequest,
    TelemetryExportResponse
)
from shared.utils import setup_logging

# Disable logging for tests
setup_logging("test-analytics-service", log_level="CRITICAL")


@pytest.fixture
def analytics_service():
    """Create analytics service instance for testing."""
    return AnalyticsService()


@pytest.fixture
def analytics_client():
    """Create FastAPI test client for analytics service."""
    return TestClient(analytics_app)


class TestAnalyticsService:
    """Test analytics service functionality."""

    @pytest.mark.asyncio
    async def test_record_job_metrics_new_job(self, analytics_service):
        """Test recording metrics for a new job."""
        request = JobMetricsRequest(
            job_id="test-job-123",
            presentation_id="test-presentation-456",
            total_slides=10,
            total_characters=5000,
            refined_characters=4800,
            edit_count=3,
            synthesis_provider="azure",
            synthesis_duration_ms=1500.0,
            synthesis_degraded=False,
            refinement_enabled=True,
            refinement_duration_ms=800.0,
            refinement_iterations=2,
            slide_processing_p50=1200.0,
            slide_processing_p95=2500.0,
            preview_count=5,
            voice_changes=2,
            language_changes=1,
            export_formats=["mp3", "mp4"],
            export_count=2,
            metadata={"test": "data"}
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            # Mock database operations
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_session.execute.return_value = mock_result

            result = await analytics_service.record_job_metrics(request)

        assert result.job_id == "test-job-123"
        assert isinstance(result.recorded_at, datetime)
        assert result.message == "Metrics recorded successfully"

    @pytest.mark.asyncio
    async def test_record_job_metrics_update_existing(self, analytics_service):
        """Test updating metrics for an existing job."""
        request = JobMetricsRequest(
            job_id="existing-job-123",
            presentation_id="test-presentation-456",
            total_slides=15,
            total_characters=7500,
            synthesis_duration_ms=2000.0,
            synthesis_degraded=True,
            metadata={"updated": True}
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            # Mock existing job
            mock_existing = MagicMock()
            mock_existing.job_id = "existing-job-123"
            mock_session.execute.return_value = mock_existing

            result = await analytics_service.record_job_metrics(request)

        assert result.job_id == "existing-job-123"
        assert isinstance(result.recorded_at, datetime)

    @pytest.mark.asyncio
    async def test_record_user_feedback_complete_sus(self, analytics_service):
        """Test recording user feedback with complete SUS questionnaire."""
        request = UserFeedbackRequest(
            job_id="test-job-123",
            sus_q1=2,  # Complex
            sus_q2=4,  # Easy
            sus_q3=1,  # Need support
            sus_q4=4,  # Well integrated
            sus_q5=2,  # Consistent
            sus_q6=4,  # Learn quickly
            sus_q7=2,  # Not cumbersome
            sus_q8=4,  # Confident
            sus_q9=2,  # Don't need to learn
            sus_q10=1, # Complex
            feedback_text="Great tool for creating narrations!",
            rating=5,
            issues=["None"],
            suggestions=["Add more voice options"],
            context={"device": "desktop", "browser": "edge"}
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            result = await analytics_service.record_user_feedback(request)

        assert result.feedback_id > 0
        assert result.sus_score == 85.0  # SUS score calculation
        assert result.message == "Feedback recorded successfully"
        assert isinstance(result.recorded_at, datetime)

    @pytest.mark.asyncio
    async def test_record_user_feedback_partial_sus(self, analytics_service):
        """Test recording user feedback with partial SUS questionnaire."""
        request = UserFeedbackRequest(
            job_id="test-job-123",
            sus_q1=3,
            sus_q2=4,
            sus_q5=2,
            feedback_text="Partial feedback",
            rating=4
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            result = await analytics_service.record_user_feedback(request)

        assert result.feedback_id > 0
        assert result.sus_score is None  # Incomplete questionnaire
        assert result.message == "Feedback recorded successfully"

    @pytest.mark.asyncio
    async def test_export_telemetry_data_json_format(self, analytics_service):
        """Test exporting telemetry data in JSON format."""
        request = TelemetryExportRequest(
            format="json",
            start_date=datetime.now() - timedelta(days=7),
            end_date=datetime.now(),
            include_user_feedback=True,
            include_api_usage=True,
            job_ids=["test-job-1", "test-job-2"]
        )

        # Mock database queries
        mock_job_metrics = [
            MagicMock(
                job_id="test-job-1",
                total_slides=10,
                total_characters=5000,
                synthesis_provider="azure",
                synthesis_degraded=False,
                created_at=datetime.now()
            ),
            MagicMock(
                job_id="test-job-2",
                total_slides=15,
                total_characters=7500,
                synthesis_provider="openai",
                synthesis_degraded=True,
                created_at=datetime.now()
            )
        ]

        mock_user_feedback = [
            MagicMock(
                feedback_id=1,
                job_id="test-job-1",
                sus_score=85.0,
                created_at=datetime.now()
            )
        ]

        mock_api_usage = [
            MagicMock(
                endpoint="/api/v1/tts/synthesize",
                method="POST",
                status_code=200,
                response_time=1500.0,
                created_at=datetime.now()
            )
        ]

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            # Mock database queries
            mock_job_result = MagicMock()
            mock_job_result.scalars.return_value = mock_job_metrics
            mock_feedback_result = MagicMock()
            mock_feedback_result.scalars.return_value = mock_user_feedback
            mock_usage_result = MagicMock()
            mock_usage_result.scalars.return_value = mock_api_usage

            mock_session.execute.side_effect = [
                mock_job_result,  # Job metrics query
                mock_feedback_result,  # User feedback query
                mock_usage_result   # API usage query
            ]

            result = await analytics_service.export_telemetry_data(request)

        assert result.export_format == "json"
        assert result.record_count == 3  # 2 jobs + 1 feedback
        assert result.file_size > 0
        assert isinstance(result.created_at, datetime)
        assert isinstance(result.expires_at, datetime)
        assert result.export_url.startswith("/analytics/exports/")

    @pytest.mark.asyncio
    async def test_export_telemetry_data_csv_format(self, analytics_service):
        """Test exporting telemetry data in CSV format."""
        request = TelemetryExportRequest(
            format="csv",
            start_date=None,
            end_date=None,
            include_user_feedback=False,
            include_api_usage=False
        )

        # Mock minimal data
        mock_job_metrics = [
            MagicMock(
                job_id="test-job-1",
                total_slides=5,
                total_characters=2500,
                created_at=datetime.now()
            )
        ]

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_job_result = MagicMock()
            mock_job_result.scalars.return_value = mock_job_metrics
            mock_session.execute.return_value = mock_job_result

            result = await analytics_service.export_telemetry_data(request)

        assert result.export_format == "csv"
        assert result.record_count == 1

    @pytest.mark.asyncio
    async def test_get_summary_stats_no_data(self, analytics_service):
        """Test getting summary statistics when no data exists."""
        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_result = MagicMock()
            mock_result.scalars.return_value = []
            mock_session.execute.return_value = mock_result

            result = await analytics_service.get_job_summary_stats()

        assert result["message"] == "No data available for the specified period"

    @pytest.mark.asyncio
    async def test_get_summary_stats_with_data(self, analytics_service):
        """Test getting summary statistics with sample data."""
        mock_jobs = [
            MagicMock(
                total_slides=10,
                total_characters=5000,
                synthesis_provider="azure",
                synthesis_degraded=False,
                total_duration_ms=12000.0
            ),
            MagicMock(
                total_slides=15,
                total_characters=7500,
                synthesis_provider="openai",
                synthesis_degraded=True,
                total_duration_ms=18000.0
            ),
            MagicMock(
                total_slides=8,
                total_characters=4000,
                synthesis_provider="azure",
                synthesis_degraded=False,
                total_duration_ms=9500.0
            )
        ]

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_result = MagicMock()
            mock_result.scalars.return_value = mock_jobs
            mock_session.execute.return_value = mock_result

            result = await analytics_service.get_job_summary_stats()

        assert result["job_stats"]["total_jobs"] == 3
        assert result["job_stats"]["avg_slides_per_job"] == 11.0  # (10+15+8)/3
        assert result["job_stats"]["degraded_mode_percentage"] == 33.33  # 1/3 * 100
        assert "provider_distribution" in result
        assert "performance" in result
        assert result["performance"]["duration_p50_ms"] is not None

    def test_calculate_sus_score_perfect(self, analytics_service):
        """Test SUS score calculation with perfect scores."""
        request = UserFeedbackRequest(
            sus_q1=1, sus_q2=5, sus_q3=1, sus_q4=5, sus_q5=1,
            sus_q6=5, sus_q7=1, sus_q8=5, sus_q9=5, sus_q10=1
        )

        score = analytics_service._calculate_sus_score(request)
        assert score == 100.0

    def test_calculate_sus_score_terrible(self, analytics_service):
        """Test SUS score calculation with worst scores."""
        request = UserFeedbackRequest(
            sus_q1=5, sus_q2=1, sus_q3=5, sus_q4=1, sus_q5=5,
            sus_q6=1, sus_q7=5, sus_q8=1, sus_q9=1, sus_q10=5
        )

        score = analytics_service._calculate_sus_score(request)
        assert score == 0.0

    def test_calculate_sus_score_average(self, analytics_service):
        """Test SUS score calculation with average scores."""
        request = UserFeedbackRequest(
            sus_q1=3, sus_q2=3, sus_q3=3, sus_q4=3, sus_q5=3,
            sus_q6=3, sus_q7=3, sus_q8=3, sus_q9=3, sus_q10=3
        )

        score = analytics_service._calculate_sus_score(request)
        assert score == 50.0

    def test_calculate_sus_score_incomplete(self, analytics_service):
        """Test SUS score calculation with incomplete questionnaire."""
        request = UserFeedbackRequest(
            sus_q1=3, sus_q2=4  # Missing most questions
        )

        score = analytics_service._calculate_sus_score(request)
        assert score is None


class TestAnalyticsAPI:
    """Test analytics service API endpoints."""

    def test_health_check(self, analytics_client):
        """Test health check endpoint."""
        response = analytics_client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data
        assert "timestamp" in data

    def test_root_endpoint(self, analytics_client):
        """Test root endpoint."""
        response = analytics_client.get("/")
        assert response.status_code == 200

        data = response.json()
        assert "service" in data
        assert "version" in data
        assert "endpoints" in data

    def test_job_metrics_endpoint_auth_required(self, analytics_client):
        """Test that job metrics endpoint requires authentication."""
        response = analytics_client.post("/metrics/job", json={})
        assert response.status_code == 401
        assert "detail" in response.json()

    def test_user_feedback_endpoint_auth_required(self, analytics_client):
        """Test that user feedback endpoint requires authentication."""
        response = analytics_client.post("/feedback/user", json={})
        assert response.status_code == 401
        assert "detail" in response.json()

    def test_telemetry_export_endpoint_auth_required(self, analytics_client):
        """Test that telemetry export endpoint requires authentication."""
        response = analytics_client.post("/export/telemetry", json={})
        assert response.status_code == 401
        assert "detail" in response.json()


class TestAnalyticsIntegration:
    """Integration tests for analytics service."""

    @pytest.mark.asyncio
    async def test_complete_job_lifecycle_with_analytics(self, analytics_service):
        """Test complete job lifecycle with analytics tracking."""
        # 1. Start job recording
        create_request = JobMetricsRequest(
            job_id="lifecycle-test-123",
            presentation_id="test-presentation-456",
            total_slides=5,
            total_characters=2500,
            synthesis_provider="azure"
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_session.execute.return_value = MagicMock()  # No existing job

            create_result = await analytics_service.record_job_metrics(create_request)
            assert create_result.job_id == "lifecycle-test-123"

        # 2. Update progress
        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_job = MagicMock()
            mock_job.progress = MagicMock()
            mock_job.progress.progress = 0.3
            mock_session.execute.return_value = mock_job

            await analytics_service.record_job_metrics(create_request)

        # 3. Complete job
        complete_request = JobMetricsRequest(
            job_id="lifecycle-test-123",
            presentation_id="test-presentation-456",
            total_slides=5,
            total_characters=2500,
            synthesis_provider="azure",
            synthesis_duration_ms=1200.0,
            export_formats=["mp3"],
            export_count=1
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_completed_job = MagicMock()
            mock_completed_job.status = "completed"
            mock_session.execute.return_value = mock_completed_job

            complete_result = await analytics_service.record_job_metrics(complete_request)
            assert complete_result.job_id == "lifecycle-test-123"

        # 4. Add user feedback
        feedback_request = UserFeedbackRequest(
            job_id="lifecycle-test-123",
            sus_q1=4,
            sus_q2=4,
            feedback_text="Great experience!",
            rating=5
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            feedback_result = await analytics_service.record_user_feedback(feedback_request)
            assert feedback_result.feedback_id > 0
            assert feedback_result.sus_score == 60.0

    @pytest.mark.asyncio
    async def test_degraded_mode_tracking(self, analytics_service):
        """Test tracking of degraded mode usage."""
        degraded_request = JobMetricsRequest(
            job_id="degraded-test-123",
            synthesis_provider="azure",
            synthesis_degraded=True,
            synthesis_duration_ms=2500.0,  # Slower due to fallback
            metadata={"fallback_reason": "Azure timeout", "fallback_provider": "openai"}
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__a__enter__.return_value = mock_session

            mock_result = MagicMock()
            mock_session.execute.return_value = mock_result

            result = await analytics_service.record_job_metrics(degraded_request)

        assert result.job_id == "degraded-test-123"

    @pytest.mark.asyncio
    async def test_user_interaction_tracking(self, analytics_service):
        """Test tracking of user interactions."""
        interaction_request = JobMetricsRequest(
            job_id="interaction-test-123",
            edit_count=15,
            preview_count=8,
            voice_changes=3,
            language_changes=2,
            metadata={
                "user_interactions": [
                    {"action": "preview", "timestamp": "2024-01-01T10:00:00Z"},
                    {"action": "voice_change", "timestamp": "2024-01-01T10:05:00Z"},
                    {"action": "edit", "timestamp": "2024-01-01T10:10:00Z"}
                ]
            }
        )

        with patch('services.analytics.service.get_db') as mock_get_db:
            mock_db = AsyncMock()
            mock_session = AsyncMock()
            mock_db.return_value.__aenter__.return_value = mock_session

            mock_result = MagicMock()
            mock_session.execute.return_value = mock_result

            result = await analytics_service.record_job_metrics(interaction_request)

        assert result.job_id == "interaction-test-123"


if __name__ == "__main__":
    pytest.main([__file__], verbosity=2)