import type { Model } from '../domain/model';

export function IssueLink({ model, issueKey }: { model: Model; issueKey: string }) {
  if (!model.jiraBaseUrl) return <span className="tabular whitespace-nowrap">{issueKey}</span>;
  return (
    <a
      href={`${model.jiraBaseUrl}/browse/${issueKey}`}
      target="_blank"
      rel="noreferrer"
      className="tabular whitespace-nowrap text-accent hover:underline"
    >
      {issueKey}
    </a>
  );
}
