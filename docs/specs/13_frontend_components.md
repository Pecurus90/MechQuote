# Frontend Components

> ⚠️ **DOC OBSOLETO** (CLAUDE.md §12). L'elenco componenti qui sotto è quello
> originale e non riflette più il frontend attuale. Per la struttura vera vedi
> `frontend/src/` (pagine in `pages/`, componenti in `components/`) e la §10
> di `CLAUDE.md`. Mantenuto come storico.

## Layout

Components:
- AppShell
- Sidebar
- Header
- MainContent
- LiveQuoteSummary

## Dashboard

Components:
- DashboardPage
- KpiCard
- MonthlyComparisonCard
- AnnualTrendChart
- QuoteStatsPanel

## Quote creation

Components:
- CreateQuoteModePage
- QuoteEditorPage
- QuoteHeaderForm
- PartListSidebar
- PartEditor
- PartReviewPanel
- QuoteTotalPanel

## Part editor

Components:
- PartBasicInfoForm
- MaterialSelector
- RawStockCalculator
- ManufacturingCycleEditor
- PhaseRow
- PhaseForm
- PhaseTemplateSelector
- CostBreakdownPanel

## DXF

Components:
- DxfUpload
- DxfPreview
- DxfProfileList
- DxfProfileSelector
- EdmCalculator
- DxfReviewPanel

## STEP

Components:
- StepUpload
- StepViewer
- StepGeometrySummary
- StepColorLegend
- StepSuggestedCycle
- StepReviewPanel

## Settings

Components:
- MaterialsPage
- MachinesPage
- PhaseTemplatesPage
- TreatmentsPage
- CostRulesPage
- EdmRulesPage
- CncRulesPage
- StepColorRulesPage

## UX details

- Autosave drafts.
- Show live total.
- Allow keyboard-friendly editing.
- Allow duplicating phases.
- Allow duplicating parts.
- Use tables for quick editing.
- Use cards for wizard steps.
- Keep quote review always visible when possible.
