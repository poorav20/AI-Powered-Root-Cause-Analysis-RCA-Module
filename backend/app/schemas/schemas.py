from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class DeviationSeverity(str, Enum):
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"


class DeviationStatus(str, Enum):
    OPEN = "open"
    UNDER_INVESTIGATION = "under_investigation"
    RCA_COMPLETE = "rca_complete"
    CAPA_PENDING = "capa_pending"
    CAPA_IMPLEMENTED = "capa_implemented"
    CLOSED = "closed"


class InvestigationMethod(str, Enum):
    FIVE_WHYS = "five_whys"
    FISHBONE = "fishbone"
    FAULT_TREE = "fault_tree"
    FMEA = "fmea"


class CAPAType(str, Enum):
    CORRECTIVE = "corrective"
    PREVENTIVE = "preventive"


class CAPAStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    VERIFIED = "verified"
# Input schemas
class DeviationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    manufacturing_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    severity: DeviationSeverity = DeviationSeverity.MINOR
    reported_by: Optional[str] = None
    assigned_to: Optional[str] = None
    department: Optional[str] = None
    equipment_involved: Optional[str] = None
    source_type: Optional[str] = None
    expected_outcome: Optional[str] = None
    actual_outcome: Optional[str] = None
    affected_quantity: Optional[str] = None
    impact_summary: Optional[str] = None
    raw_input_text: Optional[str] = None


class DeviationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    manufacturing_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    severity: Optional[DeviationSeverity] = None
    status: Optional[DeviationStatus] = None
    reported_by: Optional[str] = None
    assigned_to: Optional[str] = None
    department: Optional[str] = None
    equipment_involved: Optional[str] = None
    source_type: Optional[str] = None
    expected_outcome: Optional[str] = None
    actual_outcome: Optional[str] = None
    affected_quantity: Optional[str] = None
    impact_summary: Optional[str] = None


class InvestigationCreate(BaseModel):
    method: InvestigationMethod = InvestigationMethod.FIVE_WHYS
    why_1: Optional[str] = None
    why_2: Optional[str] = None
    why_3: Optional[str] = None
    why_4: Optional[str] = None
    why_5: Optional[str] = None
    man_factors: Optional[List[str]] = None
    machine_factors: Optional[List[str]] = None
    material_factors: Optional[List[str]] = None
    method_factors: Optional[List[str]] = None
    environment_factors: Optional[List[str]] = None
    measurement_factors: Optional[List[str]] = None
    root_causes: Optional[List[Dict[str, Any]]] = None
    contributing_factors: Optional[List[Dict[str, Any]]] = None
    missing_evidence: Optional[List[str]] = None
    investigation_summary: Optional[str] = None
    investigator_notes: Optional[str] = None


class InvestigationUpdate(BaseModel):
    method: Optional[InvestigationMethod] = None
    why_1: Optional[str] = None
    why_2: Optional[str] = None
    why_3: Optional[str] = None
    why_4: Optional[str] = None
    why_5: Optional[str] = None
    man_factors: Optional[List[str]] = None
    machine_factors: Optional[List[str]] = None
    material_factors: Optional[List[str]] = None
    method_factors: Optional[List[str]] = None
    environment_factors: Optional[List[str]] = None
    measurement_factors: Optional[List[str]] = None
    root_causes: Optional[List[Dict[str, Any]]] = None
    contributing_factors: Optional[List[Dict[str, Any]]] = None
    missing_evidence: Optional[List[str]] = None
    investigation_summary: Optional[str] = None
    investigator_notes: Optional[str] = None


class CAPACreate(BaseModel):
    action_type: CAPAType
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    root_cause_addressed: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None


class CAPAUpdate(BaseModel):
    action_type: Optional[CAPAType] = None
    title: Optional[str] = None
    description: Optional[str] = None
    root_cause_addressed: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    status: Optional[CAPAStatus] = None
    effectiveness_check: Optional[str] = None
    effectiveness_date: Optional[datetime] = None


# Output schemas
class DeviationResponse(BaseModel):
    id: int
    deviation_number: str
    title: str
    description: str
    product_name: Optional[str]
    batch_number: Optional[str]
    manufacturing_date: Optional[datetime]
    expiry_date: Optional[datetime]
    severity: DeviationSeverity
    status: DeviationStatus
    reported_by: Optional[str]
    reported_date: datetime
    assigned_to: Optional[str]
    department: Optional[str]
    equipment_involved: Optional[str]
    source_type: Optional[str]
    expected_outcome: Optional[str]
    actual_outcome: Optional[str]
    affected_quantity: Optional[str]
    impact_summary: Optional[str]
    raw_input_text: Optional[str]
    source_document_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class InvestigationResponse(BaseModel):
    id: int
    deviation_id: int
    method: InvestigationMethod
    why_1: Optional[str]
    why_2: Optional[str]
    why_3: Optional[str]
    why_4: Optional[str]
    why_5: Optional[str]
    man_factors: Optional[List[str]]
    machine_factors: Optional[List[str]]
    material_factors: Optional[List[str]]
    method_factors: Optional[List[str]]
    environment_factors: Optional[List[str]]
    measurement_factors: Optional[List[str]]
    root_causes: Optional[List[Dict[str, Any]]]
    contributing_factors: Optional[List[Dict[str, Any]]]
    missing_evidence: Optional[List[str]]
    investigation_summary: Optional[str]
    investigator_notes: Optional[str]
    ai_generated: bool
    ai_confidence_score: Optional[float]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CAPAResponse(BaseModel):
    id: int
    deviation_id: int
    action_type: CAPAType
    title: str
    description: str
    root_cause_addressed: Optional[str]
    assigned_to: Optional[str]
    due_date: Optional[datetime]
    completion_date: Optional[datetime]
    status: CAPAStatus
    effectiveness_check: Optional[str]
    effectiveness_date: Optional[datetime]
    ai_generated: bool
    ai_reasoning: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# AI Processing schemas
class DocumentProcessRequest(BaseModel):
    deviation_id: Optional[int] = None
    text: Optional[str] = None
    file_path: Optional[str] = None


class AIExtractionResponse(BaseModel):
    deviation_data: Dict[str, Any]
    investigation_data: Dict[str, Any]
    capa_recommendations: List[Dict[str, Any]]
    confidence_score: float
    missing_information: List[str]


class RCAWorkflowRequest(BaseModel):
    deviation_id: int
    method: InvestigationMethod = InvestigationMethod.FIVE_WHYS
    additional_context: Optional[str] = None
    model: Optional[str] = None


class RCAWorkflowResponse(BaseModel):
    investigation: InvestigationResponse
    capa_recommendations: List[CAPAResponse]
    confidence_score: float
    missing_evidence: List[str]

    class Config:
        from_attributes = True


class CopilotRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=4000)
    model: Optional[str] = None  # provider:model override, e.g. "openai:gpt-4o-mini"


class IntakeCopilotResponse(BaseModel):
    message: str
    deviation_data: Dict[str, Any]
    investigation_data: Dict[str, Any]
    capa_recommendations: List[Dict[str, Any]]
    confidence_score: float
    missing_information: List[str]


class CopilotResponse(BaseModel):
    message: str
    applied_changes: List[str]
    deviation: DeviationResponse
    investigation: InvestigationResponse


class AsyncJobResponse(BaseModel):
    """Returned when an AI task is queued as a background job.

    Poll GET /deviations/{deviation_id} and check `status` to know when the
    AI analysis has finished (status will become 'rca_complete').
    """
    message: str
    deviation_id: int
    status: str
