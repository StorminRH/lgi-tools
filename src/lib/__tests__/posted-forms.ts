/**
 * What each form in server-rendered markup would post: its action and its
 * hidden fields as name/value strings, the shape a route's form schema parses.
 * Values come back as React wrote them, so keep fixture values free of the
 * characters it escapes: ampersands, quotes and angle brackets.
 */
export function postedForms(markup: string) {
  return [...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(([, attributes = '', body = '']) => ({
    action: attribute(attributes, 'action'),
    fields: Object.fromEntries(
      [...body.matchAll(/<(\w+)\b([^>]*)>/g)]
        .filter(([, tag, input = '']) => tag === 'input' && attribute(input, 'type') === 'hidden')
        .map(([, , input = '']): [string, string] => [attribute(input, 'name') ?? '', attribute(input, 'value') ?? '']),
    ),
  }));
}

/** The one form in markup; throws unless there is exactly one. */
export function postedForm(markup: string) {
  const forms = postedForms(markup);
  const [form] = forms;
  if (!form || forms.length > 1) throw new Error(`expected one form, found ${forms.length}`);
  return form;
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
}
