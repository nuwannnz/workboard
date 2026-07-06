# Personal Management App - Initial PRD

## Product Overview
A personal productivity application available as both a desktop application (Tauri) and a Progressive Web App (PWA). The application combines weekly planning, project management, note taking, and an overview dashboard into a single workspace.

## Core Features

### Navigation
- Left sidebar similar to Jira.
- Four primary views:
  - Week
  - Projects
  - Notes
  - Overview

## Week
- Kanban board with seven columns (Monday–Sunday).
- UI inspired by Trello.
- Navigate previous/next weeks and jump back to current week.
- Inline task creation at the bottom of each day.
- Drag-and-drop tasks between days; moving updates the due date.
- Manual ordering within each day is persisted.
- Task fields:
  - Title (required)
  - Description
  - Due date (defaults to the day created)
  - Status (Open, Completed)
  - Priority (Low, Medium, High)
  - Optional labels
  - Linked notes
  - Optional project reference
- Completed tasks remain visible and can be reopened.
- Project tasks with due dates automatically appear in the relevant day with project name/color.

## Projects
- Project cards page.
- Create Project modal:
  - Name
  - Description
  - Color
- Project detail page displays:
  - Summary
  - Progress bar
  - Task backlog
- Project progress = completed tasks / total tasks.
- Project tasks use the same Task model.
- Due date is optional.
- Tasks without due dates remain only in the project backlog.
- Task ordering is persisted.

## Notes
- Master-detail notebook layout.
- Markdown WYSIWYG editor.
- Auto-save after approximately 500ms of inactivity.
- Fields:
  - Title
  - Markdown content
- Notes can link to multiple projects and tasks.
- Projects/tasks indicate linked notes.

## Overview
Displays:
- Today's tasks
- Upcoming tasks (7 days)
- Overdue tasks
- Active projects
- Recent notes
- Weekly completion summary

## Authentication
- Email/password registration
- Login
- Logout
- Each user only has access to their own data.

## Data Model
Single Task entity:
- id
- title
- description
- dueDate
- status
- priority
- labels
- projectId (optional)
- linkedNoteIds

Project:
- id
- name
- description
- color

Note:
- id
- title
- markdown

## Technical Architecture

### Frontend
- React + TypeScript
- shadcn/ui (Atlassian design system)
- Responsive
- Shared codebase for:
  - PWA
  - Tauri desktop app

### Backend
- Single AWS Lambda
- AWS API Gateway
- Express.js application
- Layered architecture:
  - Routes
  - Controllers
  - Services
  - Repositories
  - Domain models
  - Middleware
  - Validation
  - Shared utilities
- Feature-based modules:
  - Auth
  - Tasks
  - Projects
  - Notes
  - Overview

### Database
- DynamoDB

### Infrastructure
- AWS CDK
- CloudFront
- S3
- API Gateway
- Lambda
- DynamoDB
- Cognito

### Monorepo
- Nx

### Testing
- Vitest
- Playwright (priority)
- GitHub Actions CI

## Development Standards
- Semantic commits
- Semantic versioning
- Main branch is production
- Feature branches merged via Pull Requests

## Out of Scope (MVP)
- AI features
- Collaboration
- Calendar view
- Recurring tasks
- Notifications/reminders
- File attachments
