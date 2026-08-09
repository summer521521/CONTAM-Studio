import { useTranslation } from "react-i18next";
import type { AiConversationEntry, AiSemanticPatchSuggestion } from "../../../app/ai-state";
import type { SemanticSnapshot } from "../../../app/semantic-state";
import { AssistantPatchProposal } from "./AssistantPatchProposal";

export function AssistantConversation({ entries, snapshot, onReviewPatch }: { entries: AiConversationEntry[]; snapshot: SemanticSnapshot | null; onReviewPatch: (patch: AiSemanticPatchSuggestion) => void }) {
  const { t } = useTranslation();
  if (!entries.length) return null;
  return <section className="assistant-conversation" aria-labelledby="ai-conversation-title"><h3 id="ai-conversation-title">{t("assistant.conversation")}</h3>{entries.map((entry, index) => <article className="assistant-answer" key={entry.turn_id}><h4>{t("assistant.turn", { number: index + 1 })}</h4><section><h5>{t("assistant.completedQuestion")}</h5><p>{entry.question}</p></section><section><h5>{t("assistant.facts")}</h5><ul>{entry.answer.deterministic_facts.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h5>{t("assistant.interpretation")}</h5><p>{entry.answer.interpretation}</p></section><section><h5>{t("assistant.limitations")}</h5><ul>{entry.answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>{entry.answer.suggested_questions.length ? <section><h5>{t("assistant.suggestedQuestions")}</h5><ul>{entry.answer.suggested_questions.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}{entry.answer.semantic_patch ? <AssistantPatchProposal patch={entry.answer.semantic_patch} snapshot={snapshot} onReview={onReviewPatch} /> : null}<p className="assistant-safe-note">{t("assistant.factsCaveat")}</p></article>)}</section>;
}
