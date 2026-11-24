from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime, timezone
import logging
import re

from app.core.limiter import limiter
from app.db.session import get_db, SessionLocal
from app.models.models import Deviation, Investigation, CAPAAction, Document, DeviationStatus, InvestigationMethod, CAPAType, CAPAStatus
from app.schemas.schemas import (
    DeviationCreate, DeviationUpdate, DeviationResponse,
    InvestigationCreate, InvestigationUpdate, InvestigationResponse,
    CAPACreate, CAPAUpdate, CAPAResponse,
    DocumentProcessRequest, AIExtractionResponse, RCAWorkflowRequest, RCAWorkflowResponse,
    AsyncJobResponse, CopilotRequest, CopilotResponse, IntakeCopilotResponse,
)
from app.workflows.rca_workflow import rca_workflow
from app.services.document_processor import document_processor

logger = logging.getLogger(__name__)
router = APIRouter()


def generate_deviation_number(db: Session) -> str:
    """Generate unique deviation number using an advisory lock to prevent race conditions.

    Uses a PostgreSQL advisory lock keyed on the current year so only one request
    at a time can compute the next sequence number, eliminating duplicates under
    concurrent load. Falls back gracefully for non-PostgreSQL databases (e.g. in tests).
    """
    year = datetime.now(tz=timezone.utc).year
    lock_key = int(f"20{year % 100:02d}")  # stable int key per year
    try:
        db.execute(text(f"SELECT pg_advisory_xact_lock({lock_key})"))
    except Exception:
        pass  # Non-PG database (tests, SQLite) — proceed without locking
    count = db.query(Deviation).filter(
        Deviation.deviation_number.like(f"DEV-{year}-%")
    ).count()
    return f"DEV-{year}-{count + 1:04d}"


@router.post("/deviations", response_model=DeviationResponse)
def create_deviation(deviation: DeviationCreate, db: Session = Depends(get_db)):
    """Create a new deviation"""
    dev_number = generate_deviation_number(db)
    
    db_deviation = Deviation(
        deviation_number=dev_number,
        title=deviation.title,
        description=deviation.description,
        product_name=deviation.product_name,
        batch_number=deviation.batch_number,
        manufacturing_date=deviation.manufacturing_date,
        expiry_date=deviation.expiry_date,
        severity=deviation.severity,
        reported_by=deviation.reported_by,
        assigned_to=deviation.assigned_to,
        department=deviation.department,
        equipment_involved=deviation.equipment_involved,
        source_type=deviation.source_type,
        expected_outcome=deviation.expected_outcome,
        actual_outcome=deviation.actual_outcome,
        affected_quantity=deviation.affected_quantity,
        impact_summary=deviation.impact_summary,
        raw_input_text=deviation.raw_input_text,
        status=DeviationStatus.OPEN
    )
    
    db.add(db_deviation)
    db.commit()
    db.refresh(db_deviation)
    return db_deviation


