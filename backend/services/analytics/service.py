"""Analytics Service - Track job metrics and user feedback for thesis research."""

import csv
import json
from datetime import datetime, timedelta
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from shared.config import config
from shared.models import (
    JobMetricsRequest,
    JobMetricsResponse,
    UserFeedbackRequest,
    UserFeedbackResponse,
    TelemetryExportRequest,
    TelemetryExportResponse
)
from shared.utils import setup_logging
from models.database.analytics import JobMetrics, UserFeedback, APIUsage
from database import get_db

logger = setup_logging("analytics-service")


class AnalyticsService:
    """Service for collecting and managing analytics data for thesis research."""

    def __init__(self):
        self.export_ttl_hours = int(config.get("analytics_export_ttl_hours", "24"))
        self.export_dir = Path(config.get("analytics_export_dir", "./analytics_exports"))
        self.export_dir.mkdir(parents=True, exist_ok=True)

    async def record_job_metrics(self, request: JobMetricsRequest) -> JobMetricsResponse:
        """Record performance and user behavior metrics for a completed job."""
        try:
            async with get_db() as db:
                # Check if metrics already exist for this job
                existing = await db.execute(
                    select(JobMetrics).where(JobMetrics.job_id == request.job_id)
                )
                existing_metrics = existing.scalar_one_or_none()

                if existing_metrics:
                    # Update existing metrics
                    metrics = existing_metrics
                    metrics.total_duration_ms = request.metadata.get("total_duration_ms")
                    metrics.synthesis_provider = request.synthesis_provider
                    metrics.synthesis_duration_ms = request.synthesis_duration_ms
                    metrics.synthesis_degraded = request.synthesis_degraded
                    metrics.slide_processing_p50 = request.slide_processing_p50
                    metrics.slide_processing_p95 = request.slide_processing_p95
                    metrics.job_metadata.update(request.metadata)
                    metrics.updated_at = datetime.utcnow()
                else:
                    # Create new metrics record
                    metrics = JobMetrics(
                        job_id=request.job_id,
                        presentation_id=request.presentation_id,
                        started_at=datetime.utcnow(),  # Default to now if not provided
                        total_slides=request.total_slides,
                        total_characters=request.total_characters,
                        refined_characters=request.refined_characters,
                        edit_count=request.edit_count,
                        synthesis_provider=request.synthesis_provider,
                        synthesis_duration_ms=request.synthesis_duration_ms,
                        synthesis_degraded=request.synthesis_degraded,
                        refinement_enabled=request.refinement_enabled,
                        refinement_duration_ms=request.refinement_duration_ms,
                        refinement_iterations=request.refinement_iterations,
                        slide_processing_p50=request.slide_processing_p50,
                        slide_processing_p95=request.slide_processing_p95,
                        preview_count=request.preview_count,
                        voice_changes=request.voice_changes,
                        language_changes=request.language_changes,
                        export_formats=request.export_formats,
                        export_count=request.export_count,
                        job_metadata=request.metadata
                    )
                    db.add(metrics)

                await db.commit()
                await db.refresh(metrics)

                logger.info(f"Recorded metrics for job {request.job_id}")
                return JobMetricsResponse(
                    job_id=request.job_id,
                    recorded_at=metrics.created_at,
                    total_duration_ms=metrics.total_duration_ms
                )

        except Exception as e:
            logger.error(f"Failed to record job metrics: {e!s}")
            raise

    async def record_user_feedback(self, request: UserFeedbackRequest) -> UserFeedbackResponse:
        """Record user feedback and SUS (System Usability Scale) scores."""
        try:
            # Calculate SUS score using standard formula
            sus_score = self._calculate_sus_score(request)

            async with get_db() as db:
                feedback = UserFeedback(
                    job_id=request.job_id,
                    sus_q1=request.sus_q1,
                    sus_q2=request.sus_q2,
                    sus_q3=request.sus_q3,
                    sus_q4=request.sus_q4,
                    sus_q5=request.sus_q5,
                    sus_q6=request.sus_q6,
                    sus_q7=request.sus_q7,
                    sus_q8=request.sus_q8,
                    sus_q9=request.sus_q9,
                    sus_q10=request.sus_q10,
                    sus_score=sus_score,
                    feedback_text=request.feedback_text,
                    rating=request.rating,
                    issues=request.issues,
                    suggestions=request.suggestions,
                    context=request.context
                )
                db.add(feedback)
                await db.commit()
                await db.refresh(feedback)

                logger.info(f"Recorded user feedback with SUS score {sus_score}")
                return UserFeedbackResponse(
                    feedback_id=feedback.id,
                    sus_score=sus_score,
                    recorded_at=feedback.created_at
                )

        except Exception as e:
            logger.error(f"Failed to record user feedback: {e!s}")
            raise

    async def export_telemetry_data(self, request: TelemetryExportRequest) -> TelemetryExportResponse:
        """Export telemetry data in JSON or CSV format for analysis."""
        try:
            async with get_db() as db:
                # Query job metrics
                job_metrics_query = select(JobMetrics)
                if request.start_date:
                    job_metrics_query = job_metrics_query.where(JobMetrics.created_at >= request.start_date)
                if request.end_date:
                    job_metrics_query = job_metrics_query.where(JobMetrics.created_at <= request.end_date)
                if request.job_ids:
                    job_metrics_query = job_metrics_query.where(JobMetrics.job_id.in_(request.job_ids))

                job_metrics_result = await db.execute(job_metrics_query)
                job_metrics = job_metrics_result.scalars().all()

                # Query user feedback if requested
                user_feedback = []
                if request.include_user_feedback:
                    feedback_query = select(UserFeedback)
                    if request.start_date:
                        feedback_query = feedback_query.where(UserFeedback.created_at >= request.start_date)
                    if request.end_date:
                        feedback_query = feedback_query.where(UserFeedback.created_at <= request.end_date)
                    if request.job_ids:
                        feedback_query = feedback_query.where(UserFeedback.job_id.in_(request.job_ids))

                    feedback_result = await db.execute(feedback_query)
                    user_feedback = feedback_result.scalars().all()

                # Query API usage if requested
                api_usage = []
                if request.include_api_usage:
                    usage_query = select(APIUsage)
                    if request.start_date:
                        usage_query = usage_query.where(APIUsage.created_at >= request.start_date)
                    if request.end_date:
                        usage_query = usage_query.where(APIUsage.created_at <= request.end_date)

                    usage_result = await db.execute(usage_query)
                    api_usage = usage_result.scalars().all()

                # Create export file
                export_filename = f"telemetry_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{request.format}"
                export_path = self.export_dir / export_filename

                if request.format == "json":
                    await self._export_json(export_path, job_metrics, user_feedback, api_usage)
                else:  # CSV
                    await self._export_csv(export_path, job_metrics, user_feedback, api_usage)

                # Calculate expiration time
                expires_at = datetime.utcnow() + timedelta(hours=self.export_ttl_hours)

                record_count = len(job_metrics) + len(user_feedback) + len(api_usage)
                file_size = export_path.stat().st_size

                logger.info(f"Created telemetry export: {export_filename} ({record_count} records)")
                return TelemetryExportResponse(
                    export_url=f"/analytics/exports/{export_filename}",
                    file_size=file_size,
                    record_count=record_count,
                    export_format=request.format,
                    created_at=datetime.utcnow(),
                    expires_at=expires_at
                )

        except Exception as e:
            logger.error(f"Failed to export telemetry data: {e!s}")
            raise

    async def _export_json(self, export_path: Path, job_metrics: List[JobMetrics],
                          user_feedback: List[UserFeedback], api_usage: List[APIUsage]) -> None:
        """Export data in JSON format."""
        data = {
            "export_info": {
                "created_at": datetime.utcnow().isoformat(),
                "job_metrics_count": len(job_metrics),
                "user_feedback_count": len(user_feedback),
                "api_usage_count": len(api_usage)
            },
            "job_metrics": [
                {
                    "job_id": m.job_id,
                    "presentation_id": m.presentation_id,
                    "started_at": m.started_at.isoformat() if m.started_at else None,
                    "completed_at": m.completed_at.isoformat() if m.completed_at else None,
                    "total_duration_ms": m.total_duration_ms,
                    "total_slides": m.total_slides,
                    "total_characters": m.total_characters,
                    "refined_characters": m.refined_characters,
                    "edit_count": m.edit_count,
                    "synthesis_provider": m.synthesis_provider,
                    "synthesis_duration_ms": m.synthesis_duration_ms,
                    "synthesis_degraded": m.synthesis_degraded,
                    "refinement_enabled": m.refinement_enabled,
                    "refinement_duration_ms": m.refinement_duration_ms,
                    "refinement_iterations": m.refinement_iterations,
                    "slide_processing_p50": m.slide_processing_p50,
                    "slide_processing_p95": m.slide_processing_p95,
                    "preview_count": m.preview_count,
                    "voice_changes": m.voice_changes,
                    "language_changes": m.language_changes,
                    "export_formats": m.export_formats,
                    "export_count": m.export_count,
                    "job_metadata": m.job_metadata,
                    "created_at": m.created_at.isoformat(),
                    "updated_at": m.updated_at.isoformat()
                }
                for m in job_metrics
            ],
            "user_feedback": [
                {
                    "feedback_id": f.id,
                    "job_id": f.job_id,
                    "sus_scores": {
                        "q1": f.sus_q1, "q2": f.sus_q2, "q3": f.sus_q3, "q4": f.sus_q4,
                        "q5": f.sus_q5, "q6": f.sus_q6, "q7": f.sus_q7, "q8": f.sus_q8,
                        "q9": f.sus_q9, "q10": f.sus_q10
                    },
                    "sus_score": f.sus_score,
                    "feedback_text": f.feedback_text,
                    "rating": f.rating,
                    "issues": f.issues,
                    "suggestions": f.suggestions,
                    "context": f.context,
                    "created_at": f.created_at.isoformat()
                }
                for f in user_feedback
            ],
            "api_usage": [
                {
                    "endpoint": u.endpoint,
                    "method": u.method,
                    "status_code": u.status_code,
                    "response_time_ms": u.response_time,
                    "request_size": u.request_size,
                    "response_size": u.response_size,
                    "ip_address": u.ip_address,
                    "created_at": u.created_at.isoformat()
                }
                for u in api_usage
            ]
        }

        with open(export_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, default=str)

    async def _export_csv(self, export_path: Path, job_metrics: List[JobMetrics],
                        user_feedback: List[UserFeedback], api_usage: List[APIUsage]) -> None:
        """Export data in CSV format (separate sheets for each data type)."""
        # For simplicity, we'll create a CSV for job metrics and append other data
        with open(export_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)

            # Write header
            writer.writerow([
                "job_id", "presentation_id", "started_at", "completed_at", "total_duration_ms",
                "total_slides", "total_characters", "refined_characters", "edit_count",
                "synthesis_provider", "synthesis_duration_ms", "synthesis_degraded",
                "refinement_enabled", "refinement_duration_ms", "refinement_iterations",
                "slide_processing_p50", "slide_processing_p95", "preview_count",
                "voice_changes", "language_changes", "export_formats", "export_count",
                "created_at"
            ])

            # Write job metrics
            for m in job_metrics:
                writer.writerow([
                    m.job_id, m.presentation_id,
                    m.started_at.isoformat() if m.started_at else "",
                    m.completed_at.isoformat() if m.completed_at else "",
                    m.total_duration_ms, m.total_slides, m.total_characters,
                    m.refined_characters, m.edit_count, m.synthesis_provider,
                    m.synthesis_duration_ms, m.synthesis_degraded, m.refinement_enabled,
                    m.refinement_duration_ms, m.refinement_iterations,
                    m.slide_processing_p50, m.slide_processing_p95, m.preview_count,
                    m.voice_changes, m.language_changes,
                    json.dumps(m.export_formats) if m.export_formats else "",
                    m.export_count, m.created_at.isoformat()
                ])

            # Add separator and user feedback
            writer.writerow([])  # Empty row
            writer.writerow([
                "feedback_id", "job_id", "sus_score", "feedback_text", "rating",
                "issues", "suggestions", "created_at"
            ])

            for f in user_feedback:
                writer.writerow([
                    f.id, f.job_id, f.sus_score, f.feedback_text, f.rating,
                    json.dumps(f.issues) if f.issues else "",
                    json.dumps(f.suggestions) if f.suggestions else "",
                    f.created_at.isoformat()
                ])

    @staticmethod
    def _calculate_sus_score(request: UserFeedbackRequest) -> Optional[float]:
        """Calculate SUS score from questionnaire responses.

        SUS formula: For odd-numbered questions (1,3,5,7,9), score = response - 1
        For even-numbered questions (2,4,6,8,10), score = 5 - response
        Total score = sum(scores) * 2.5
        """
        responses = [
            request.sus_q1, request.sus_q2, request.sus_q3, request.sus_q4, request.sus_q5,
            request.sus_q6, request.sus_q7, request.sus_q8, request.sus_q9, request.sus_q10
        ]

        # Check if all responses are provided
        if any(r is None for r in responses):
            return None

        scores = []
        for i, response in enumerate(responses):
            question_num = i + 1
            if question_num % 2 == 1:  # Odd question
                scores.append(response - 1)
            else:  # Even question
                scores.append(5 - response)

        sus_score = sum(scores) * 2.5
        return sus_score

    async def get_job_summary_stats(self, start_date: Optional[datetime] = None,
                                   end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get summary statistics for thesis analysis."""
        try:
            async with get_db() as db:
                query = select(JobMetrics)
                if start_date:
                    query = query.where(JobMetrics.created_at >= start_date)
                if end_date:
                    query = query.where(JobMetrics.created_at <= end_date)

                result = await db.execute(query)
                metrics = result.scalars().all()

                if not metrics:
                    return {"message": "No data available for the specified period"}

                # Calculate summary statistics
                total_jobs = len(metrics)
                avg_slides = sum(m.total_slides for m in metrics) / total_jobs
                avg_chars = sum(m.total_characters for m in metrics) / total_jobs
                degraded_count = sum(1 for m in metrics if m.synthesis_degraded)
                degraded_percentage = (degraded_count / total_jobs) * 100

                # Provider distribution
                providers = {}
                for m in metrics:
                    provider = m.synthesis_provider or "unknown"
                    providers[provider] = providers.get(provider, 0) + 1

                # Performance percentiles
                durations = [m.total_duration_ms for m in metrics if m.total_duration_ms]
                durations.sort()
                p50_idx = int(len(durations) * 0.5)
                p95_idx = int(len(durations) * 0.95)

                summary = {
                    "period": {
                        "start_date": start_date.isoformat() if start_date else None,
                        "end_date": end_date.isoformat() if end_date else None
                    },
                    "job_stats": {
                        "total_jobs": total_jobs,
                        "avg_slides_per_job": round(avg_slides, 1),
                        "avg_characters_per_job": round(avg_chars, 1),
                        "degraded_mode_percentage": round(degraded_percentage, 2)
                    },
                    "provider_distribution": providers,
                    "performance": {
                        "duration_p50_ms": durations[p50_idx] if durations else None,
                        "duration_p95_ms": durations[p95_idx] if durations else None,
                        "avg_duration_ms": sum(durations) / len(durations) if durations else None
                    }
                }

                return summary

        except Exception as e:
            logger.error(f"Failed to get summary stats: {e!s}")
            raise