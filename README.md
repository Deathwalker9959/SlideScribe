# PowerPoint AI Assistant Plugin

A PowerPoint plugin similar to Grammarly but designed for PowerPoint presentations, featuring AI-powered text refinement and Azure Text-to-Speech (TTS) capabilities.

## Features

- 🤖 **AI Text Refinement**: Intelligent grammar, style, and tone suggestions for presentation content
- 🔊 **Azure TTS Integration**: High-quality text-to-speech with customizable voices
- 📝 **Subtitle Generation**: Automatic subtitle creation and synchronization
- ♿ **Accessibility Features**: WCAG-compliant UI with screen reader support
- 🌐 **Multilingual Support**: English with planned Greek language support
- 📹 **Export Options**: Export as video or enhanced PPTX with embedded audio

## Architecture

### Backend Services (Python + FastAPI + Docker)
- **AI Text Refinement Service**: GPT-based text enhancement and grammar checking
- **Azure TTS Service**: Text-to-speech conversion with voice customization
- **Subtitle Service**: Automatic subtitle generation and synchronization
- **File Processing Service**: PowerPoint file handling and media export

### Frontend (PowerPoint Add-in)
- **Office Add-in**: JavaScript-based plugin integrated into PowerPoint
- **React UI**: Modern, accessible user interface within PowerPoint task pane
- **Real-time Preview**: Live TTS preview and text refinement suggestions

## Project Structure

```
pptx-tts/
├── backend/                    # Python FastAPI backend
│   ├── services/              # Microservices
│   │   ├── ai-refinement/     # AI text refinement service
│   │   ├── tts-service/       # Azure TTS service
│   │   ├── subtitle-service/  # Subtitle generation service
│   │   └── file-service/      # File processing service
│   ├── shared/                # Shared utilities and models
│   ├── docker-compose.yml     # Docker orchestration
│   └── requirements.txt       # Python dependencies
├── frontend/                  # PowerPoint Add-in
│   ├── src/                   # Source code
│   ├── manifest.xml           # Add-in manifest
│   ├── package.json           # Node.js dependencies
│   └── webpack.config.js      # Build configuration
├── docs/                      # Documentation
├── tests/                     # Test files
└── deployment/                # Deployment scripts
```

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- Docker & Docker Compose
- Office 365 or PowerPoint 2019+
- Azure Speech Services account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/pptx-tts.git
   cd pptx-tts
   ```

2. **Setup Backend Services**
   ```bash
   cd backend
   docker-compose up -d
   ```

3. **Setup PowerPoint Add-in**
   ```bash
   cd frontend
   npm install
   npm run build
   npm run dev-server
   ```

4. **Load Add-in in PowerPoint**
   - Open PowerPoint
   - Go to Insert > My Add-ins > Upload My Add-in
   - Select the `manifest.xml` file

### Development

- **Backend API Documentation**: `http://localhost:8000/docs`
- **Frontend Development Server**: `http://localhost:3000`
- **Hot Reload**: Both frontend and backend support hot reload during development

## Configuration

Create `.env` files in respective service directories:

```env
# Azure Configuration
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_region

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/pptx_tts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details