@router.get("/deviations", response_model=List[DeviationResponse])
def list_deviations(
    skip: int = 0,
    limit: int = 100,
    status: Optional[DeviationStatus] = None,
    severity: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all deviations with optional filters"""
    query = db.query(Deviation)
    
    if status:
        query = query.filter(Deviation.status == status)
    if severity:
        query = query.filter(Deviation.severity == severity)
    
    return query.order_by(Deviation.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/deviations/{deviation_id}", response_model=DeviationResponse)
def get_deviation(deviation_id: int, db: Session = Depends(get_db)):
    """Get a specific deviation"""
    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")
    return deviation


@router.put("/deviations/{deviation_id}", response_model=DeviationResponse)
def update_deviation(deviation_id: int, deviation: DeviationUpdate, db: Session = Depends(get_db)):
    """Update a deviation"""
    db_deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not db_deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")
    
    update_data = deviation.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_deviation, field, value)
    
    db_deviation.updated_at = datetime.now()
    db.commit()
    db.refresh(db_deviation)
    return db_deviation


@router.post("/deviations/{deviation_id}/process-document", response_model=AIExtractionResponse)
@limiter.limit("10/minute")
async def process_document(
    request: Request,
    deviation_id: int,
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Process uploaded document or text to extract deviation information.

    Saves the document and queues AI analysis in the background so the
    HTTP response is immediate. Poll GET /deviations/{id} to track status.
    """
    # Allowed MIME types for document uploads
    ALLOWED_MIME_TYPES = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    }

    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")

    extracted_text = ""
    file_path = None

    if file:
        # Validate file type
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{file.content_type}'. Allowed: PDF, DOCX, TXT.",
            )

        file_content = await file.read()

        # Enforce size limit early
        max_size = 10 * 1024 * 1024  # 10 MB
        if len(file_content) > max_size:
            raise HTTPException(status_code=413, detail="File exceeds the 10 MB limit.")

        file_path = document_processor.save_uploaded_file(file_content, file.filename)

        # Persist the document record BEFORE invoking AI so a crash in the
        # background task does not leave orphaned files with no DB entry.
        doc = Document(
            deviation_id=deviation_id,
            filename=file.filename,
            file_path=file_path,
            file_type=file.content_type,
            file_size=len(file_content),
        )
        db.add(doc)

        # Extract text synchronously (fast — just parsing)
        extracted_text = document_processor.extract_text(file_path)
        doc.extracted_text = extracted_text
        doc.processed = True

    elif text:
        extracted_text = text

    else:
        raise HTTPException(status_code=400, detail="Either file or text must be provided")

    # Persist raw input and mark as under investigation before firing AI
    deviation.raw_input_text = extracted_text
    deviation.source_document_path = file_path
    deviation.status = DeviationStatus.UNDER_INVESTIGATION
    db.commit()  # Commit document + deviation update before AI persistence

    # Run the workflow once for an immediate, reviewable AI result. The same
    # result is handed to the background persistence task so the UI can show
    # extracted fields without making the user wait for a second request.
    workflow_result = rca_workflow.run(extracted_text)
    background_tasks.add_task(
        _run_rca_workflow_background,
        deviation_id=deviation_id,
        extracted_text=extracted_text,
        workflow_result=workflow_result,
    )

    # Return the AI result immediately; suggestions remain editable until saved.
    return AIExtractionResponse(
        deviation_data=workflow_result["deviation_data"],
        investigation_data=workflow_result["investigation_data"],
        capa_recommendations=workflow_result["capa_recommendations"],
        confidence_score=workflow_result["confidence_score"],
        missing_information=workflow_result["missing_information"],
    )


