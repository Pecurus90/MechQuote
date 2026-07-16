"""Regressione audit A2: azzerare il trattamento di una fase.

Il frontend, togliendo il trattamento, invia `treatment_id: null`. Il backend
applica gli update con `model_dump(exclude_unset=True)` + setattr: perché il
trattamento venga davvero rimosso, il None ESPLICITO deve restare nel dump
(un `undefined` lato JS verrebbe scartato da JSON.stringify → chiave assente →
exclude_unset la salta → trattamento fantasma con costi a 0).
"""
from app.schemas import PhaseUpdate


def test_treatment_id_none_esplicito_e_nel_dump():
    # null esplicito → presente nel dump → setattr(phase, 'treatment_id', None)
    dumped = PhaseUpdate(treatment_id=None).model_dump(exclude_unset=True)
    assert "treatment_id" in dumped
    assert dumped["treatment_id"] is None


def test_treatment_id_non_passato_non_e_nel_dump():
    # campo non toccato → assente dal dump → il valore in DB resta invariato
    dumped = PhaseUpdate(fixed_cost=0).model_dump(exclude_unset=True)
    assert "treatment_id" not in dumped
