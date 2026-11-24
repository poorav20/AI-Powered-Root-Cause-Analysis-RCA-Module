"""Small, de-identified pharmaceutical RCA examples used as in-context guidance.

These examples are deliberately short. They teach the model the application's field
semantics without presenting invented evidence as a confirmed root cause.
"""

RCA_EXTRACTION_EXAMPLES = [
    {
        "source": "SSR Hospital reported that 12 Amoxicillin Capsules 500 mg appeared discolored. Batch number AMX240602. Manufacturing date: March 2026. Expiry date: February 2028.",
        "extraction": {
            "title": "Reported Amoxicillin Capsules 500 mg quality defect",
            "product_name": "Amoxicillin Capsules 500 mg",
            "batch_number": "AMX240602",
            "source_type": "healthcare provider",
            "reported_by": "SSR Hospital",
            "affected_quantity": "12 Capsules",
            "expected_outcome": "Capsules should have uniform appearance without discoloration per the approved product specification.",
            "actual_outcome": "Discolored capsules were reported in the supplied source record.",
            "severity": "major",
        },
    },
    {
        "source": "QC laboratory record: Metformin hydrochloride API, batch MFH260712A. Expected assay 98.0-102.0%. Actual assay 96.4%. Affected quantity: 2 HDP drums.",
        "extraction": {
            "product_name": "Metformin hydrochloride API",
            "batch_number": "MFH260712A",
            "source_type": "laboratory record",
            "department": "Quality Control",
            "affected_quantity": "2 HDP drums",
            "expected_outcome": "Assay 98.0-102.0%.",
            "actual_outcome": "Assay 96.4%.",
            "severity": "major",
        },
    },
    {
        "source": "Equipment log for Reactor R-101: temperature reached 86 C for 12 minutes. Approved range was 78-82 C. Batch API-2406-02 was quarantined.",
        "extraction": {
            "product_name": None,
            "batch_number": "API-2406-02",
            "source_type": "equipment log",
            "equipment_involved": "Reactor R-101",
            "expected_outcome": "Temperature maintained within 78-82 C.",
            "actual_outcome": "Temperature reached 86 C for 12 minutes.",
            "severity": "major",
        },
    },
    {
        "source": "Production deviation: Ibuprofen API batch IBU-2608-17 yield was 91.2% against the approved expected yield of 96.0-100.0%. Final crystallization recovered 8.8% less material than expected. Quantity affected: one batch. Reported by Production Supervisor.",
        "extraction": {
            "product_name": "Ibuprofen API",
            "batch_number": "IBU-2608-17",
            "source_type": "quality record",
            "department": "Production",
            "reported_by": "Production Supervisor",
            "affected_quantity": "one batch",
            "expected_outcome": "Approved yield 96.0-100.0%.",
            "actual_outcome": "Yield was 91.2%; crystallization recovered 8.8% less material.",
            "severity": "major",
        },
    },
    {
        "source": "QC reported an OOS moisture result for Atorvastatin intermediate, lot ATV-260401. Specification: not more than 0.50% w/w. Result: 0.86% w/w by Karl Fischer. Three drums placed on QA hold.",
        "extraction": {
            "product_name": "Atorvastatin intermediate",
            "batch_number": "ATV-260401",
            "source_type": "laboratory record",
            "department": "Quality Control",
            "affected_quantity": "three drums",
            "expected_outcome": "Moisture not more than 0.50% w/w.",
            "actual_outcome": "Moisture result was 0.86% w/w by Karl Fischer.",
            "severity": "major",
        },
    },
    {
        "source": "Maintenance log for vacuum dryer VD-204: vacuum dropped from -0.85 bar to -0.42 bar during drying of Paracetamol intermediate batch PCM-260511. The approved vacuum range is -0.80 to -0.90 bar. Batch was placed on hold.",
        "extraction": {
            "product_name": "Paracetamol intermediate",
            "batch_number": "PCM-260511",
            "source_type": "equipment log",
            "equipment_involved": "Vacuum dryer VD-204",
            "expected_outcome": "Vacuum maintained between -0.80 and -0.90 bar.",
            "actual_outcome": "Vacuum dropped to -0.42 bar during drying.",
            "severity": "major",
        },
    },
    {
        "source": "QA investigation noted a foreign particle in one sealed drum of Aspirin API batch ASP-260215. Expected result: no visible foreign matter. Actual result: dark fiber observed during visual inspection. Affected quantity: 1 of 24 drums.",
        "extraction": {
            "product_name": "Aspirin API",
            "batch_number": "ASP-260215",
            "source_type": "quality record",
            "department": "Quality Assurance",
            "affected_quantity": "1 of 24 drums",
            "expected_outcome": "No visible foreign matter.",
            "actual_outcome": "Dark fiber observed during visual inspection.",
            "severity": "critical",
        },
    },
    {
        "source": "Email from Warehouse: 4 drums of Metformin hydrochloride API batch MFH-260721 had damaged seals on receipt. Expected condition is intact, tamper-evident seals. Actual condition is two cracked and two loose seals. Product remains segregated.",
        "extraction": {
            "product_name": "Metformin hydrochloride API",
            "batch_number": "MFH-260721",
            "source_type": "email",
            "department": "Warehouse",
            "affected_quantity": "4 drums",
            "expected_outcome": "Intact, tamper-evident seals.",
            "actual_outcome": "Two cracked and two loose seals were found.",
            "severity": "major",
        },
    },
    {
        "source": "Batch record review for Amoxicillin API batch AMX-260312 found the pH check was recorded 45 minutes after the required in-process check. Expected timing: within 15 minutes of neutralization. Actual timing: 60 minutes after neutralization. No product quantity was stated.",
        "extraction": {
            "product_name": "Amoxicillin API",
            "batch_number": "AMX-260312",
            "source_type": "batch record",
            "expected_outcome": "pH check within 15 minutes of neutralization.",
            "actual_outcome": "pH check was recorded 60 minutes after neutralization.",
            "severity": "minor",
        },
    },
    {
        "source": "QA deviation record: Product is Amoxicillin API 500 mg. Batch AMX-260312. Manufacturing date March 2026. Expiry date February 2028. Department Quality Assurance. Reported by Priya Nair. Assigned to Daniel Thomas. Equipment involved: Reactor R-204 and temperature controller TC-204. Expected outcome: temperature 78-82 C. Actual outcome: temperature reached 86 C for 10 minutes.",
        "extraction": {
            "product_name": "Amoxicillin API 500 mg",
            "batch_number": "AMX-260312",
            "manufacturing_date": "2026-03-01",
            "expiry_date": "2028-02-01",
            "source_type": "quality record",
            "department": "Quality Assurance",
            "reported_by": "Priya Nair",
            "assigned_to": "Daniel Thomas",
            "equipment_involved": "Reactor R-204 and temperature controller TC-204",
            "expected_outcome": "Temperature 78-82 C.",
            "actual_outcome": "Temperature reached 86 C for 10 minutes.",
            "severity": "major",
        },
    },
]


def format_extraction_examples() -> str:
    lines = []
    for example in RCA_EXTRACTION_EXAMPLES:
        lines.append(f"SOURCE: {example['source']}\nEXPECTED EXTRACTION: {example['extraction']}")
    return "\n\n".join(lines)
