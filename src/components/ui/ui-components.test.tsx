import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Field } from "./Field";
import { IconButton } from "./IconButton";
import { InlineNotice } from "./InlineNotice";
import { PanelHeader } from "./PanelHeader";
import { StatusTag } from "./StatusTag";
import { Disclosure } from "./Disclosure";
import { LoadingState } from "./LoadingState";
import { PageHeader } from "./PageHeader";

describe("foundation UI components", () => {
  it("keeps button variants, loading state, and icon labels semantic", () => {
    const markup = renderToStaticMarkup(
      <>
        <Button variant="primary" loading icon={<span aria-hidden="true">+</span>}>Save</Button>
        <IconButton label="Open settings">⚙</IconButton>
      </>,
    );
    expect(markup).toContain('class="ui-button ui-button-primary"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('class="ui-icon-button"');
    expect(markup).toContain('aria-label="Open settings"');
  });

  it("provides reusable structure for notices, fields, headers, tags, and empty states", () => {
    const markup = renderToStaticMarkup(
      <>
        <PanelHeader title="Project" description="Current project" />
        <StatusTag tone="success">Ready</StatusTag>
        <InlineNotice tone="warning">Review required</InlineNotice>
        <Field name="model" label="Model" description="Choose from the catalog" />
        <EmptyState title="No project" description="Open a project to continue" />
        <PageHeader eyebrow="Project" title="Classroom" description="Ready to run" />
        <Disclosure label="Advanced diagnostics"><code>details</code></Disclosure>
        <LoadingState label="Loading results" />
      </>,
    );
    expect(markup).toContain('class="ui-panel-header"');
    expect(markup).toContain('data-tone="success"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-describedby="model-description"');
    expect(markup).toContain('class="ui-empty-state"');
    expect(markup).toContain('class="ui-page-header"');
    expect(markup).toContain('class="ui-disclosure"');
    expect(markup).not.toContain('open=""');
    expect(markup).toContain('aria-live="polite"');
  });
});
