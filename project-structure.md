# Project Preparation Thesis Report  
**Development of an Intelligent PowerPoint Plugin for Narrated Presentations**

## Abstract

This project develops an AI-powered PowerPoint plugin to help educators and content creators generate, edit, and synthesize high-quality narration for presentations. Inspired by tools like Grammarly, the plugin automates narration creation, offers editing suggestions, and converts text to speech (TTS), focusing on English (with future Greek support). It aims to improve accessibility and teaching quality, especially for distance learning at Frederick University.

---

## 1. Introduction

### 1.1 Project Overview

The plugin assists educators in creating narrated presentations, similar to Grammarly but for PowerPoint. It generates, refines, and personalizes narration for each slide, supporting English and, later, Greek. The tool is tailored for Frederick University’s Innovation & Excellence in Teaching department.

### 1.2 Problem Definition

PowerPoint lacks integrated, intelligent narration tools. Educators must manually write scripts and record audio, which is time-consuming and inconsistent. There’s no built-in support for editable, high-quality TTS, making it hard to ensure narration matches the intended tone and message.

### 1.3 Motivation

The rise of distance learning increases demand for engaging, accessible digital content. Narrated presentations enhance comprehension and engagement, but many educators lack time or tools to produce quality narration. This plugin addresses these needs, simplifying narration creation and improving educational impact.

### 1.4 Objectives

- Seamless PowerPoint integration
- AI-generated draft narration per slide
- Advanced editing: grammar, terminology, tone
- High-quality, customizable TTS (English first)
- Real-time previews and customization (speed, pitch, voice)
- Subtitle generation, editing, and styling
- Export as video or enhanced PPTX with audio

### 1.5 Users & Impact

- **Lecturers/Instructors:** Main users for narrated materials
- **Frederick University staff:** Enhanced course delivery
- **Students:** Improved accessibility, especially for auditory/language needs

### 1.6 Report Structure

- **Abstract:** Project summary
- **Chapter 1:** Introduction, context, objectives
- **Chapter 2:** Background & related work
- **Chapter 3:** System specification
- **Chapter 4:** Implementation plan
- **Chapter 5:** Conclusions
- **References:** APA style

---

## 2. Background & Related Work

### 2.1 Background

#### Intelligent Writing Assistants & NLP

Tools like Grammarly provide real-time writing feedback. This project extends such AI support to spoken narration, using NLP for grammar correction, style transfer, and terminology extraction.

#### Narration in Education

Narrated slides boost engagement and learning but are labor-intensive. Automated narration with NLP and TTS reduces effort and improves consistency.

#### Text-to-Speech (TTS)

Modern TTS (Google, Azure, Amazon) offers realistic, customizable voices. Neural models (WaveNet, Tacotron, Transformers) enable natural-sounding narration.

#### Accessibility & Multilingual Support

Narration and subtitles improve accessibility for diverse learners. The plugin will support WCAG standards, voice speed control, high-contrast modes, transcripts, and screen reader compatibility.

#### Subtitle Synchronization

Automatic subtitle generation and editing (WebVTT/SRT) will be included, with advanced alignment algorithms for accurate timing and readability.

### 2.2 Related Work

Existing tools (Microsoft Copilot, Lumen5, Descript) focus on slide generation or video creation, not integrated narration editing within PowerPoint. This plugin fills that gap with AI narration, editing, TTS, and accessibility features.

---

## 3. Platform/System Specification

### 3.1 User Roles

- **Instructor:** Creates/edits narrated presentations
- **Reviewer/Editor:** Refines narration
- **Administrator:** Manages deployment/access

### 3.2 Functional Requirements

- Import PPTX slides
- AI narration generation/editing
- English (Greek planned), auto language detection
- TTS preview/customization
- Export with synchronized narration
- Subtitle support
- Save/reuse narrations

### 3.3 System Architecture

- **Frontend:** PowerPoint task pane (UI)
- **Backend:** Node.js/Python API for AI/TTS/subtitles
- **Storage:** NoSQL/JSON for drafts, settings, history

### 3.4 Technologies

- **Add-in:** JavaScript/Office.js
- **Backend:** Node.js/Python REST API
- **NLP:** OpenAI GPT, custom logic
- **TTS:** Azure/Google Cloud
- **UI:** HTML/CSS/React
- **Subtitles:** WebVTT/SRT
- **Export:** FFmpeg, PowerPoint APIs

### 3.5 Database

NoSQL (MongoDB, Firebase) for flexible, scalable storage of narration drafts, preferences, and export history.

### 3.6 Prototype UI

- Task pane with slide thumbnails, narration text, AI suggestions
- Language toggle
- TTS preview and settings
- Subtitle generation/editing
- Export options

### 3.7 Accessibility

- WCAG-compliant UI
- Voice speed control
- High-contrast/large text modes
- Transcripts
- Screen reader support

---

## 4. Implementation Plan

### 4.1 Phases

1. Core plugin & PPTX import
2. AI/NLP narration generation
3. TTS customization & synchronization
4. Subtitle module
5. Export & optimization
6. User testing & iteration

### 4.2 Gantt Chart

Visual timeline for phases, tasks, dependencies, and milestones.

### 4.3 Evaluation

- **Quantitative:** System Usability Scale (SUS), task metrics
- **Qualitative:** Interviews, focus groups, think-aloud protocols
- **Plan:** Pilot testing, iterative feedback, metric analysis

---

## 5. Conclusions

This project delivers an innovative, accessible PowerPoint plugin for narrated presentations, addressing a key gap in educational technology. By combining advanced NLP and TTS, it empowers educators, improves content quality, and supports inclusive learning. Future work will focus on Greek language support, natural voice synthesis, and performance optimization.

---

## References

See attached APA-style references for all sources and related work.
