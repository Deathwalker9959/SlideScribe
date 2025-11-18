"""
Database configuration and session management
Supports PostgreSQL for development, testing, and production environments
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError

from shared.utils import config, setup_logging

logger = setup_logging("database")

def build_database_url() -> str:
    """
    Build database URL from environment variables with fallback to DATABASE_URL
    Supports individual DB components for flexible configuration
    """
    # Priority 1: Use DATABASE_URL if provided
    database_url = config.get("database_url")
    if database_url:
        logger.info(f"Using DATABASE_URL from environment: {database_url}")
        # Convert postgres:// to postgresql:// for SQLAlchemy compatibility
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url

    # Priority 2: Build from individual components
    db_host = config.get("db_host", os.getenv("DB_HOST", "localhost"))
    db_port = config.get("db_port", os.getenv("DB_PORT", "5432"))
    db_user = config.get("db_user", os.getenv("DB_USER", "postgres"))
    db_password = config.get("db_password", os.getenv("DB_PASSWORD", "postgres"))
    db_name = config.get("db_name", os.getenv("DB_NAME", "pptx_tts"))
    db_sslmode = config.get("db_sslmode", os.getenv("DB_SSLMODE", "prefer"))

    # Build PostgreSQL URL
    database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    if db_sslmode:
        database_url += f"?sslmode={db_sslmode}"

    logger.info(f"Built database URL from components: postgresql://{db_user}:***@{db_host}:{db_port}/{db_name}")
    return database_url

def create_database_engine():
    """Create SQLAlchemy engine with appropriate configuration"""
    database_url = build_database_url()

    try:
        if database_url.startswith("sqlite"):
            # SQLite for local development only
            engine = create_engine(database_url, connect_args={"check_same_thread": False})
            logger.info("Using SQLite database engine")
        else:
            # PostgreSQL with optimized settings
            engine = create_engine(
                database_url,
                pool_pre_ping=True,  # Verify connections before use
                pool_recycle=3600,    # Recycle connections every hour
                pool_size=10,         # Connection pool size
                max_overflow=20,     # Additional connections when pool is full
                echo=False            # Set to True for SQL logging in development
            )
            logger.info("Using PostgreSQL database engine with connection pooling")

        # Test the connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection test successful")

        return engine
    except SQLAlchemyError as e:
        logger.error(f"Failed to create database engine: {e}")
        raise

# Create engine and session
engine = create_database_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency for FastAPI to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database():
    """Initialize database tables"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully")
    except SQLAlchemyError as e:
        logger.error(f"Failed to initialize database tables: {e}")
        raise
