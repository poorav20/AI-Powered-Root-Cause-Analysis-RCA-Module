-- Idempotent showcase data for the RCA workflow.
-- Run with: docker exec -i rca_postgres psql -U postgres -d rca_db < database/demo_run.sql

UPDATE deviations
SET raw_input_text = 'Deviation email from Production QA\nProduct: Paracetamol Intermediate\nBatch: BATCH-2024-002\nDuring exothermic addition in Reactor R-101, temperature reached 85.4 C for 15 minutes against an 80 C upper limit. SCADA recorded a cooling-water valve command of 100%, but the return valve position feedback remained at 42%. The batch was immediately quarantined. Operator alarm response was within SOP requirements. Maintenance inspection found corrosion and binding on the CV-101 actuator stem.\nRequested evidence: utility delta-P trend, HPLC impurity profile, and maintenance work order history.',
    source_document_path = 'records/deviation-temperature-excursion.txt',
    status = 'rca_complete'
WHERE deviation_number = 'DEV-2024-0002';

UPDATE deviations
SET raw_input_text = 'QC investigation note\nProduct: Aspirin API\nBatch: BATCH-2024-001\nRelease assay result was 97.2% against a 98.0-102.0% specification. Duplicate preparation and system suitability passed. HPLC showed a degradation impurity at RRT 1.14. Review of the vacuum cone dryer trend showed a 12 kPa vacuum loss during the final drying stage.',
    source_document_path = 'records/oos-assay-investigation.txt'
WHERE deviation_number = 'DEV-2024-0001';

UPDATE deviations
SET raw_input_text = 'QA visual inspection report\nProduct: Ibuprofen API\nBatch: BATCH-2024-003\nVisible dark particulates were observed in 3 of 100 inspected vials after filtration. Filter integrity testing was not recorded at the start of the filling campaign. The batch remains on QA hold pending filter inspection and line clearance review.',
    source_document_path = 'records/particulate-investigation.txt'
WHERE deviation_number = 'DEV-2024-0003';

UPDATE investigations
SET method = 'five_whys',
    why_1 = 'Reactor R-101 temperature exceeded the validated upper limit during exothermic addition.',
    why_2 = 'Cooling jacket heat-transfer performance dropped while the valve command was 100% open.',
    why_3 = 'CV-101 return valve feedback remained at 42% because the actuator did not complete its commanded stroke.',
    why_4 = 'The pneumatic actuator stem was corroded and mechanically binding.',
    why_5 = 'Preventive maintenance was calendar-based and did not account for increased valve actuation cycles.',
    man_factors = '["Operator acknowledged alarm within SOP response time", "Operator followed batch hold and escalation procedure"]'::jsonb,
    machine_factors = '["CV-101 actuator stem showed corrosion and binding", "RTD-101 and backup sensor correlated within 0.3 C"]'::jsonb,
    material_factors = '["Solvent lot CoA met specification", "Raw material identity and assay were verified"]'::jsonb,
    method_factors = '["Exothermic addition rate followed SOP-PR-402", "BMR recorded agitation at validated speed"]'::jsonb,
    environment_factors = '["Room temperature and humidity were within cGMP limits"]'::jsonb,
    measurement_factors = '["SCADA trend and independent temperature probe were concordant"]'::jsonb,
    root_causes = '[{"cause":"CV-101 actuator mechanical binding caused insufficient cooling-water return flow","evidence":"Maintenance inspection found corrosion on the actuator stem and a seized pneumatic diaphragm","confidence":0.94}]'::jsonb,
    contributing_factors = '[{"factor":"Maintenance frequency was not risk-adjusted for increased campaign volume","evidence":"CMMS interval remained at six months despite higher actuation counts","category":"Machine"}]'::jsonb,
    missing_evidence = '["Utility cooling-water delta-P trend during the excursion","HPLC impurity profile compared with historical baseline","Effectiveness check after the first three post-maintenance batches"]'::jsonb,
    investigation_summary = 'The primary root cause is mechanical binding of CV-101 under peak thermal demand. The batch remains quarantined pending product impact assessment and confirmation of restored cooling response.',
    investigator_notes = 'Review AI suggestions against approved batch records and maintenance evidence before approval.',
    ai_generated = true,
    ai_confidence_score = 0.94
WHERE deviation_id = (SELECT id FROM deviations WHERE deviation_number = 'DEV-2024-0002');

INSERT INTO investigations (deviation_id, method, why_1, why_2, why_3, why_4, why_5, man_factors, machine_factors, material_factors, method_factors, environment_factors, measurement_factors, root_causes, contributing_factors, missing_evidence, investigation_summary, ai_generated, ai_confidence_score)
SELECT id, 'five_whys',
 'Release assay failed at 97.2% against the 98.0-102.0% specification.',
 'A degradation impurity was detected after the final drying cycle.',
 'Vacuum loss created uneven drying and localized thermal stress in the API cake.',
 'The dryer seal was worn beyond the quantitative inspection limit.',
 'The seal inspection procedure required visual review but no thickness or leak-rate measurement.',
 '["QC duplicate preparation and system suitability checks passed"]'::jsonb,
 '["Vacuum cone dryer showed a 12 kPa pressure loss"]'::jsonb,
 '["Starting material CoAs met specification"]'::jsonb,
 '["Drying time followed the approved batch record"]'::jsonb,
 '["Laboratory temperature and humidity were controlled"]'::jsonb,
 '["HPLC system suitability and detector linearity passed"]'::jsonb,
 '[{"cause":"Worn dryer seal caused localized thermal degradation during drying","evidence":"Vacuum trend showed pressure loss and HPLC detected a degradation impurity at RRT 1.14","confidence":0.90}]'::jsonb,
 '[{"factor":"Seal inspection lacked a quantitative leak-rate acceptance criterion","evidence":"Maintenance SOP only required visual inspection","category":"Method"}]'::jsonb,
 '["Dryer wall temperature mapping for the affected cycle","DSC thermogram of the rejected lot","Three-batch effectiveness trend after seal replacement"]'::jsonb,
 'The assay failure is most consistent with localized thermal degradation caused by dryer vacuum loss. The batch remains on QA hold pending analytical impact assessment.', true, 0.90
