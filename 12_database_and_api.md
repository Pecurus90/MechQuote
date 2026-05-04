# Database and API

## Backend

Use FastAPI.

## Database

Use SQLite for local MVP.
Structure code so PostgreSQL can be used later.

Use SQLAlchemy models.

## API modules

Suggested API routes:

### Quotes

GET /quotes
POST /quotes
GET /quotes/{id}
PUT /quotes/{id}
DELETE /quotes/{id}

### Parts

POST /quotes/{quote_id}/parts
GET /parts/{id}
PUT /parts/{id}
DELETE /parts/{id}
POST /parts/{id}/duplicate

### Phases

POST /parts/{part_id}/phases
PUT /phases/{id}
DELETE /phases/{id}
POST /parts/{part_id}/phases/reorder

### Materials

GET /materials
POST /materials
PUT /materials/{id}
DELETE /materials/{id}

### Machines

GET /machines
POST /machines
PUT /machines/{id}
DELETE /machines/{id}

### DXF

POST /dxf/analyze
POST /dxf/calculate-edm

### STEP

POST /step/analyze
POST /step/suggest-cycle

### PDF

GET /quotes/{id}/pdf/customer
GET /quotes/{id}/pdf/internal

## Calculation

All calculation logic should be in backend services.

Do not duplicate critical formula logic only in frontend.

Frontend can show live previews, but backend is source of truth.

## File storage

Local MVP:
- store uploaded files under /data/uploads
- save file paths in database

Future:
- S3-compatible storage.
