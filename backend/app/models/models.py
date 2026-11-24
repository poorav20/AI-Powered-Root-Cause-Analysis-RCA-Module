from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, JSON, Boolean, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum


class DeviationStatus(str, enum.Enum):
    open = "open"
    under_investigation = "under_investigation"
    rca_complete = "rca_complete"
    capa_pending = "capa_pending"
    capa_implemented = "capa_implemented"
    closed = "closed"
    OPEN = "open"
    UNDER_INVESTIGATION = "under_investigation"
    RCA_COMPLETE = "rca_complete"
    CAPA_PENDING = "capa_pending"
    CAPA_IMPLEMENTED = "capa_implemented"
    CLOSED = "closed"


class DeviationSeverity(str, enum.Enum):
    critical = "critical"
    major = "major"
    minor = "minor"
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"


class InvestigationMethod(str, enum.Enum):
    five_whys = "five_whys"
    fishbone = "fishbone"
    fault_tree = "fault_tree"
    fmea = "fmea"
    FIVE_WHYS = "five_whys"
    FISHBONE = "fishbone"
    FAULT_TREE = "fault_tree"
    FMEA = "fmea"


class CAPAType(str, enum.Enum):
    corrective = "corrective"
    preventive = "preventive"
    CORRECTIVE = "corrective"
    PREVENTIVE = "preventive"


class CAPAStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    verified = "verified"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    VERIFIED = "verified"


class Deviation(Base):
    __tablename__ = "deviations"
    
    id = Column(Integer, primary_key=True, index=True)
    deviation_number = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    product_name = Column(String(255))
    batch_number = Column(String(100))
    manufacturing_date = Column(DateTime)
    expiry_date = Column(DateTime)
    severity = Column(Enum(DeviationSeverity, values_callable=lambda x: [e.value for e in x], name="deviation_severity"), default=DeviationSeverity.minor)
    status = Column(Enum(DeviationStatus, values_callable=lambda x: [e.value for e in x], name="deviation_status"), default=DeviationStatus.open)
    reported_by = Column(String(255))
    reported_date = Column(DateTime, default=func.now())
    assigned_to = Column(String(255))
    department = Column(String(100))
    equipment_involved = Column(Text)
    source_type = Column(String(80))
    expected_outcome = Column(Text)
    actual_outcome = Column(Text)
    affected_quantity = Column(String(120))
    impact_summary = Column(Text)
    raw_input_text = Column(Text)  # Original document/text/email input
    source_document_path = Column(String(500))  # Path to uploaded PDF/document
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    investigation = relationship("Investigation", back_populates="deviation", uselist=False)
    capa_actions = relationship("CAPAAction", back_populates="deviation")


class Investigation(Base):
    __tablename__ = "investigations"
    
    id = Column(Integer, primary_key=True, index=True)
    deviation_id = Column(Integer, ForeignKey("deviations.id"), nullable=False)
    method = Column(Enum(InvestigationMethod, values_callable=lambda x: [e.value for e in x], name="investigation_method"), default=InvestigationMethod.five_whys)
    
    # 5 Whys fields
    why_1 = Column(Text)
    why_2 = Column(Text)
    why_3 = Column(Text)
    why_4 = Column(Text)
    why_5 = Column(Text)
    
    # Fishbone fields (6M categories)
    man_factors = Column(JSON)  # List of factors
    machine_factors = Column(JSON)
    material_factors = Column(JSON)
    method_factors = Column(JSON)
    environment_factors = Column(JSON)
    measurement_factors = Column(JSON)
    
    # Root cause analysis
    root_causes = Column(JSON)  # List of identified root causes with evidence
    contributing_factors = Column(JSON)  # List of contributing factors
    missing_evidence = Column(JSON)  # List of missing evidence items
    investigation_summary = Column(Text)
    investigator_notes = Column(Text)
    ai_generated = Column(Boolean, default=False)
    ai_confidence_score = Column(Float)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    deviation = relationship("Deviation", back_populates="investigation")


class CAPAAction(Base):
    __tablename__ = "capa_actions"
    
    id = Column(Integer, primary_key=True, index=True)
    deviation_id = Column(Integer, ForeignKey("deviations.id"), nullable=False)
    action_type = Column(Enum(CAPAType, values_callable=lambda x: [e.value for e in x], name="capa_type"), nullable=False, default=CAPAType.corrective)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    root_cause_addressed = Column(String(255))
    assigned_to = Column(String(255))
    due_date = Column(DateTime)
    completion_date = Column(DateTime, nullable=True)
    status = Column(Enum(CAPAStatus, values_callable=lambda x: [e.value for e in x], name="capa_status"), default=CAPAStatus.pending)
    effectiveness_check = Column(Text)
    effectiveness_date = Column(DateTime, nullable=True)
    ai_generated = Column(Boolean, default=False)
    ai_reasoning = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    deviation = relationship("Deviation", back_populates="capa_actions")


class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    deviation_id = Column(Integer, ForeignKey("deviations.id"), nullable=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))
    file_size = Column(Integer)
    extracted_text = Column(Text)
    upload_date = Column(DateTime, default=func.now())
    processed = Column(Boolean, default=False)