FROM deviations d
WHERE d.deviation_number = 'DEV-2024-0001'
  AND NOT EXISTS (SELECT 1 FROM investigations i WHERE i.deviation_id = d.id);

INSERT INTO investigations (deviation_id, method, why_1, why_2, why_3, why_4, why_5, man_factors, machine_factors, material_factors, method_factors, environment_factors, measurement_factors, root_causes, contributing_factors, missing_evidence, investigation_summary, ai_generated, ai_confidence_score)
SELECT id, 'fishbone',
 'Particulates were observed in 3 of 100 inspected vials.',
 'Particles entered the product stream after filtration during the filling campaign.',
 'The filter assembly was not verified by documented pre-use integrity testing.',
 'The line-clearance checklist did not require a serialized integrity-test record.',
 'The batch-start checklist design allowed a critical verification step to be marked complete without an instrument result.',
 '["Filling operator escalated the observation immediately"]'::jsonb,
 '["Filter housing gasket showed wear"]'::jsonb,
 '["Bulk solution met pre-filtration appearance requirements"]'::jsonb,
 '["Pre-use filter integrity test was not recorded"]'::jsonb,
 '["Line environment met classified-area requirements"]'::jsonb,
 '["Visual inspection sampling plan was followed"]'::jsonb,
 '[{"cause":"Missing documented pre-use filter integrity verification allowed a worn gasket/filter assembly into the campaign","evidence":"No serialized integrity-test result was present and gasket inspection found wear","confidence":0.86}]'::jsonb,
 '[{"factor":"Checklist control did not require instrument evidence before batch start","evidence":"Line-clearance form allowed manual completion without test attachment","category":"Method"}]'::jsonb,
 '["Filter integrity test result for the prior batch","Gasket replacement history","Expanded inspection of remaining filled units"]'::jsonb,
 'The investigation points to a documentation and equipment-readiness control gap around pre-use filter integrity verification. The batch remains on QA hold pending expanded inspection.', true, 0.86
FROM deviations d
WHERE d.deviation_number = 'DEV-2024-0003'
  AND NOT EXISTS (SELECT 1 FROM investigations i WHERE i.deviation_id = d.id);

INSERT INTO capa_actions (deviation_id, action_type, title, description, root_cause_addressed, assigned_to, status, ai_generated, ai_reasoning)
SELECT d.id, 'corrective', 'Rebuild and stroke-test CV-101 actuator', 'Replace corroded stem components, inspect diaphragm, lubricate per approved maintenance instruction, and verify 0-100% response under simulated production load.', 'CV-101 actuator mechanical binding', 'Maintenance Engineering Lead', 'in_progress', true, 'High priority; directly addresses the confirmed equipment failure.'
FROM deviations d WHERE d.deviation_number = 'DEV-2024-0002'
AND NOT EXISTS (SELECT 1 FROM capa_actions c WHERE c.deviation_id=d.id AND c.title='Rebuild and stroke-test CV-101 actuator');

INSERT INTO capa_actions (deviation_id, action_type, title, description, root_cause_addressed, assigned_to, status, ai_generated, ai_reasoning)
SELECT d.id, 'preventive', 'Add cycle-based valve maintenance trigger', 'Connect SCADA actuation counts to CMMS and trigger inspection at 5,000 cycles or the validated risk-based threshold.', 'Calendar-based maintenance did not reflect campaign usage', 'Reliability Engineering', 'pending', true, 'Prevents recurrence across the API reactor train.'
FROM deviations d WHERE d.deviation_number = 'DEV-2024-0002'
AND NOT EXISTS (SELECT 1 FROM capa_actions c WHERE c.deviation_id=d.id AND c.title='Add cycle-based valve maintenance trigger');

INSERT INTO capa_actions (deviation_id, action_type, title, description, root_cause_addressed, assigned_to, status, ai_generated, ai_reasoning)
SELECT d.id, 'corrective', 'Replace dryer seal and verify vacuum hold', 'Replace the worn seal, execute a documented leak-rate test, and map dryer wall temperature before releasing the equipment.', 'Dryer vacuum loss caused localized thermal degradation', 'Maintenance and QC', 'in_progress', true, 'High priority; restores equipment capability and provides objective verification.'
FROM deviations d WHERE d.deviation_number = 'DEV-2024-0001'
AND NOT EXISTS (SELECT 1 FROM capa_actions c WHERE c.deviation_id=d.id AND c.title='Replace dryer seal and verify vacuum hold');

INSERT INTO capa_actions (deviation_id, action_type, title, description, root_cause_addressed, assigned_to, status, ai_generated, ai_reasoning)
SELECT d.id, 'preventive', 'Revise filter integrity checklist with evidence gate', 'Require a serialized pre-use integrity-test result and supervisor verification before filling can begin.', 'Checklist allowed manual completion without instrument evidence', 'QA Systems Owner', 'pending', true, 'Medium effort; closes the procedural and documentation control gap.'
FROM deviations d WHERE d.deviation_number = 'DEV-2024-0003'
AND NOT EXISTS (SELECT 1 FROM capa_actions c WHERE c.deviation_id=d.id AND c.title='Revise filter integrity checklist with evidence gate');