def _run_rca_workflow_background(deviation_id: int, extracted_text: str, workflow_result=None) -> None:
    """Background task: runs the LangGraph RCA workflow and persists results.

    Uses its own DB session so it is independent of the request session.
    """
    db = SessionLocal()
    try:
        deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
        if not deviation:
            logger.error("Background RCA: deviation %s not found", deviation_id)
            return

        result = workflow_result or rca_workflow.run(extracted_text)

        dev_data = result["deviation_data"]
        deviation.title = dev_data.get("title", deviation.title)
        deviation.description = dev_data.get("description", deviation.description)
        deviation.product_name = dev_data.get("product_name", deviation.product_name)
        deviation.batch_number = dev_data.get("batch_number", deviation.batch_number)
        deviation.manufacturing_date = dev_data.get("manufacturing_date", deviation.manufacturing_date)
        deviation.expiry_date = dev_data.get("expiry_date", deviation.expiry_date)
        deviation.equipment_involved = dev_data.get("equipment_involved", deviation.equipment_involved)
        deviation.reported_by = dev_data.get("reported_by", deviation.reported_by)
        deviation.assigned_to = dev_data.get("assigned_to", deviation.assigned_to)
        deviation.department = dev_data.get("department", deviation.department)
        deviation.source_type = dev_data.get("source_type", deviation.source_type)
        deviation.expected_outcome = dev_data.get("expected_outcome", deviation.expected_outcome)
        deviation.actual_outcome = dev_data.get("actual_outcome", deviation.actual_outcome)
        deviation.affected_quantity = dev_data.get("affected_quantity", deviation.affected_quantity)
        deviation.impact_summary = dev_data.get("impact_summary", deviation.impact_summary)

        inv_data = result["investigation_data"]
        investigation = Investigation(
            deviation_id=deviation_id,
            method=InvestigationMethod(inv_data.get("method", "five_whys")),
            why_1=inv_data.get("why_1"),
            why_2=inv_data.get("why_2"),
            why_3=inv_data.get("why_3"),
            why_4=inv_data.get("why_4"),
            why_5=inv_data.get("why_5"),
            man_factors=inv_data.get("man_factors", []),
            machine_factors=inv_data.get("machine_factors", []),
            material_factors=inv_data.get("material_factors", []),
            method_factors=inv_data.get("method_factors", []),
            environment_factors=inv_data.get("environment_factors", []),
            measurement_factors=inv_data.get("measurement_factors", []),
            root_causes=inv_data.get("root_causes", []),
            contributing_factors=inv_data.get("contributing_factors", []),
            missing_evidence=inv_data.get("missing_evidence", []),
            investigation_summary=inv_data.get("investigation_summary"),
            ai_generated=True,
            ai_confidence_score=result["confidence_score"],
        )
        db.add(investigation)

        for capa_data in result["capa_recommendations"]:
            action_type_val = capa_data.get("action_type", "corrective")
            if hasattr(action_type_val, "value"):
                action_type_val = action_type_val.value
            capa = CAPAAction(
                deviation_id=deviation_id,
                action_type=CAPAType(str(action_type_val).lower()),
                title=capa_data.get("title"),
                description=capa_data.get("description"),
                root_cause_addressed=capa_data.get("root_cause_addressed"),
                ai_generated=True,
                ai_reasoning=(
                    f"Priority: {capa_data.get('priority', 'medium')}, "
                    f"Effort: {capa_data.get('estimated_effort', 'medium')}"
                ),
                status=CAPAStatus.pending,
            )
            db.add(capa)

        deviation.status = DeviationStatus.RCA_COMPLETE
        db.commit()
        logger.info("Background RCA complete for deviation %s", deviation_id)
    except Exception:
        logger.exception("Background RCA failed for deviation %s", deviation_id)
        db.rollback()
    finally:
        db.close()


