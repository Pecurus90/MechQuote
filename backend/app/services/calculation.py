from sqlalchemy.orm import Session, joinedload
from app.models import Part, ManufacturingPhase, Quote


def recalculate_part(part_id: int, db: Session) -> None:
    """Recalculate all phase costs and part totals for a given part.

    phase.calculated_cost = cost per piece (setup/fixed amortized over qty × n_parts if is_shared).
    part.total_price      = unit_price × qty (no double-counting).
    """
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        return

    qty = part.quantity or 1
    quote = db.query(Quote).filter(Quote.id == part.quote_id).first()
    n_parts = db.query(Part).filter(Part.quote_id == part.quote_id).count() if quote else 1

    phases = db.query(ManufacturingPhase).filter(
        ManufacturingPhase.part_id == part_id
    ).options(
        joinedload(ManufacturingPhase.machine),
        joinedload(ManufacturingPhase.treatment),
    ).all()

    phase_total_per_piece = 0.0
    for phase in phases:
        # Treatment phases: recalculate variable_cost_per_part dynamically
        # so that qty changes are reflected correctly (forfait splits across pieces)
        if phase.treatment_id and phase.treatment:
            t = phase.treatment
            total_weight = (part.finished_weight_kg or 0.0) * qty
            below_threshold = (
                t.minimum_weight_kg and t.minimum_weight_kg > 0
                and total_weight < t.minimum_weight_kg
            )
            if below_threshold:
                total_batch_cost = t.minimum_cost or 0.0
            else:
                total_batch_cost = (t.cost_per_kg or 0.0) * total_weight
            phase.variable_cost_per_part = round(total_batch_cost / max(qty, 1), 4)

        rate = phase.hourly_rate_override
        if rate is None:
            rate = phase.machine.hourly_rate if phase.machine else 0.0

        divisor = qty * (n_parts if phase.is_shared else 1)

        cost_per_piece = (
            (phase.setup_hours or 0.0) * rate / divisor
            + (phase.cycle_hours_per_part or 0.0) * rate
            + (phase.fixed_cost or 0.0) / divisor
            + (phase.variable_cost_per_part or 0.0)
        )
        phase.calculated_cost = round(cost_per_piece, 4)
        phase_total_per_piece += phase.calculated_cost

    margin = part.margin_percent
    if margin is None:
        margin = quote.global_margin_percent if quote else 20.0

    delivery_per_piece = (part.material_delivery_cost or 0.0) / qty
    cutting_per_piece = (part.material.cutting_cost_per_part or 0.0) if part.material else 0.0
    part.total_cost = round(
        (part.material_cost or 0.0) + delivery_per_piece + cutting_per_piece + phase_total_per_piece, 4
    )

    minimum = part.minimum_price or 0.0
    part.unit_price = round(max(part.total_cost, minimum) * (1 + margin / 100), 2)
    part.total_price = round(part.unit_price * qty, 2)

    db.commit()
