import { useTranslation } from "react-i18next";
import type { AiIntent } from "../../../app/ai-state";

const INTENTS: AiIntent[] = ["explain_object", "diagnose_run_result", "propose_change", "simulation_plan"];

export function AssistantIntentSelector({ value, disabled, onChange }: { value: AiIntent; disabled: boolean; onChange: (intent: AiIntent) => void }) {
  const { t } = useTranslation();
  return <fieldset className="assistant-intents" disabled={disabled}><legend>{t("assistant.intent.title")}</legend>{INTENTS.map((intent) => <label key={intent}><input type="radio" name="assistant-intent" value={intent} checked={value === intent} onChange={() => onChange(intent)} /><span>{t(`assistant.intent.${intent}`)}</span></label>)}</fieldset>;
}
