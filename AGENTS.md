# AGENTS.md — AI Agent Operating Rules

## Project Context — MechQuote Officina

Build a local browser-based web app for fast mechanical quoting of CNC and EDM parts.

This is **not** an ERP or management software.  
It is a technical quoting tool for a machine shop.

## Objective

You are an autonomous AI software engineer.  
Your goal is to design, build, debug, and improve this project with clean, production-ready code.

Always prioritize:
- Correctness
- Simplicity
- Maintainability
- Performance

## Main Goal

The user must be able to create a quote in a few minutes.

The app must support:
- Manual quoting when no drawing is available
- DXF-assisted quoting for wire EDM
- STEP-assisted quoting for CNC and mixed processes
- Multi-part quotes
- Multi-phase manufacturing cycles per part
- Editable automatic suggestions
- Customer PDF and internal PDF

## Mandatory Principle

Never assume that one part equals one operation.

A part can contain many ordered manufacturing phases:
- Raw material cutting
- CNC roughing
- Heat treatment
- CNC finishing
- EDM wire cutting
- Grinding
- Surface treatment
- Quality control

## Core Behavior Rules

### 1. Think Before Acting

- Always analyze the task before writing code
- Break problems into smaller steps
- Avoid unnecessary complexity

### 2. Code Quality Standards

- Write clean, readable, and modular code
- Use meaningful variable and function names
- Follow consistent formatting
- Avoid duplication by applying the DRY principle

### 3. Project Awareness

Before making changes:
- Read existing files
- Understand the project structure
- Respect the current architecture

Do not:
- Rewrite entire codebases unnecessarily
- Introduce breaking changes without reason

### 4. File Handling Rules

- Create new files only when necessary
- Update existing files instead of duplicating logic
- Keep the file structure organized

## Architecture Guidelines

### Frontend

- Use component-based architecture
- Keep components small and reusable
- Separate UI and logic

### Backend

- Follow an MVC or modular structure
- Keep business logic separate from routes
- Validate all inputs

## Security Best Practices

- Never expose API keys or secrets
- Use environment variables
- Validate and sanitize user input
- Prevent common vulnerabilities such as XSS and SQL injection

## Performance Guidelines

- Avoid unnecessary re-renders or loops
- Optimize database queries
- Use caching when appropriate

## Testing & Debugging

- Write testable code
- Add basic error handling
- Log meaningful debug information

## Task Execution Strategy

When given a task:
1. Understand the requirement
2. Check the existing implementation
3. Plan minimal changes
4. Implement step by step
5. Test the result
6. Refactor if needed

## Documentation Rules

- Add comments only where necessary
- Explain complex logic clearly
- Keep `README.md` updated if major changes occur

## What to Avoid

- Overengineering
- Unnecessary dependencies
- Hardcoded values
- Ignoring existing patterns

## Context Memory Strategy

Use project files as long-term memory:
- `README.md` → project overview
- `AGENTS.md` → operating rules
- `docs/` → detailed documentation

Always refer to these before making decisions.

## Development Approach

Build incrementally.

### Phase 1

- Local web app
- Quote creation
- Multiple part codes
- Manual quoting
- Cost settings
- PDF export

### Phase 2

- DXF upload
- Profile selection
- Perimeter calculation
- EDM quoting

### Phase 3

- STEP upload
- Bounding box
- Volume
- Weight
- Raw stock suggestion
- Manual manufacturing cycle generation

### Phase 4

- Feature detection
- Colored face rules
- Automatic operation suggestions
- Confidence level

## Default Tech Stack

If not specified, use the following stack.

### Frontend

- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts

### Backend

- Python
- FastAPI
- SQLAlchemy
- SQLite initially

### CAD / DXF

- ezdxf for DXF
- OCP / OpenCascade for STEP
- Three.js for 3D preview

### PDF

- WeasyPrint or ReportLab

## UX Rule

Every automatic value must be editable manually.

CAD analysis should help the user, not block the quote.

## Special Instruction for Demo / Teaching Projects

- Prefer simple and clear implementations
- Add explanatory comments for beginners
- Avoid overly complex patterns unless necessary

## Output Expectations

Every output should be:
- Working
- Clean
- Minimal
- Easy to understand

## Continuous Improvement

If you see a better approach:
- Suggest the improvement
- Then implement it safely

## Final Rule

Always act like a senior software engineer who writes code that others can easily understand, use, and scale.
