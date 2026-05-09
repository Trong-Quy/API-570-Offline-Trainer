# API 570 Piping Inspector Training System

A fully offline desktop app for studying and practicing the API 570 Piping Inspector certification exam. Built with Tauri + React + Rust.

---

## Table of Contents / Mục lục

- [English Guide](#english-guide)
- [Hướng dẫn Tiếng Việt](#hướng-dẫn-tiếng-việt)

---

# English Guide

## Features

| Module | Description |
|---|---|
| Dashboard | Overview of study progress and stats |
| Exam Mode | Timed practice exams with real exam simulation |
| Codebook PDF | Import and read API/ASME reference PDFs |
| Flashcards | Card-based review of key concepts |
| Calculations | Built-in piping inspection calculators |
| Simulator | Full exam simulation environment |
| Notes | Personal study notes per topic |
| AI Generator | AI-powered question generation |
| Analytics | Detailed performance analytics |
| Search | Full-text search across questions and notes |
| Bookmarks | Save and revisit important questions |
| Exam History | Review all past exam attempts |

## Supported Standards

- API 570, 571, 574, 577, 578
- ASME B31.3, Section V, Section IX, B16.5, PCC-2

## Requirements

- macOS (Apple Silicon or Intel)
- [Ollama](https://ollama.ai) — for offline AI assistant (optional)

## Installation & Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Run in development mode

```bash
npm run tauri dev
```

### 3. Build for production

```bash
npm run tauri build
```

## AI Assistant Setup (Offline)

The app includes a fully offline AI assistant powered by [Ollama](https://ollama.ai). No internet required.

### Step 1 — Install Ollama

Download from [https://ollama.ai](https://ollama.ai) or via Homebrew:

```bash
brew install ollama
```

### Step 2 — Pull a model

```bash
ollama pull qwen2.5:7b
```

### Step 3 — Start Ollama server

```bash
ollama serve
```

To auto-start on login:
```bash
brew services start ollama
```

### Step 4 — Open the app

The AI status indicator in the sidebar will turn green (online) automatically.

### Recommended Models

| Model | Size | Best for |
|---|---|---|
| `qwen2.5:7b` | 4.7 GB | Chat, Q&A, Vietnamese |
| `qwen2.5-coder:7b` | 4.7 GB | Code generation |
| `deepseek-coder:6.7b` | 3.8 GB | Code review |
| `deepseek-r1:7b` | 4.7 GB | Reasoning, math |
| `llava:13b` | 8.0 GB | Technical drawing analysis |
| `minicpm-v:8b` | 5.5 GB | PDF / image analysis |

### Storing Models on External Drive

To save Mac storage, set the `OLLAMA_MODELS` environment variable in `~/.zshrc`:

```bash
export OLLAMA_MODELS=/Volumes/YOUR_DRIVE/AI_STORAGE/ollama_models
```

Then start Ollama with:
```bash
OLLAMA_MODELS=/Volumes/YOUR_DRIVE/AI_STORAGE/ollama_models ollama serve
```

### Changing AI Model in Settings

Go to **Settings → AI Model** to switch between installed models. The default model is `qwen2.5:7b`.

## Importing PDF Codebooks

1. Click **Codebook PDF** in the sidebar
2. Click **Import PDF** (top right)
3. Select your legally obtained API or ASME PDF file
4. The app will index the document for search and reference

## Tech Stack

- [Tauri v2](https://tauri.app) — native desktop shell
- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org) — UI
- [Vite](https://vite.dev) — frontend build tool
- [SQLite](https://www.sqlite.org) via `rusqlite` — local database
- [Ollama](https://ollama.ai) — local AI inference

---

# Hướng dẫn Tiếng Việt

## Tính năng

| Màn hình | Mô tả |
|---|---|
| Dashboard | Tổng quan tiến độ học và thống kê |
| Exam Mode | Thi thử có tính giờ, mô phỏng đề thi thật |
| Codebook PDF | Import và đọc tài liệu PDF chuẩn API/ASME |
| Flashcards | Ôn tập các khái niệm quan trọng bằng thẻ |
| Calculations | Máy tính kiểm tra đường ống tích hợp sẵn |
| Simulator | Môi trường thi thử toàn phần |
| Notes | Ghi chú cá nhân theo từng chủ đề |
| AI Generator | Tạo câu hỏi bằng AI |
| Analytics | Phân tích hiệu suất học tập chi tiết |
| Search | Tìm kiếm toàn văn trong câu hỏi và ghi chú |
| Bookmarks | Lưu và xem lại câu hỏi quan trọng |
| Exam History | Xem lại tất cả lần thi đã làm |

## Tiêu chuẩn được hỗ trợ

- API 570, 571, 574, 577, 578
- ASME B31.3, Section V, Section IX, B16.5, PCC-2

## Yêu cầu hệ thống

- macOS (Apple Silicon hoặc Intel)
- [Ollama](https://ollama.ai) — để dùng AI trợ lý offline (không bắt buộc)

## Cài đặt và khởi chạy

### 1. Cài dependencies

```bash
npm install
```

### 2. Chạy ở chế độ phát triển

```bash
npm run tauri dev
```

### 3. Build bản phát hành

```bash
npm run tauri build
```

## Cài đặt AI Trợ lý (Offline)

App tích hợp AI trợ lý chạy hoàn toàn offline thông qua [Ollama](https://ollama.ai). Không cần internet.

### Bước 1 — Cài Ollama

Tải tại [https://ollama.ai](https://ollama.ai) hoặc qua Homebrew:

```bash
brew install ollama
```

### Bước 2 — Tải model AI

```bash
ollama pull qwen2.5:7b
```

### Bước 3 — Khởi động Ollama server

```bash
ollama serve
```

Để tự khởi động mỗi lần bật máy:
```bash
brew services start ollama
```

### Bước 4 — Mở app

Chỉ báo trạng thái AI ở thanh sidebar sẽ chuyển sang màu xanh (online) tự động.

### Các model được khuyến nghị

| Model | Dung lượng | Dùng tốt cho |
|---|---|---|
| `qwen2.5:7b` | 4.7 GB | Chat, hỏi đáp, tiếng Việt |
| `qwen2.5-coder:7b` | 4.7 GB | Viết code |
| `deepseek-coder:6.7b` | 3.8 GB | Review code |
| `deepseek-r1:7b` | 4.7 GB | Lý luận, toán học |
| `llava:13b` | 8.0 GB | Phân tích bản vẽ kỹ thuật |
| `minicpm-v:8b` | 5.5 GB | Phân tích PDF / hình ảnh |

### Lưu models ra ổ đĩa ngoài

Để tiết kiệm dung lượng Mac, thêm biến môi trường vào `~/.zshrc`:

```bash
export OLLAMA_MODELS=/Volumes/TEN_O_NGOAI/AI_STORAGE/ollama_models
```

Sau đó khởi động Ollama bằng:
```bash
OLLAMA_MODELS=/Volumes/TEN_O_NGOAI/AI_STORAGE/ollama_models ollama serve
```

### Đổi model AI trong Settings

Vào **Settings → AI Model** để chọn model đang cài. Model mặc định là `qwen2.5:7b`.

## Import PDF Codebook

1. Nhấn **Codebook PDF** ở thanh sidebar
2. Nhấn **Import PDF** (góc trên phải)
3. Chọn file PDF API hoặc ASME đã mua hợp lệ
4. App sẽ lập chỉ mục tài liệu để tìm kiếm và tham chiếu

## Công nghệ sử dụng

- [Tauri v2](https://tauri.app) — nền tảng desktop native
- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org) — giao diện
- [Vite](https://vite.dev) — build tool frontend
- [SQLite](https://www.sqlite.org) qua `rusqlite` — cơ sở dữ liệu cục bộ
- [Ollama](https://ollama.ai) — suy luận AI cục bộ
