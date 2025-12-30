# CodeStamp VS Code Extension

**CodeStamp** is a smart productivity extension for VS Code that automatically signs and timestamps your code changes. It helps track who changed what and when, keeping a history directly in your source code.

## Key Features

### 1. Smart Commenting
CodeStamp intelligently detects the type of change you make:

*   **Single Line Changes**: Appends a comment to the end of the line.
    ```javascript
    const visible = true; // user | 12/30/2025, 2:30:00 PM
    ```

*   **Block Changes (Multi-line)**: Automatically wraps new code blocks with **Start** and **End** markers.
    ```javascript
    // Start user | 12/30/2025, 2:45:00 PM
    function newFeature() {
        console.log("This is a new block");
    }
    // End user | 12/30/2025, 2:45:00 PM
    ```

### 2. Intelligent Clustering
If you paste a large function or make edits to adjacent lines separated by whitespace, CodeStamp groups them into a **single block** instead of cluttering every line with comments.

### 3. Multi-Language Support
Supports syntax for major languages:
- **`//`**: JavaScript, TypeScript, C, C++, Java, C#, Go, Rust
- **`#`**: Python, YAML, Shell, Dockerfile, Makefile
- **`<!-- -->`**: HTML, XML
- **`/* */`**: CSS, SCSS, Less
- **`REM`**: Batch Files

## Usage

1.  **Install** the extension.
2.  **Edit** any file.
3.  **Save** (`Cmd+S` / `Ctrl+S`).
4.  CodeStamp handles the rest!

## Configuration

### Set Author Name
By default, the author name is set to `User`. You can change this easily:

1.  Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2.  Run **"CodeStamp: Set Author Name"**.
3.  Enter your name.

Alternatively, edit `codestamp.authorName` in VS Code Settings.

## Requirements

No external dependencies are required.
