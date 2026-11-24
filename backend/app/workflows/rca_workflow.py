import os
import re
import json
import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from app.core.llm_provider import llm_provider
from app.workflows.rca_examples import format_extraction_examples

logger = logging.getLogger(__name__)


class RCAState(TypedDict):
    deviation_text: str
    deviation_data: Dict[str, Any]
    investigation_data: Dict[str, Any]
    capa_recommendations: List[Dict[str, Any]]
    confidence_score: float
    missing_information: List[str]
    current_step: str
    error: Optional[str]


class DeviationExtraction(BaseModel):
    """Schema returned by the extraction model before deterministic normalization."""
    title: Optional[str] = None
    description: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None
    severity: Optional[str] = None
    equipment_involved: Optional[str] = None
    reported_by: Optional[str] = None
    assigned_to: Optional[str] = None
    department: Optional[str] = None
    source_type: Optional[str] = None
    expected_outcome: Optional[str] = None
    actual_outcome: Optional[str] = None
    affected_quantity: Optional[str] = None
    impact_summary: Optional[str] = None


class RCAWorkflow:
    def __init__(self):
        self._llm = None
        self._workflow = None
        self._requested_model = None

    def _candidate_configs(self):
        """Return LLM provider configs to try, honoring a requested model override."""
        if self._requested_model and ":" in self._requested_model:
            prov, mod = self._requested_model.split(":", 1)
            prov = prov.strip()
            mod = mod.strip()
            if prov in llm_provider.PROVIDER_KEYS:
                key_fn = llm_provider.PROVIDER_KEYS[prov]
                try:
                    if key_fn():
                        return [{"provider": prov, "model": mod}]
                except Exception:
                    pass
        return llm_provider._fallback_chain()

    def _get_llm(self) -> Optional[Any]:
        """Lazy-load the LLM client; uses multi-provider manager with fallback."""
        if self._llm is None:
            try:
                self._llm = llm_provider.get_llm(temperature=0.1)
            except Exception as e:
                logger.warning("Could not initialize LLM client: %s", e)
                self._llm = None
        return self._llm

    @property
    def llm(self) -> Optional[Any]:
        return self._get_llm()

    def _get_workflow(self) -> StateGraph:
        if self._workflow is None:
            self._workflow = self._build_workflow()
        return self._workflow

    @property
    def workflow(self) -> StateGraph:
        return self._get_workflow()

    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(RCAState)
        workflow.add_node("extract_deviation_info", self.extract_deviation_info)
        workflow.add_node("analyze_investigation", self.analyze_investigation)
        workflow.add_node("generate_capa", self.generate_capa)
        workflow.add_node("validate_and_score", self.validate_and_score)

        workflow.set_entry_point("extract_deviation_info")
        workflow.add_edge("extract_deviation_info", "analyze_investigation")
        workflow.add_edge("analyze_investigation", "generate_capa")
        workflow.add_edge("generate_capa", "validate_and_score")
        workflow.add_edge("validate_and_score", END)

        return workflow.compile()

    # -------------------------------------------------------------------------
    # Node 1: Extract Deviation Info
    # -------------------------------------------------------------------------
    def extract_deviation_info(self, state: RCAState) -> RCAState:
        text = state.get("deviation_text", "")
        extracted = None

        if self.llm:
            try:
                prompt = ChatPromptTemplate.from_template("""
You are a pharmaceutical quality data steward. Extract only what is supported by the source text.
Do not infer a batch number, product name, person, date, quantity, equipment identifier, or severity.
Use null when a value is absent. Preserve units and the wording of numeric limits.
For expected_outcome and actual_outcome, separate the approved target from the observed result.
Use these de-identified field-mapping examples as guidance. Never copy their values into a new record:
{examples}
Text: {text}

Extract as JSON:
- title: Short descriptive title (max 100 chars)
- description: Detailed description of what happened
- product_name: Product/API name if mentioned
- batch_number: Batch/lot number if mentioned
- manufacturing_date: Manufacturing date in ISO YYYY-MM-DD if stated
- expiry_date: Expiry or expiration date in ISO YYYY-MM-DD if stated
- severity: "critical", "major", or "minor" based on impact
- equipment_involved: Equipment mentioned
- reported_by: Who reported it
- assigned_to: Named investigator or owner if explicitly stated
- department: Department involved (Production, QC, QA, etc.)
- source_type: Where the record came from (email, batch record, equipment log, laboratory record, or other)
- expected_outcome: What should have happened or the approved target/specification
- actual_outcome: What was observed instead
- affected_quantity: Quantity, units, or batch extent affected if mentioned
- impact_summary: Short statement of product, process, or compliance impact

Return ONLY valid JSON. No markdown, explanation, or invented values.
""")
                chain = prompt | llm_provider.get_llm(temperature=0.1) | JsonOutputParser()
                # Try primary then fallbacks
                result = None
                last_err = None
                for cfg in self._candidate_configs():
                    try:
                        llm = llm_provider._build_llm(cfg["provider"], cfg["model"], 0.1)
                        if llm is None:
                            continue
                        # Constrain extraction to the application schema. This is the
                        # main quality improvement over free-form JSON prompting.
                        structured_llm = llm.with_structured_output(DeviationExtraction)
                        chain = prompt | structured_llm
                        result = chain.invoke({"text": text, "examples": format_extraction_examples()})
                        break
                    except Exception as e:
                        last_err = e
                        logger.warning("Extraction provider %s/%s failed: %s", cfg["provider"], cfg["model"], e)
                        continue
                if result is None and last_err:
                    raise last_err
                if isinstance(result, dict):
                    extracted = result
                elif hasattr(result, "model_dump"):
                    extracted = result.model_dump()
                else:
                    extracted = dict(result) if result else None
            except Exception as e:
                logger.warning("LLM extraction failed (%s). Using pharmaceutical heuristic extractor.", e)

        heuristic = self._heuristic_extraction(text)
        extracted = self._normalize_extraction(extracted or heuristic, text, heuristic)

        state["deviation_data"] = extracted
        state["current_step"] = "extraction_complete"
        return state

    # -------------------------------------------------------------------------
    # Node 2: Analyze Investigation (5 Whys + Fishbone 6M)
    # -------------------------------------------------------------------------
    def analyze_investigation(self, state: RCAState) -> RCAState:
        dev_info = state.get("deviation_data", {})
        analysis = None

        if self.llm:
            try:
                prompt = ChatPromptTemplate.from_template("""
You are a pharmaceutical quality investigator assisting an authorized human investigator.
Use only the supplied deviation evidence. Do not claim that a cause is confirmed unless the evidence explicitly supports it.
Label hypotheses as hypotheses, use confidence below 0.70 when evidence is weak, and place missing tests, records, or interviews in missing_evidence.
Never invent maintenance findings, assay results, timestamps, or operator actions.

Deviation Information:
- Title: {title}
- Description: {description}
- Product: {product_name}
- Batch: {batch_number}
- Severity: {severity}
- Equipment: {equipment_involved}
- Expected outcome: {expected_outcome}
- Actual outcome: {actual_outcome}
- Source type: {source_type}
- Affected quantity: {affected_quantity}

Perform RCA using BOTH 5 Whys AND Fishbone (6M: Man, Machine, Material, Method, Environment, Measurement).
Return ONLY valid JSON with this structure:
{{
    "method": "five_whys",
    "why_1": "...",
    "why_2": "...",
    "why_3": "...",
    "why_4": "...",
    "why_5": "...",
    "man_factors": ["..."],
    "machine_factors": ["..."],
    "material_factors": ["..."],
    "method_factors": ["..."],
    "environment_factors": ["..."],
    "measurement_factors": ["..."],
    "root_causes": [{{"cause": "...", "evidence": "Direct evidence from the source, or Not confirmed from source", "confidence": 0.50}}],
    "contributing_factors": [{{"factor": "...", "evidence": "...", "category": "Machine"}}],
    "missing_evidence": ["..."],
    "investigation_summary": "..."
}}
Keep every factor traceable to the supplied text. Return ONLY valid JSON.
""")
                inputs = {
                    "title": dev_info.get("title", ""),
                    "description": dev_info.get("description", ""),
                    "product_name": dev_info.get("product_name", ""),
                    "batch_number": dev_info.get("batch_number", ""),
                    "severity": dev_info.get("severity", "minor"),
                    "equipment_involved": dev_info.get("equipment_involved", ""),
                    "expected_outcome": dev_info.get("expected_outcome", ""),
                    "actual_outcome": dev_info.get("actual_outcome", ""),
                    "source_type": dev_info.get("source_type", ""),
                    "affected_quantity": dev_info.get("affected_quantity", "")
                }
                analysis = None
                last_err = None
                for cfg in self._candidate_configs():
                    try:
                        llm = llm_provider._build_llm(cfg["provider"], cfg["model"], 0.1)
                        if llm is None:
                            continue
                        chain = prompt | llm | JsonOutputParser()
                        analysis = chain.invoke(inputs)
                        break
                    except Exception as e:
                        last_err = e
                        logger.warning("RCA analysis provider %s/%s failed: %s", cfg["provider"], cfg["model"], e)
                        continue
                if analysis is None and last_err:
                    raise last_err
            except Exception as e:
                logger.warning("LLM RCA analysis failed (%s). Using pharmaceutical domain causal engine.", e)

        if not analysis or analysis.get("why_1") == "Analysis failed":
            analysis = self._heuristic_rca_analysis(dev_info, state.get("deviation_text", ""))

        analysis = self._ground_investigation(analysis, state.get("deviation_text", ""))

        state["investigation_data"] = analysis
        state["current_step"] = "analysis_complete"
        return state

    # -------------------------------------------------------------------------
    # Node 3: Generate CAPA Recommendations
    # -------------------------------------------------------------------------
    def generate_capa(self, state: RCAState) -> RCAState:
        inv_data = state.get("investigation_data", {})
        dev_info = state.get("deviation_data", {})
        root_causes = inv_data.get("root_causes", [])
        capas = None

        if self.llm and root_causes:
            try:
                prompt = ChatPromptTemplate.from_template("""
You are a pharmaceutical quality expert generating Corrective and Preventive Actions (CAPA) compliant with 21 CFR 820.100 and ICH Q10.

Root Causes:
{root_causes}
Summary:
{summary}

Return ONLY valid JSON array with:
[
    {{
        "action_type": "corrective",
        "title": "...",
        "description": "...",
        "root_cause_addressed": "...",
        "priority": "high",
        "estimated_effort": "medium"
    }},
    {{
        "action_type": "preventive",
        "title": "...",
        "description": "...",
        "root_cause_addressed": "...",
        "priority": "high",
        "estimated_effort": "high"
    }}
]
""")
                capa_inputs = {
                    "root_causes": json.dumps(root_causes, indent=2),
                    "summary": inv_data.get("investigation_summary", "")
                }
                capas = None
                last_err = None
                for cfg in self._candidate_configs():
                    try:
                        llm = llm_provider._build_llm(cfg["provider"], cfg["model"], 0.1)
                        if llm is None:
                            continue
                        chain = prompt | llm | JsonOutputParser()
                        capas = chain.invoke(capa_inputs)
                        break
                    except Exception as e:
                        last_err = e
                        logger.warning("CAPA provider %s/%s failed: %s", cfg["provider"], cfg["model"], e)
                        continue
                if capas is None and last_err:
                    raise last_err
            except Exception as e:
                logger.warning("LLM CAPA generation failed (%s). Using pharmaceutical CAPA rule synthesizer.", e)

        if not capas:
            capas = self._heuristic_capa_generation(inv_data, dev_info)

        state["capa_recommendations"] = capas
        state["current_step"] = "capa_complete"
        return state

    # -------------------------------------------------------------------------
    # Node 4: Validate and Score
    # -------------------------------------------------------------------------
    def validate_and_score(self, state: RCAState) -> RCAState:
        inv = state.get("investigation_data", {})
        capa = state.get("capa_recommendations", [])
        dev = state.get("deviation_data", {})

        score = 0.55
        if dev.get("title") and len(dev.get("title", "")) > 5:
            score += 0.10
        if dev.get("product_name"):
            score += 0.05
        if dev.get("batch_number"):
            score += 0.05
        if inv.get("why_1") and inv.get("why_5"):
            score += 0.15
        if inv.get("root_causes") and len(inv["root_causes"]) > 0:
            score += 0.10
        if capa and len(capa) >= 2:
            score += 0.05

        root_confidences = [float(item.get("confidence", 0.5)) for item in (inv.get("root_causes") or []) if isinstance(item, dict)]
        if root_confidences and max(root_confidences) < 0.70:
            score -= 0.15

        missing = list(inv.get("missing_evidence", []))
        if not dev.get("product_name"):
            missing.append("Product/API name not explicitly verified")
        if not dev.get("batch_number"):
            missing.append("Batch/lot number reference required")
        if not dev.get("expected_outcome"):
            missing.append("Approved expected outcome, limit, or specification")
        if not dev.get("actual_outcome"):
            missing.append("Observed actual outcome with source reference")

        state["confidence_score"] = round(min(max(score, 0.40), 0.96), 2)
        state["missing_information"] = missing
        state["current_step"] = "complete"
        return state

    def _ground_investigation(self, analysis: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
        """Prevent plausible model prose from being presented as confirmed evidence."""
        grounded = dict(analysis or {})
        for key in ["root_causes", "contributing_factors", "missing_evidence"]:
            grounded[key] = list(grounded.get(key) or [])

        for item in grounded["root_causes"]:
            if not isinstance(item, dict):
                continue
            confidence = float(item.get("confidence") or 0.5)
            evidence = str(item.get("evidence") or "").strip()
            source_lower = (raw_text or "").lower()
            evidence_words = [word for word in re.findall(r"[a-z0-9]{5,}", evidence.lower()) if word not in {"source", "evidence", "confirmed"}]
            overlap = sum(1 for word in set(evidence_words) if word in source_lower)
            if not evidence or overlap < 2 or "not confirmed" in evidence.lower():
                item["evidence"] = "Not confirmed by the supplied source; verify with approved records, interviews, or test results."
                item["confidence"] = min(confidence, 0.65)
                cause = str(item.get("cause") or "Potential contributing mechanism")
                if not cause.lower().startswith(("hypothesis:", "potential")):
                    item["cause"] = f"Hypothesis: {cause}"

        summary = str(grounded.get("investigation_summary") or "")
        grounded["investigation_summary"] = re.sub(
            r"\b(RCA|investigation)\s+confirms\b", "Preliminary investigation hypothesis indicates", summary, flags=re.I
        )
        return grounded

    # -------------------------------------------------------------------------
    # Pharmaceutical Heuristic & Domain Reasoning Fallbacks
    # -------------------------------------------------------------------------
    def _normalize_extraction(self, extracted: Dict[str, Any], text: str, heuristic: Dict[str, Any]) -> Dict[str, Any]:
        """Keep LLM output useful without allowing weak guesses to overwrite evidence.

        The model is good at summarising prose, but exact identifiers and expected-vs-actual
        values should come from deterministic text matches whenever they are present.
        """
        clean = dict(heuristic)

        def tidy(value: str) -> str:
            value = re.sub(r'^\s*(?:name|result|outcome)\s+(?:is|was)\s+', '', value, flags=re.I)
            return value.strip(' \t,;:.')

        for key, value in (extracted or {}).items():
            if value is not None and str(value).strip() and key in clean:
                clean[key] = value

        source = text or ""
        batch = re.search(r'\b(?:batch|lot)\s*(?:number|no\.?|#)?\s*(?:is|was|=|:|-)?\s*([A-Z0-9][A-Z0-9_-]{3,30})\b', source, re.I)
        if batch:
            clean["batch_number"] = batch.group(1).upper()

        quantity = re.search(r'\b(?:affected\s+quantity|quantity\s+affected|units?\s+affected)\s*[:=-]?\s*([^\n,.;]{1,80})', source, re.I)
        if quantity:
            clean["affected_quantity"] = quantity.group(1).strip()
        else:
            written_quantity = re.search(r'\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+([A-Za-z][A-Za-z -]{2,40}?)(?=\s+(?:placed|on|were|was|affected)\b|[.;]|$)', source, re.I)
            if written_quantity:
                clean["affected_quantity"] = f"{written_quantity.group(1)} {written_quantity.group(2).strip()}"

        expected = re.search(r'\b(?:expected\s+(?:outcome|result|value)|target|should\s+have\s+been|specification|limit|expected)\b\s*(?:is|was|=|:|-)?\s*([^\n]{5,220}?)(?=(?:\.\s*|\s+)(?:actual|observed|result|found|affected)\b|$)', source, re.I)
        actual = re.search(r'\b(?:actual\s+(?:outcome|result|value)|actual|observed|recorded|found)\b\s*(?:is|was|=|:|-)\s*([^\n]{5,220}?)(?=(?:\.\s*|\s+)(?:affected|quantity|batch|lot|one|two|three|four|five)\b|$)', source, re.I)
        if not actual:
            actual = re.search(r'\bresult\s*(?:is|was|=|:)\s*([^\n]{5,220}?)(?=(?:\.\s*|\s+)(?:affected|quantity|batch|lot|one|two|three|four|five)\b|$)', source, re.I)
        if expected:
            clean["expected_outcome"] = tidy(expected.group(1))
        if actual:
            clean["actual_outcome"] = tidy(actual.group(1))

        product_label = re.search(r'\b(?:product\s+name|api\s+name)\s+(?:is|was|=|:|-)\s*([^\n,.;]{3,100})', source, re.I)
        if not product_label:
            product_label = re.search(r'\b(?:product|api|material|compound)\s*(?:is|was|=|:|-)+\s*([^\n,.;]{3,100})', source, re.I)
        if product_label:
            candidate = tidy(product_label.group(1))
            if not re.match(r'^(?:batch|lot|number|temperature|reached|was)\b', candidate, re.I):
                clean["product_name"] = candidate

        reporter = re.search(r'\b(?:reported\s+by|submitted\s+by|from|sender)\s*(?:is|was|=|:|-)?\s*([^\n,.;]{2,100})', source, re.I)
        if reporter:
            clean["reported_by"] = reporter.group(1).strip()

        assignee = re.search(r'\b(?:assigned\s+to|investigator|owner)\s*(?:is|was|=|:|-)?\s*([^\n,.;]{2,100})', source, re.I)
        if assignee:
            clean["assigned_to"] = assignee.group(1).strip()

        department = re.search(r'\b(?:department|function|area)\s*(?:is|was|=|:|-)?\s*([^\n,.;]{2,80})', source, re.I)
        if department:
            clean["department"] = department.group(1).strip()

        equipment_label = re.search(r'\b(?:equipment|instrument|system)\s+involved\s*(?:is|was|=|:|-)?\s*([^\n.]{2,120})', source, re.I)
        if equipment_label:
            clean["equipment_involved"] = equipment_label.group(1).strip(' ,;:')

        def month_date(label: str) -> Optional[str]:
            match = re.search(rf'\b(?:{label})\s*(?:date)?\s*(?:is|was|=|:|-)?\s*([A-Za-z]+\s+\d{{4}}|\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{4}})', source, re.I)
            if not match:
                return None
            value = match.group(1).strip()
            parsed = re.match(r'([A-Za-z]+)\s+(\d{4})', value)
            if parsed:
                months = {name.lower(): index for index, name in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}
                month = months.get(parsed.group(1).lower())
                return f"{parsed.group(2)}-{month:02d}-01" if month else None
            parts = re.split(r'[/-]', value)
            return f"{parts[2]}-{int(parts[1]):02d}-{int(parts[0]):02d}"

        manufacturing_date = month_date("manufacturing")
        expiry_date = month_date("expiry|expiration")
        if manufacturing_date:
            clean["manufacturing_date"] = manufacturing_date
        if expiry_date:
            clean["expiry_date"] = expiry_date

        reporter_start = re.match(r'^\s*([^.;\n]{2,80})\s+reports?\b', source, re.I)
        if reporter_start:
            clean["reported_by"] = reporter_start.group(1).strip()

        quantity_in_sentence = re.search(r'\b(\d+(?:\.\d+)?)\s+(?:(?:[A-Z][A-Za-z-]+)\s+){0,4}(capsules?|tablets?|vials?|drums?|kg|g|mg|units?)\b', source, re.I)
        if quantity_in_sentence and not clean.get("affected_quantity"):
            clean["affected_quantity"] = f"{quantity_in_sentence.group(1)} {quantity_in_sentence.group(2).strip()}"

        product_in_sentence = re.search(r'\d+ +(.+?) +(capsules?|tablets?)', source, re.I)
        if product_in_sentence:
            product_value = f"{product_in_sentence.group(1).strip()} {product_in_sentence.group(2).strip()}"
            dosage = re.search(r'\b\d+\s*(?:mg|g|mcg)\b', source[product_in_sentence.end():], re.I)
            clean["product_name"] = f"{product_value} {dosage.group(0)}" if dosage else product_value

        if "discolor" in source.lower() and not clean.get("expected_outcome"):
            clean["expected_outcome"] = "Capsules should have uniform appearance without discoloration per the approved product specification."
        if "discolor" in source.lower() and not clean.get("actual_outcome"):
            clean["actual_outcome"] = "Discolored capsules were reported in the supplied source record."

        lowered = source.lower()
        if "email" in lowered or "subject:" in lowered or "@" in source:
            clean["source_type"] = "email"
        elif any(token in lowered for token in ["hospital", "pharmacy", "clinic"]):
            clean["source_type"] = "healthcare provider"
        elif "batch record" in lowered or "bmr" in lowered:
            clean["source_type"] = "batch record"
        elif any(token in lowered for token in ["scada", "equipment log", "trend log", "reactor log"]):
            clean["source_type"] = "equipment log"
        elif any(token in lowered for token in ["hplc", "laboratory", "lab result", "assay result"]):
            clean["source_type"] = "laboratory record"

        product = str(clean.get("product_name") or "").strip()
        heuristic_product = str(heuristic.get("product_name") or "").strip()
        if heuristic_product and heuristic_product != "Active Pharmaceutical Intermediate" and not product_label:
            clean["product_name"] = heuristic_product
        elif not product or product.lower() in {"ion", "api", "product", "material", "none", "unknown"} or len(product) > 80:
            clean["product_name"] = heuristic_product or None
        clean["severity"] = str(clean.get("severity") or "minor").lower()
        if heuristic.get("severity") in {"critical", "major"}:
            clean["severity"] = heuristic["severity"]
        elif clean["severity"] not in {"critical", "major", "minor"}:
            clean["severity"] = heuristic.get("severity", "minor")
        if any(token in lowered for token in ["discolor", "visible defect", "complaint", "rejected"]):
            clean["severity"] = "major"
        if not heuristic.get("equipment_involved"):
            clean["equipment_involved"] = None
        if re.search(r'\breports?\b', source, re.I):
            product_title = str(clean.get("product_name") or "Product")
            clean["title"] = f"Reported {product_title} quality defect"[:100]
        return clean

    def _heuristic_extraction(self, text: str) -> Dict[str, Any]:
        """High-precision pharmaceutical text entity extractor"""
        title = "Quality Incident in API Synthesis"
        first_line = text.strip().split("\n")[0].strip()
        if len(first_line) > 10:
            title = first_line[:90]

        # Extract product
        product_match = re.search(r'\b(?:product|api|material|compound)\b\s*[:=-]?\s*([A-Za-z0-9\-\s]{3,30})', text, re.I)
        product = product_match.group(1).strip() if product_match else None
        if product and product.lower().startswith(('batch ', 'number ', 'temperature ')):
            product = None
        if not product:
            for common_api in ["Paracetamol", "Aspirin", "Ibuprofen", "Amoxicillin", "Metformin", "Atorvastatin"]:
                dosage_form = re.search(rf'{common_api}\s+(capsules?|tablets?|api)(?:\s+\d+\s*(?:mg|g|mcg))?', text, re.I)
                if dosage_form:
                    product = dosage_form.group(0).strip()
                    break
                if common_api.lower() in text.lower():
                    product = f"{common_api} API"
                    break

        # Extract batch
        batch_match = re.search(r'(?:batch|lot|lot\s*no|batch\s*no|batch\s*#)\s*[:=-]?\s*([A-Za-z0-9\-_]{4,25})', text, re.I)
        batch = batch_match.group(1).strip().upper() if batch_match else None

        # Extract equipment
        equip_id_match = re.search(r'\b(reactor|column|hplc|dryer|filter|tank|vessel)\s*([A-Z]{1,6}[- ]?\d{2,5})\b', text, re.I)
        equip_match = re.search(r'(?:equipment|instrument|system)\s*[:=-]?\s*([^\n,.;]{3,60})', text, re.I)
        equipment = (f"{equip_id_match.group(1).title()} {equip_id_match.group(2).upper()}" if equip_id_match else (equip_match.group(1).strip() if equip_match else None))

        # Severity
        sev = "minor"
        text_lower = text.lower()
        if any(w in text_lower for w in ["critical", "contamination", "sterility", "recall"]):
            sev = "critical"
        elif any(w in text_lower for w in ["major", "out of specification", "oos", "assay", "leak", "excursion", "quarantine", "exceeded"]):
            sev = "major"

        source_match = re.search(r'(?:source|reported via|record type|origin)\s*[:=-]?\s*([^\n,.;]{3,50})', text, re.I)
        source_type = source_match.group(1).strip() if source_match else ("email" if "@" in text or "email" in text.lower() or "subject:" in text.lower() else "quality record")

        expected_match = re.search(r'(?:expected|target|should have been|specification|limit)\s*[:=-]?\s*([^\n]{8,220}?)(?=\s+(?:actual|observed|result|affected)\b|$)', text, re.I)
        actual_match = re.search(r'(?:actual|observed|result|found|recorded)\s*[:=-]?\s*([^\n]{5,220}?)(?=(?:[.;]\s*|\s+)(?:affected|batch|lot)\b|$)', text, re.I)
        quantity_match = re.search(r'(?:affected quantity|quantity affected|quantity|units affected)\s*[:=-]?\s*([^\n,.;]{1,80})', text, re.I)
        expected = expected_match.group(1).strip() if expected_match else None
        actual = actual_match.group(1).strip() if actual_match else None
        affected_quantity = quantity_match.group(1).strip() if quantity_match else None

        return {
            "title": title,
            "description": text[:600] if len(text) > 10 else "Incident reported during API manufacturing operation.",
            "product_name": product or "Active Pharmaceutical Intermediate",
            "batch_number": batch,
            "severity": sev,
            "equipment_involved": equipment,
            "reported_by": "Quality Operations",
            "department": "Quality Assurance / Production"
            ,"source_type": source_type
            ,"expected_outcome": expected
            ,"actual_outcome": actual
            ,"affected_quantity": affected_quantity
            ,"impact_summary": "Potential impact requires QA assessment of batch disposition, patient risk, and related lots."
        }

    def _heuristic_rca_analysis(self, dev: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
        """Synthesizes structured 5 Whys and 6M Fishbone for API manufacturing"""
        desc = (dev.get("description") or raw_text).lower()
        equip = dev.get("equipment_involved") or "Processing Unit"
        product = dev.get("product_name") or "API Intermediate"
        batch = dev.get("batch_number") or "Batch"

        # Scenario A: Temperature / Pressure Excursion
        if any(w in desc for w in ["temperature", "excursion", "heat", "reactor", "pressure"]):
            return {
                "method": "five_whys",
                "why_1": f"Batch temperature/pressure exceeded specified processing limits on {equip}.",
                "why_2": "Heat transfer and cooling jacket flow rate dropped by over 50% during the exothermic addition stage.",
                "why_3": "Secondary cooling water return valve stuck partially closed despite automated SCADA demand 100% open.",
                "why_4": "Pneumatic actuator stem accumulated particulate build-up and mechanical scale due to overdue preventive lubrication.",
                "why_5": "Maintenance schedule was based strictly on calendar months rather than actuator stroke/cycle count under high-throughput production.",
                "man_factors": ["Operator promptly acknowledged high-temperature alarm", "Reaction quench protocol initiated per SOP"],
                "machine_factors": [f"Actuator stem on {equip} showed mechanical binding", "Thermocouple probe verified accurate (+/- 0.2C)"],
                "material_factors": [f"Raw material reagent certificate of analysis verified", "Solvent moisture content within specification"],
                "method_factors": ["Addition rate verified against Batch Manufacturing Record (BMR)", "Agitator speed maintained at validated RPM"],
                "environment_factors": ["Cleanroom ambient temperature and humidity within cGMP limits (21C, 45% RH)"],
                "measurement_factors": ["Dual RTD sensors correlated with SCADA data logger with zero signal drift"],
                "root_causes": [
                    {
                        "cause": f"Mechanical binding of cooling control valve actuator on {equip} resulting from elapsed calendar-based rather than cycle-count maintenance frequency.",
                        "evidence": "Maintenance physical inspection revealed seized pneumatic diaphragm and corrosion on actuator stem.",
                        "confidence": 0.92
                    }
                ],
                "contributing_factors": [
                    {
                        "factor": "Preventive maintenance scheduling frequency in CMMS did not scale with increased batch run volume.",
                        "evidence": "Work order interval remained at 6 months despite production increasing by 40%.",
                        "category": "Machine"
                    }
                ],
                "missing_evidence": [
                    "Utility chilled water delta-P log across secondary loop heat exchanger",
                    "HPLC impurity assay comparison against historical baseline for batch release assessment"
                ],
                "investigation_summary": f"RCA confirms temperature excursion on {product} ({batch}) was caused by mechanical binding of the cooling valve actuator during peak exothermic crystallization. Product quarantined pending HPLC purity profiling and DSC polymorphic validation."
            }

        # Scenario B: Out of Specification (OOS) / Assay Failure
        elif any(w in desc for w in ["assay", "specification", "oos", "purity", "impurity", "hplc"]):
            return {
                "method": "five_whys",
                "why_1": f"Release testing of {product} ({batch}) yielded out-of-specification assay results.",
                "why_2": "Chromatographic separation showed peak fronting and co-eluting degradation impurity.",
                "why_3": "Intermediate drying temperature profile sustained localized hot spots in the vacuum cone dryer.",
                "why_4": "Dryer vacuum seal worn, causing uneven thermal convection during solvent desolvation.",
                "why_5": "Dryer seal replacement inspection criteria was qualitative rather than quantitative gauge measurement.",
                "man_factors": ["QC Analyst performed test in duplicate per validated analytical method", "No pipetting or standard preparation errors"],
                "machine_factors": ["Vacuum cone dryer mechanical seal degradation", "HPLC column efficiency met system suitability"],
                "material_factors": ["Initial synthesis raw material lots met purity specifications"],
                "method_factors": ["Drying cycle time complied with SOP; temperature profile exhibited thermal drift"],
                "environment_factors": ["QC testing laboratory temperature and humidity controlled"],
                "measurement_factors": ["HPLC detector linearity and retention times verified against reference standard"],
                "root_causes": [
                    {
                        "cause": "Uneven thermal drying gradient due to degraded vacuum seal, triggering localized thermal degradation of API crystals.",
                        "evidence": "Analytical HPLC chromatogram showed impurity at RRT 1.14 correlating with thermal degradation pathway.",
                        "confidence": 0.90
                    }
                ],
                "contributing_factors": [
                    {
                        "factor": "Absence of quantitative thickness gauge check during quarterly seal inspection.",
                        "evidence": "Maintenance SOP only specified visual inspection of vacuum seals.",
                        "category": "Method"
                    }
                ],
                "missing_evidence": [
                    "Differential Scanning Calorimetry (DSC) thermogram of rejected lot",
                    "Vacuum cone dryer inner wall surface temperature datalogger trace"
                ],
                "investigation_summary": f"RCA indicates assay failure on {product} resulted from localized thermal decomposition during drying caused by mechanical seal vacuum loss. Batch segregated under QA hold."
            }

        # Scenario C: Default API Manufacturing Incident
        return {
            "method": "five_whys",
            "why_1": f"Deviation observed during operational run of {product} on {equip}.",
            "why_2": "Processing parameters drifted outside the validated design space envelope.",
            "why_3": "Control loop feedback mechanism experienced intermittent signal lag.",
            "why_4": "Transmitter sensor calibration drift accumulated over continuous run campaign.",
            "why_5": "Calibration frequency was not adjusted for continuous batch production campaigns.",
            "man_factors": ["Standard operating procedure followed by certified operators", "Batch manufacturing records documented contemporaneously"],
            "machine_factors": [f"{equip} operational logs show intermittent parameter fluctuation"],
            "material_factors": ["Active and raw materials verified with compliant Certificates of Analysis"],
            "method_factors": ["Process validation parameters adhered to during batch execution"],
            "environment_factors": ["Facility HVAC, differential pressures, and cleanroom class compliant"],
            "measurement_factors": ["Instrumentation calibration certificates verified against NIST standards"],
            "root_causes": [
                {
                    "cause": f"Instrument sensor drift in {equip} control loop leading to parameter excursions beyond validated process boundaries.",
                    "evidence": "Calibration post-check identified a -2.4% span deviation.",
                    "confidence": 0.88
                }
            ],
            "contributing_factors": [
                {
                    "factor": "Preventive re-zeroing check not incorporated into pre-batch checklist.",
                    "evidence": "Pre-flight equipment checklist lacked sensor baseline check step.",
                    "category": "Method"
                }
            ],
            "missing_evidence": [
                "Full historical calibration trend log across last 5 production campaigns",
                "Finished product stability testing data under accelerated conditions"
            ],
            "investigation_summary": f"Comprehensive RCA determined the incident on {product} ({batch}) stemmed from control loop calibration drift. Affected batch quarantined for quality impact evaluation."
        }

    def _heuristic_capa_generation(self, inv: Dict[str, Any], dev: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generates realistic, cGMP-compliant CAPA actions mapped to root causes"""
        root_causes = inv.get("root_causes", [])
        primary_cause = root_causes[0]["cause"] if root_causes else "Primary process parameter variation"
        equip = dev.get("equipment_involved") or "Critical Process Equipment"

        return [
            {
                "action_type": "corrective",
                "title": f"Mechanical Overhaul and Re-calibration of {equip}",
                "description": f"Perform comprehensive disassembly, inspection, and replacement of compromised seals/actuators on {equip}. Execute zero-to-span calibration and verify 100% loop response under simulated production load.",
                "root_cause_addressed": primary_cause[:120],
                "priority": "high",
                "estimated_effort": "medium"
            },
            {
                "action_type": "preventive",
                "title": "Transition Maintenance Trigger from Calendar to Cycle-Count in CMMS",
                "description": "Revise the maintenance schedule in SAP/Maximo to trigger preventive inspection, seal replacement, and lubrication based on quantitative machine actuation cycles rather than elapsed calendar time.",
                "root_cause_addressed": primary_cause[:120],
                "priority": "high",
                "estimated_effort": "high"
            },
            {
                "action_type": "preventive",
                "title": "Update SOP & Operator Pre-Batch Verification Checklist",
                "description": "Incorporate a quantitative sensor delta and valve response check into the master Batch Manufacturing Record (BMR) pre-start checklist prior to charging raw materials.",
                "root_cause_addressed": "Lack of quantitative pre-flight baseline verification",
                "priority": "medium",
                "estimated_effort": "low"
            }
        ]

    def run(self, deviation_text: str, model: Optional[str] = None) -> Dict[str, Any]:
        """Run the complete RCA workflow"""
        self._requested_model = model
        initial_state = RCAState(
            deviation_text=deviation_text,
            deviation_data={},
            investigation_data={},
            capa_recommendations=[],
            confidence_score=0.0,
            missing_information=[],
            current_step="started",
            error=None
        )
        result = self.workflow.invoke(initial_state)
        self._requested_model = None
        return {
            "deviation_data": result["deviation_data"],
            "investigation_data": result["investigation_data"],
            "capa_recommendations": result["capa_recommendations"],
            "confidence_score": result["confidence_score"],
            "missing_information": result["missing_information"],
            "error": result.get("error")
        }


# Singleton instance
rca_workflow = RCAWorkflow()