@router.post("/deviations/{deviation_id}/run-rca", response_model=RCAWorkflowResponse)
@limiter.limit("10/minute")
def run_rca_workflow(http_request: Request, deviation_id: int, request: RCAWorkflowRequest, db: Session = Depends(get_db)):
    """Run RCA workflow on existing deviation"""
    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")
    
    if not deviation.raw_input_text and not deviation.description:
        raise HTTPException(status_code=400, detail="No input text or description available for analysis")
    
    # Run workflow with additional context
    text = deviation.raw_input_text or f"Title: {deviation.title}\nDescription: {deviation.description}\nProduct: {deviation.product_name or ''}\nBatch: {deviation.batch_number or ''}\nEquipment: {deviation.equipment_involved or ''}"
    if request.additional_context:
        text += f"\n\nAdditional Context: {request.additional_context}"
    
    result = rca_workflow.run(text, model=request.model)
    dev_data = result["deviation_data"]
    for field in ["title", "description", "product_name", "batch_number", "severity", "equipment_involved", "reported_by", "assigned_to", "department", "manufacturing_date", "expiry_date", "source_type", "expected_outcome", "actual_outcome", "affected_quantity", "impact_summary"]:
        if dev_data.get(field) is not None:
            setattr(deviation, field, dev_data[field])
    
    # Update or create investigation
    investigation = db.query(Investigation).filter(Investigation.deviation_id == deviation_id).first()
    inv_data = result["investigation_data"]
    
    if investigation:
        investigation.method = InvestigationMethod(inv_data.get("method", "five_whys"))
        investigation.why_1 = inv_data.get("why_1")
        investigation.why_2 = inv_data.get("why_2")
        investigation.why_3 = inv_data.get("why_3")
        investigation.why_4 = inv_data.get("why_4")
        investigation.why_5 = inv_data.get("why_5")
        investigation.man_factors = inv_data.get("man_factors", [])
        investigation.machine_factors = inv_data.get("machine_factors", [])
        investigation.material_factors = inv_data.get("material_factors", [])
        investigation.method_factors = inv_data.get("method_factors", [])
        investigation.environment_factors = inv_data.get("environment_factors", [])
        investigation.measurement_factors = inv_data.get("measurement_factors", [])
        investigation.root_causes = inv_data.get("root_causes", [])
        investigation.contributing_factors = inv_data.get("contributing_factors", [])
        investigation.missing_evidence = inv_data.get("missing_evidence", [])
        investigation.investigation_summary = inv_data.get("investigation_summary")
        investigation.ai_generated = True
        investigation.ai_confidence_score = result["confidence_score"]
        investigation.updated_at = datetime.now()
    else:
        investigation = Investigation(
            deviation_id=deviation_id,
            method=InvestigationMethod(inv_data.get("method", "five_whys")),
            why_1=inv_data.get("why_1"),
            why_2=inv_data.get("why_2"),
            why_3=inv_data.get("why_3"),
            why_4=inv_data.get("why_4"),
            why_5=inv_data.get("why_5"),
            man_factors=inv_data.get("man_factors", []),
            machine_factors=inv_data.get("machine_factors", []),
            material_factors=inv_data.get("material_factors", []),
            method_factors=inv_data.get("method_factors", []),
            environment_factors=inv_data.get("environment_factors", []),
            measurement_factors=inv_data.get("measurement_factors", []),
            root_causes=inv_data.get("root_causes", []),
            contributing_factors=inv_data.get("contributing_factors", []),
            missing_evidence=inv_data.get("missing_evidence", []),
            investigation_summary=inv_data.get("investigation_summary"),
            ai_generated=True,
            ai_confidence_score=result["confidence_score"]
        )
        db.add(investigation)
    
    # Update or create CAPA recommendations
    # Delete existing AI-generated CAPAs
    db.query(CAPAAction).filter(
        CAPAAction.deviation_id == deviation_id,
        CAPAAction.ai_generated == True
    ).delete()
    
    capa_records = []
    for capa_data in result["capa_recommendations"]:
        action_type_val = capa_data.get("action_type", "corrective")
        if hasattr(action_type_val, "value"):
            action_type_val = action_type_val.value
        capa = CAPAAction(
            deviation_id=deviation_id,
            action_type=CAPAType(str(action_type_val).lower()),
            title=capa_data.get("title"),
            description=capa_data.get("description"),
            root_cause_addressed=capa_data.get("root_cause_addressed"),
            ai_generated=True,
            ai_reasoning=f"Priority: {capa_data.get('priority', 'medium')}, Effort: {capa_data.get('estimated_effort', 'medium')}",
            status=CAPAStatus.pending
        )
        db.add(capa)
        capa_records.append(capa)
    
    deviation.status = DeviationStatus.RCA_COMPLETE
    db.commit()
    db.refresh(investigation)
    
    return RCAWorkflowResponse(
        investigation=investigation,
        capa_recommendations=capa_records,
        confidence_score=result["confidence_score"],
        missing_evidence=result["missing_information"]
    )


@router.post("/intake/copilot", response_model=IntakeCopilotResponse)
@limiter.limit("20/minute")
def intake_copilot(request: Request, copilot_request: CopilotRequest):
    """Extract a new deviation into a reviewable form without saving it."""
    result = rca_workflow.run(copilot_request.message.strip(), model=copilot_request.model)
    return IntakeCopilotResponse(
        message="I mapped the source record into the deviation form. Review every AI suggestion and create the record when it is accurate.",
        deviation_data=result["deviation_data"],
        investigation_data=result["investigation_data"],
        capa_recommendations=result["capa_recommendations"],
        confidence_score=result["confidence_score"],
        missing_information=result["missing_information"],
    )


