# SlideScribe Infrastructure Setup Script
# Run this script as Administrator in PowerShell

Write-Host "🚀 SlideScribe Infrastructure Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Check if Docker Desktop is running
Write-Host "📋 Checking Docker Desktop..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    docker info | Out-Null
    Write-Host "✅ Docker Desktop is running" -ForegroundColor Green
}
catch {
    Write-Host "❌ Docker Desktop is not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and run this script again." -ForegroundColor Red
    exit 1
}

# Navigate to backend directory
$BackendPath = "C:\Users\andreas\repos\pptx-tts\backend"
Set-Location $BackendPath
Write-Host "📁 Working directory: $BackendPath" -ForegroundColor Yellow

# Start PostgreSQL and Redis
Write-Host "🐘 Starting PostgreSQL and Redis..." -ForegroundColor Yellow
try {
    docker-compose up -d postgres redis
    Write-Host "✅ PostgreSQL and Redis started" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to start PostgreSQL and Redis" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service status
Write-Host "📊 Checking service status..." -ForegroundColor Yellow
$ServiceStatus = docker-compose ps postgres redis
Write-Host $ServiceStatus

# Check if services are running
if ($ServiceStatus -match "running") {
    Write-Host "✅ Services are running" -ForegroundColor Green
} else {
    Write-Host "❌ Services are not running properly" -ForegroundColor Red
    exit 1
}

# Test PostgreSQL connection
Write-Host "🔍 Testing PostgreSQL connection..." -ForegroundColor Yellow
try {
    $PostgresTest = docker exec pptx-tts-postgres-1 pg_isready -U postgres
    if ($PostgresTest -match "accepting connections") {
        Write-Host "✅ PostgreSQL is ready" -ForegroundColor Green
    } else {
        Write-Host "❌ PostgreSQL is not ready" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "❌ Cannot connect to PostgreSQL" -ForegroundColor Red
    exit 1
}

# Test Redis connection
Write-Host "🔍 Testing Redis connection..." -ForegroundColor Yellow
try {
    $RedisTest = docker exec pptx-tts-redis-1 redis-cli ping
    if ($RedisTest -match "PONG") {
        Write-Host "✅ Redis is ready" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis is not ready" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "❌ Cannot connect to Redis" -ForegroundColor Red
    exit 1
}

# Check if conda environment exists
Write-Host "🐍 Checking conda environment..." -ForegroundColor Yellow
try {
    $CondaEnv = conda env list | findstr slidescribe
    if ($CondaEnv) {
        Write-Host "✅ slidescribe conda environment found" -ForegroundColor Green
    } else {
        Write-Host "❌ slidescribe conda environment not found" -ForegroundColor Red
        Write-Host "Please run: conda env create -f environment.yml" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "❌ Cannot check conda environments" -ForegroundColor Red
    exit 1
}

# Run database migrations
Write-Host "🗄️ Running database migrations..." -ForegroundColor Yellow
try {
    conda run -n slidescribe alembic upgrade head
    Write-Host "✅ Database migrations completed" -ForegroundColor Green
}
catch {
    Write-Host "❌ Database migrations failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Create test user
Write-Host "👤 Creating test user..." -ForegroundColor Yellow
$CreateUserScript = @"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext
import sys
import os

# Add backend to path
sys.path.insert(0, os.getcwd())

try:
    from shared.models import User

    # Database connection
    DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/pptx_tts'
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    # Password hashing
    pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

    # Create test user
    test_user = User(
        username='devuser',
        email='dev@example.com',
        hashed_password=pwd_context.hash('devpass'),
        is_active=True
    )

    # Check if user already exists
    existing = db.query(User).filter(User.username == 'devuser').first()
    if not existing:
        db.add(test_user)
        db.commit()
        print('✅ Test user created: devuser/devpass')
    else:
        print('ℹ️  Test user already exists')

    db.close()

except ImportError as e:
    print(f'❌ Import error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'❌ Error creating user: {e}')
    sys.exit(1)
"@

try {
    conda run -n slidescribe python -c "$CreateUserScript"
    Write-Host "✅ Test user setup completed" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to create test user" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test backend connectivity
Write-Host "🔗 Testing backend connectivity..." -ForegroundColor Yellow
$ConnectivityTest = @"
import sys
import os

# Add backend to path
sys.path.insert(0, os.getcwd())

try:
    from sqlalchemy import create_engine
    import redis

    # Test PostgreSQL
    engine = create_engine('postgresql://postgres:postgres@localhost:5432/pptx_tts')
    with engine.connect() as conn:
        print('✅ PostgreSQL connection successful')

    # Test Redis
    r = redis.Redis(host='localhost', port=6379, db=0)
    r.ping()
    print('✅ Redis connection successful')

    print('✅ All infrastructure services are ready!')

except Exception as e:
    print(f'❌ Connectivity test failed: {e}')
    sys.exit(1)
"@

try {
    conda run -n slidescribe python -c "$ConnectivityTest"
    Write-Host "✅ Backend connectivity verified" -ForegroundColor Green
}
catch {
    Write-Host "❌ Backend connectivity test failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Final verification
Write-Host "🎉 Infrastructure setup completed!" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  • PostgreSQL: localhost:5432 (user: postgres, password: postgres)" -ForegroundColor White
Write-Host "  • Redis: localhost:6379" -ForegroundColor White
Write-Host "  • Test User: devuser/devpass" -ForegroundColor White
Write-Host "  • Backend URL: http://localhost:8000" -ForegroundColor White
Write-Host "  • API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "🚀 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start the backend: conda run -n slidescribe python app.py" -ForegroundColor White
Write-Host "  2. Test authentication: curl -X POST http://localhost:8000/token -d 'username=devuser&password=devpass'" -ForegroundColor White
Write-Host "  3. Open API docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "💡 To stop services: docker-compose down" -ForegroundColor Yellow
Write-Host "💡 To view logs: docker-compose logs -f" -ForegroundColor Yellow