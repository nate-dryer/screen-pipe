# Screen-Pipe Features and Capabilities

## Overview

Screen-Pipe is a comprehensive library designed to build personalized AI powered by what you've seen, said, or heard. It offers a range of features including audio capture, transcription, vision capture, OCR, server setup, and API endpoints. The project is modular and includes multiple examples and benchmarks.

## Audio Capture and Transcription

### Audio Capture

Screen-Pipe provides robust audio capture capabilities. It supports both input and output audio devices, allowing you to capture audio from various sources.

#### Example Usage

```rust
use screenpipe_audio::{list_audio_devices, record_and_transcribe, AudioDevice};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::unbounded_channel;

#[tokio::main]
async fn main() {
    let devices = list_audio_devices().unwrap();
    for device in devices {
        println!("Found device: {}", device);
    }

    let (whisper_sender, whisper_receiver) = unbounded_channel();
    let audio_device = Arc::new(AudioDevice::from_name("default (input)").unwrap());
    let output_path = "output_audio.mp4".into();
    let duration = Duration::from_secs(10);

    record_and_transcribe(audio_device, duration, output_path, whisper_sender, Arc::new(AtomicBool::new(true))).await.unwrap();
}
```

### Transcription

Screen-Pipe includes transcription capabilities using WhisperModel. It can transcribe audio into text efficiently.

#### Example Usage

```rust
use screenpipe_audio::{create_whisper_channel, AudioInput};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let (whisper_sender, whisper_receiver) = create_whisper_channel().await.unwrap();
    let audio_input = AudioInput {
        path: "output_audio.mp4".to_string(),
        device: "default (input)".to_string(),
    };

    whisper_sender.send(audio_input).unwrap();
    while let Some(result) = whisper_receiver.recv().await {
        println!("Transcription: {:?}", result.transcription);
    }
}
```

## Vision Capture and OCR

### Vision Capture

Screen-Pipe provides vision capture capabilities, allowing you to capture screenshots and perform OCR on them.

#### Example Usage

```rust
use screenpipe_vision::{continuous_capture, ControlMessage};
use tokio::sync::mpsc::channel;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let (control_tx, control_rx) = channel(1);
    let (result_tx, mut result_rx) = channel(1);
    let interval = Duration::from_secs(1);

    tokio::spawn(async move {
        continuous_capture(&mut control_rx, result_tx, interval, false).await;
    });

    while let Some(result) = result_rx.recv().await {
        println!("Captured text: {}", result.text);
    }
}
```

### OCR

Screen-Pipe includes OCR capabilities using Tesseract. It can extract text from images efficiently.

#### Example Usage

```rust
use screenpipe_vision::perform_ocr;
use image::open;

fn main() {
    let image = open("screenshot.png").unwrap();
    let (text, data_output, json_output) = perform_ocr(&image);
    println!("Extracted text: {}", text);
}
```

## Server Setup and API Endpoints

Screen-Pipe includes a server setup with various API endpoints to interact with the captured data.

### Example Usage

```rust
use screenpipe_server::{Server, DatabaseManager};
use std::sync::Arc;
use std::net::SocketAddr;
use tokio::sync::mpsc::channel;

#[tokio::main]
async fn main() {
    let db = Arc::new(DatabaseManager::new("db.sqlite").await.unwrap());
    let addr = SocketAddr::from(([127, 0, 0, 1], 3030));
    let (audio_devices_control_sender, _audio_devices_control_receiver) = channel(1);

    let server = Server::new(db, addr, Arc::new(AtomicBool::new(true)), audio_devices_control_sender);
    server.start(HashMap::new(), |_| {}).await.unwrap();
}
```

## Modular Structure and Dependencies

Screen-Pipe is designed with a modular structure, as indicated in the `Cargo.toml` file. The project is divided into several crates, each focusing on a specific functionality:

- `screenpipe-audio`: Handles audio capture and transcription.
- `screenpipe-core`: Contains core functionalities, including LLM integration.
- `screenpipe-server`: Manages the server setup and API endpoints.
- `screenpipe-vision`: Handles vision capture and OCR.

### Dependencies

The `Cargo.toml` file lists the dependencies required for each module. Here is an example:

```toml
[workspace]
members = [
    "screenpipe-core",
    "screenpipe-vision",
    "screenpipe-audio",
    "screenpipe-server",
]
resolver = "2"

[workspace.dependencies]
log = "0.4"
candle = { package = "candle-core", version = "0.6.0" }
candle-nn = { package = "candle-nn", version = "0.6.0" }
candle-transformers = { package = "candle-transformers", version = "0.6.0" }
tokenizers = "0.19.1"
tracing = "0.1.37"
tokio = { version = "1.15", features = ["full", "tracing"] }
hf-hub = "0.3.0"
criterion = { version = "0.5.1", features = ["async_tokio"] }
```

## Examples and Benchmarks

Screen-Pipe includes multiple examples and benchmarks to help you get started and evaluate performance. These can be found in the `examples` and `benches` directories.

### Examples

The `examples` directory contains various use cases demonstrating how to use Screen-Pipe's features.

### Benchmarks

The `benches` directory includes benchmarks to measure the performance of different components of Screen-Pipe.