@router.post("/deviations/{deviation_id}/copilot", response_model=CopilotResponse)
@limiter.limit("20/minute")
def copilot_update(request: Request, deviation_id: int, copilot_request: CopilotRequest, db: Session = Depends(get_db)):
    """Apply a natural-language investigator instruction without replacing unrelated fields."""
    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    investigation = db.query(Investigation).filter(Investigation.deviation_id == deviation_id).first()
    if not deviation or not investigation:
        raise HTTPException(status_code=404, detail="Deviation investigation not found")

    message = copilot_request.message.strip()
    lower = message.lower()
    changes = []

    batch_match = re.search(r"(?:batch|lot)(?:\s*(?:number|no|#))?\s*(?:is|=|:)\s*([A-Z0-9][A-Z0-9_-]{3,30})", message, re.I)
    if batch_match:
        deviation.batch_number = batch_match.group(1).upper()
        changes.append(f"Batch/lot updated to {deviation.batch_number}")

    severity_match = re.search(r"\b(critical|major|minor)\b", lower)
    if any(token in lower for token in ["severity", "classify", "risk"] ) and severity_match:
        deviation.severity = severity_match.group(1)
        changes.append(f"Severity updated to {deviation.severity}")

    product_match = re.search(r"(?:product|api)(?:\s+name)?\s*(?:is|=|:)\s*([^,.;\n]+)", message, re.I)
    if product_match:
        deviation.product_name = product_match.group(1).strip()
        changes.append(f"Product updated to {deviation.product_name}")

    quantity_match = re.search(r"(?:affected\s+quantity|quantity)\s*(?:is|=|:)\s*([^.;\n]+)", message, re.I)
    if quantity_match:
        note = f"Affected quantity: {quantity_match.group(1).strip()}"
        existing = investigation.investigator_notes or ""
        investigation.investigator_notes = f"{existing}\n{note}".strip()
        changes.append(note)

    if any(token in lower for token in ["analyze", "run rca", "reassess", "extract"]):
        source = deviation.raw_input_text or deviation.description
        result = rca_workflow.run(f"{source}\n\nInvestigator instruction: {message}", model=copilot_request.model)
        inv_data = result["investigation_data"]
        for field in ["why_1", "why_2", "why_3", "why_4", "why_5", "man_factors", "machine_factors", "material_factors", "method_factors", "environment_factors", "measurement_factors", "root_causes", "contributing_factors", "missing_evidence", "investigation_summary"]:
            setattr(investigation, field, inv_data.get(field))
        investigation.ai_generated = True
        investigation.ai_confidence_score = result["confidence_score"]
        changes.append("RCA suggestions regenerated from the source record")

    if not changes:
        changes.append("Instruction recorded for investigator review")
    note = investigation.investigator_notes or ""
    if not any(message in line for line in note.splitlines()):
        investigation.investigator_notes = f"{note}\nCopilot instruction: {message}".strip()

    deviation.updated_at = datetime.now()
    investigation.updated_at = datetime.now()
    db.commit()
    db.refresh(deviation)
    db.refresh(investigation)
    return CopilotResponse(
        message="I updated the investigation workspace. Review the highlighted changes before saving approval.",
        applied_changes=changes,
        deviation=deviation,
        investigation=investigation,
    )


# Investigation endpoints
@router.get("/deviations/{deviation_id}/investigation", response_model=InvestigationResponse)
def get_investigation(deviation_id: int, db: Session = Depends(get_db)):
    """Get investigation for a deviation"""
    investigation = db.query(Investigation).filter(Investigation.deviation_id == deviation_id).first()
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return investigation


