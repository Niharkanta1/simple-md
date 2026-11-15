\# Build a Basic Markdown Viewer \& Project Manager



Build a lightweight desktop Markdown Viewer application with the following features:



\### Core Features



1\. \*\*File Management\*\*

&#x20;  - Manage Markdown files (`.md`) inside a user-selected root folder.

&#x20;  - Create, rename, delete, move, and organize files and folders.



2\. \*\*Project Management\*\*

&#x20;  - Create and manage multiple projects.

&#x20;  - Each project can contain multiple Markdown files and folders.

&#x20;  - Switch between projects easily.



3\. \*\*Markdown Editor \& Viewer\*\*

&#x20;  - Full Markdown and GitHub Flavored Markdown (GFM) support.

&#x20;  - Live preview with Editor, Preview, and Split View modes.

&#x20;  - Support tables, code blocks, syntax highlighting, task lists, blockquotes, and Mermaid diagrams.



4\. \*\*Images \& Links\*\*

&#x20;  - Support clickable hyperlinks and embedded images.

&#x20;  - Allow pasting images directly into the editor.

&#x20;  - Automatically save pasted images into a dedicated `<filename>-images` folder.

&#x20;  - Insert relative image paths into Markdown content.

&#x20;  - Ensure images remain accessible when projects are moved or exported.



5\. \*\*Gitignore Manager\*\*

&#x20;  - Provide a UI to manage `.gitignore`.

&#x20;  - Add or remove files and folders from ignore rules.

&#x20;  - Support common ignore patterns.



6\. \*\*Import \& Export\*\*

&#x20;  - Export individual Markdown files or complete projects as ZIP archives.

&#x20;  - Import Markdown files or complete projects from ZIP archives.

&#x20;  - Preserve folder structures, images, relative paths, and project metadata.

&#x20;  - Validate ZIP contents and prevent path traversal attacks.



\### Development Guidelines

\- Keep the application lightweight, fast, and easy to use.

\- Use a clean, modern desktop UI.

\- Follow modular architecture and separation of concerns.

\- Store project metadata locally.

\- Avoid unnecessary complexity and external dependencies.

\- Ensure all file operations work with the actual filesystem.



First, propose the application architecture, technology stack, folder structure, and implementation plan. Then implement features incrementally, verifying each feature before moving to the next.

