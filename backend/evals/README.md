# RCA extraction evaluation set

`rca_extraction_cases.json` contains de-identified regression cases for the intake workflow. Each case checks exact fields that matter to the quality record: product, batch, source, reporter, quantity, severity, and equipment.

Run the cases through `POST /api/v1/intake/copilot` and compare only the fields listed in `expected`. A model change should not be accepted if it lowers exact-match accuracy for batch numbers, quantities, or dates.

This is prompt/schema tuning, not a weight update. Groq documents custom fine-tuning as closed beta; a true fine-tuned model requires Groq account access to that program.