@router.put("/deviations/{deviation_id}/investigation", response_model=InvestigationResponse)
def update_investigation(deviation_id: int, investigation: InvestigationUpdate, db: Session = Depends(get_db)):
    """Update investigation (user review/edit)"""
    db_investigation = db.query(Investigation).filter(Investigation.deviation_id == deviation_id).first()
    if not db_investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    update_data = investigation.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_investigation, field, value)
    
    db_investigation.updated_at = datetime.now()
    db_investigation.ai_generated = False  # Mark as user-edited
    db.commit()
    db.refresh(db_investigation)
    return db_investigation


# CAPA endpoints
@router.get("/deviations/{deviation_id}/capa", response_model=List[CAPAResponse])
def list_capa_actions(deviation_id: int, db: Session = Depends(get_db)):
    """List all CAPA actions for a deviation"""
    return db.query(CAPAAction).filter(CAPAAction.deviation_id == deviation_id).all()


@router.post("/deviations/{deviation_id}/capa", response_model=CAPAResponse)
def create_capa_action(deviation_id: int, capa: CAPACreate, db: Session = Depends(get_db)):
    """Create a new CAPA action"""
    deviation = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not deviation:
        raise HTTPException(status_code=404, detail="Deviation not found")
    
    action_type_val = capa.action_type.value if hasattr(capa.action_type, "value") else str(capa.action_type)
    db_capa = CAPAAction(
        deviation_id=deviation_id,
        action_type=CAPAType(action_type_val.lower()),
        title=capa.title,
        description=capa.description,
        root_cause_addressed=capa.root_cause_addressed,
        assigned_to=capa.assigned_to,
        due_date=capa.due_date,
        status=CAPAStatus.pending
    )
    
    db.add(db_capa)
    deviation.status = DeviationStatus.CAPA_PENDING
    db.commit()
    db.refresh(db_capa)
    return db_capa


@router.put("/capa/{capa_id}", response_model=CAPAResponse)
def update_capa_action(capa_id: int, capa: CAPAUpdate, db: Session = Depends(get_db)):
    """Update a CAPA action"""
    db_capa = db.query(CAPAAction).filter(CAPAAction.id == capa_id).first()
    if not db_capa:
        raise HTTPException(status_code=404, detail="CAPA action not found")
    
    update_data = capa.model_dump(exclude_unset=True)
    if "action_type" in update_data and update_data["action_type"]:
        at_val = update_data["action_type"]
        update_data["action_type"] = CAPAType(at_val.value.lower() if hasattr(at_val, "value") else str(at_val).lower())
    if "status" in update_data and update_data["status"]:
        st_val = update_data["status"]
        update_data["status"] = CAPAStatus(st_val.value.lower() if hasattr(st_val, "value") else str(st_val).lower())
    for field, value in update_data.items():
        setattr(db_capa, field, value)
    
    db_capa.updated_at = datetime.now()
    
    # If completed, check if all CAPAs are done
    if capa.status == "completed":
        db_capa.completion_date = datetime.now()
        
        # Check if all CAPAs for this deviation are completed
        pending_capas = db.query(CAPAAction).filter(
            CAPAAction.deviation_id == db_capa.deviation_id,
            CAPAAction.status.in_(["pending", "in_progress"])
        ).count()
        
        if pending_capas == 0:
            deviation = db.query(Deviation).filter(Deviation.id == db_capa.deviation_id).first()
            if deviation:
                deviation.status = DeviationStatus.CAPA_IMPLEMENTED
    
    db.commit()
    db.refresh(db_capa)
    return db_capa


@router.get("/llm/providers")
def list_llm_providers():
    """List available LLM providers and models for form filling by prompt."""
    from app.core.llm_provider import llm_provider
    from app.core.config import settings
    available = llm_provider._available_providers()
    return {
        "providers": available,
        "primary": settings.LLM_PROVIDER,
        "models": {prov: llm_provider.PROVIDER_MODELS[prov]() for prov in available},
        "fallback_chain": [f"{c['provider']}:{c['model']}" for c in llm_provider._fallback_chain()],
    }
