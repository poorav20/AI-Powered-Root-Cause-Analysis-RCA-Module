-- Seed demo data for video recording & showcase
INSERT INTO knowledge_bases (name, description, domain)
VALUES 
    ('Active API Manufacturing SOPs', 'Core operating procedures, batch manufacturing records, and reaction controls for API synthesis', 'pharmaceutical'),
    ('FDA, ICH & EU GMP Regulatory Guidelines', 'FDA 21 CFR Part 211, ICH Q7 Good Manufacturing Practice Guide, and EU GMP Annex 15', 'regulatory'),
    ('Historical Deviation & RCA Case Studies', 'Archived root cause investigations, 5 Whys analyses, and validated CAPA effectiveness checks', 'case_studies')
ON CONFLICT (name) DO NOTHING;

INSERT INTO investigations (deviation_id, method, why_1, why_2, why_3, why_4, why_5, man_factors, machine_factors, material_factors, method_factors, environment_factors, measurement_factors, root_causes, contributing_factors, missing_evidence, investigation_summary, ai_generated, ai_confidence_score)
VALUES 
(2, 'five_whys', 
 'Reactor R-101 internal batch temperature exceeded 85C (target: 78-80C) for 15 minutes during intermediate synthesis.',
 'Cooling jacket heat exchange rate dropped by 64% during exothermic addition phase.',
 'Secondary cooling water return valve stuck at 42% duty cycle despite SCADA command 100% open.',
 'Actuator stem accumulated particulate scale and lubrication degraded due to overdue preventive maintenance.',
 'Preventive maintenance schedule did not account for increased crystallization cycle frequency under high-throughput production.',
 '["Operator responded promptly to SCADA high-temperature alarm", "No operator training gaps identified"]'::jsonb,
 '["Cooling control valve CV-101 actuator stem bound", "Temperature sensor RTD-101 calibrated within tolerance"]'::jsonb,
 '["Raw material solvent lot verified compliant", "Reaction stoichiometry within validated limits"]'::jsonb,
 '["Exothermic addition rate followed SOP-PR-402", "Batch agitation maintained at 120 RPM"]'::jsonb,
 '["Chilled water utility supply temperature normal at 6.2C"]'::jsonb,
 '["Dual thermocouple readings correlated within 0.3C"]'::jsonb,
 '[{"cause": "Cooling jacket control valve CV-101 actuator mechanical binding due to lack of cycle-based lubrication", "evidence": "Maintenance inspection found physical corrosion on stem and seized pneumatic diaphragm", "confidence": 0.94}]'::jsonb,
 '[{"factor": "Maintenance frequency based on elapsed calendar time rather than valve actuation cycle count", "evidence": "CMMS work order #WO-2024-88 scheduled for 6-month interval", "category": "Machine"}]'::jsonb,
 '["Utility cooling water strainer delta-P log during excursion", "HPLC impurity profile comparison vs historical baseline"]'::jsonb,
 'Comprehensive RCA confirms excursion was triggered by mechanical binding of cooling valve CV-101 actuator under peak exothermic addition. Batch quarantined pending HPLC assay and DSC polymorph characterization.',
 true, 0.92)
ON CONFLICT DO NOTHING;

INSERT INTO capa_actions (deviation_id, action_type, title, description, root_cause_addressed, assigned_to, status, ai_generated, ai_reasoning)
VALUES 
(2, 'corrective', 'Rebuild and lubricate CV-101 valve actuator assembly', 'Disassemble pneumatic actuator, replace corroded stem bushings, repack PTFE seals, and verify full 0-100% stroke response under load.', 'Cooling valve CV-101 actuator mechanical binding', 'Maintenance Engineering Lead', 'in_progress', true, 'Priority: High, Effort: Medium. Directly resolves immediate mechanical failure on Reactor R-101.'),
(2, 'preventive', 'Transition valve maintenance in CMMS to cycle-count triggering', 'Integrate SCADA valve actuation stroke counters into SAP/Maximo CMMS to trigger inspection every 5,000 cycles rather than calendar semi-annual.', 'Maintenance frequency based on calendar elapsed time instead of cycle wear', 'Reliability Engineering', 'pending', true, 'Priority: High, Effort: High. Prevents recurrence across all API reactor trains.')
ON CONFLICT DO NOTHING;

