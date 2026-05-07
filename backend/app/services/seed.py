from app.core.database import engine, Base
from app.models import (
    Material, Machine, Treatment, Supplier, PhaseTemplate, StepColorRule, CompanySettings
)
from sqlalchemy.orm import sessionmaker

Session = sessionmaker(bind=engine)

def seed_data():
    session = Session()

    # Materials
    materials = [
        Material(name="Aluminum 6061", family="aluminum", density_kg_dm3=2.7, cost_per_kg=3.5, edm_coefficient=1.0, cnc_machinability_coefficient=1.3, default_scrap_percent=10.0),
        Material(name="Aluminum 7075", family="aluminum", density_kg_dm3=2.81, cost_per_kg=5.0, edm_coefficient=1.0, cnc_machinability_coefficient=1.1, default_scrap_percent=10.0),
        Material(name="Steel S355", family="carbon steel", density_kg_dm3=7.85, cost_per_kg=1.2, edm_coefficient=1.3, cnc_machinability_coefficient=0.9, default_scrap_percent=12.0),
        Material(name="Stainless 304", family="stainless steel", density_kg_dm3=7.93, cost_per_kg=4.5, edm_coefficient=1.5, cnc_machinability_coefficient=0.6, default_scrap_percent=15.0),
        Material(name="Stainless 316", family="stainless steel", density_kg_dm3=7.98, cost_per_kg=6.0, edm_coefficient=1.5, cnc_machinability_coefficient=0.55, default_scrap_percent=15.0),
        Material(name="Tool Steel A2", family="tool steel", density_kg_dm3=7.86, cost_per_kg=8.0, edm_coefficient=1.6, cnc_machinability_coefficient=0.4, default_scrap_percent=15.0),
        Material(name="Titanium Grade 2", family="titanium", density_kg_dm3=4.51, cost_per_kg=25.0, edm_coefficient=2.0, cnc_machinability_coefficient=0.3, default_scrap_percent=20.0),
        Material(name="Brass C360", family="brass", density_kg_dm3=8.5, cost_per_kg=6.5, edm_coefficient=1.2, cnc_machinability_coefficient=1.2, default_scrap_percent=10.0),
        Material(name="Plastic POM", family="plastics", density_kg_dm3=1.41, cost_per_kg=4.0, edm_coefficient=0.5, cnc_machinability_coefficient=1.5, default_scrap_percent=5.0),
    ]
    session.add_all(materials)

    # Machines
    machines = [
        Machine(name="CNC 3-axis Haas VF2", machine_type="cnc_3_axis", hourly_rate=65.0, setup_minimum_hours=0.5),
        Machine(name="CNC 5-axis DMG", machine_type="cnc_5_axis", hourly_rate=120.0, setup_minimum_hours=1.0),
        Machine(name="Lathe Mazak", machine_type="turning", hourly_rate=55.0, setup_minimum_hours=0.5),
        Machine(name="Wire EDM Agie", machine_type="wire_edm", hourly_rate=70.0, setup_minimum_hours=1.0),
        Machine(name="Sinker EDM Charmilles", machine_type="sinker_edm", hourly_rate=65.0, setup_minimum_hours=1.0),
        Machine(name="Surface Grinder", machine_type="grinding", hourly_rate=45.0, setup_minimum_hours=0.3),
        Machine(name="Manual Bench", machine_type="manual", hourly_rate=30.0, setup_minimum_hours=0.2),
        Machine(name="CMM Inspection", machine_type="inspection", hourly_rate=50.0, setup_minimum_hours=0.5),
    ]
    session.add_all(machines)

    # Suppliers
    suppliers = [
        Supplier(name="Trattamenti Termici SpA", supplier_type="heat_treatment"),
        Supplier(name="Galvanica Veneta", supplier_type="surface_treatment"),
        Supplier(name="Lavorazioni Esterne Srl", supplier_type="external"),
    ]
    session.add_all(suppliers)
    session.flush()  # Get IDs

    # Company settings (singleton: anagrafica + default operativi)
    cs = CompanySettings(
        id=1,
        name="Fratelli Dalla Via",
        address="Officina Meccanica di Precisione",
        default_margin_percent=20.0,
        default_minimum_part_price=10.0,
        default_transport_cost=15.0,
        default_packaging_cost=5.0,
    )
    session.add(cs)

    # Phase Templates
    templates = [
        PhaseTemplate(name="CNC 3-axis Roughing", phase_type="cnc_milling", default_machine_id=1, setup_hours=0.5, cycle_hours_per_part=0.5, customer_visible=True),
        PhaseTemplate(name="CNC 3-axis Finishing", phase_type="cnc_milling", default_machine_id=1, setup_hours=0.3, cycle_hours_per_part=0.3, customer_visible=True),
        PhaseTemplate(name="CNC 5-axis Complete", phase_type="cnc_milling", default_machine_id=2, setup_hours=1.0, cycle_hours_per_part=0.75, customer_visible=True),
        PhaseTemplate(name="EDM Wire Standard", phase_type="wire_edm", default_machine_id=4, setup_hours=1.0, cycle_hours_per_part=1.0, customer_visible=False),
        PhaseTemplate(name="Heat Treatment External", phase_type="heat_treatment", default_supplier_id=1, fixed_cost=20.0, variable_cost_per_part=1.5, customer_visible=False),
        PhaseTemplate(name="Anodizing Black", phase_type="surface_treatment", default_supplier_id=2, fixed_cost=10.0, variable_cost_per_part=0.5, customer_visible=True),
        PhaseTemplate(name="Dimensional Inspection", phase_type="quality_control", default_machine_id=8, setup_hours=0.5, cycle_hours_per_part=0.25, customer_visible=False),
    ]
    session.add_all(templates)

    # STEP Color Rules
    color_rules = [
        StepColorRule(color_hex="#FF0000", color_name="Red", meaning="Critical machining", suggested_phase_type="cnc_milling", complexity_coefficient=1.5),
        StepColorRule(color_hex="#0000FF", color_name="Blue", meaning="Holes/threading", suggested_phase_type="drilling", complexity_coefficient=1.0),
        StepColorRule(color_hex="#800080", color_name="Purple", meaning="EDM operation", suggested_phase_type="wire_edm", complexity_coefficient=1.8),
        StepColorRule(color_hex="#008000", color_name="Green", meaning="Surface finish", suggested_phase_type="surface_treatment", complexity_coefficient=1.0),
        StepColorRule(color_hex="#FFFF00", color_name="Yellow", meaning="Tight tolerance", suggested_phase_type="grinding", complexity_coefficient=1.3),
    ]
    session.add_all(color_rules)

    session.commit()
    print("Seed data created successfully!")
    session.close()

if __name__ == "__main__":
    seed_data()
