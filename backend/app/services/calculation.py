from sqlalchemy.orm import Session, joinedload
from app.models import Part, ManufacturingPhase, Quote


def recalculate_part(part_id: int, db: Session) -> None:
    """Recalculate all phase costs and part totals for a given part."""
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        return

    quantity = part.quantity or 1

    phases = db.query(ManufacturingPhase).filter(
        ManufacturingPhase.part_id == part_id
    ).options(joinedload(ManufacturingPhase.machine)).all()

    phase_total = 0.0
    for phase in phases:
        machine = phase.machine

        hourly_rate = phase.hourly_rate_override
        if hourly_rate is None:
            hourly_rate = machine.hourly_rate if machine else 0.0

        cost = (
            (phase.setup_hours or 0.0) * hourly_rate
            + (phase.cycle_hours_per_part or 0.0) * quantity * hourly_rate
            + (phase.fixed_cost or 0.0)
            + (phase.variable_cost_per_part or 0.0) * quantity
        )
        phase.calculated_cost = round(cost, 2)
        phase_total += phase.calculated_cost

    # Resolve margin: use part override, otherwise quote global
    margin = part.margin_percent
    if margin is None:
        quote = db.query(Quote).filter(Quote.id == part.quote_id).first()
        margin = quote.global_margin_percent if quote else 20.0

    part.total_cost = round((part.material_cost or 0.0) + phase_total, 2)

    minimum = part.minimum_price or 0.0
    cost_base = max(part.total_cost, minimum)
    part.unit_price = round(cost_base * (1 + margin / 100), 2)
    part.total_price = round(part.unit_price * quantity, 2)

    db.commit()
